// Rota /billing da Edge Function r2-api: checkout, sincronização e cancelamento da assinatura.
// Exige JWT válido do Supabase Auth; toda decisão de acesso é feita no servidor.
import { corsHeaders, json, ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, usuarioAutenticado, rpc, auditar } from '../_shared/supa.ts'
import { mp, mpConfigurado, mpModoTeste } from '../_shared/mp.ts'
import { corpoCriarAssinatura, elegivelArrependimento } from '../_shared/mpLogic.ts'
import { sincronizarUsuario } from '../_shared/sync.ts'
import { processarFilaEmails, siteUrl } from '../_shared/email.ts'

export async function handleBilling(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { erro: 'Método não permitido' }, 405)
  const admin = clienteAdmin()
  try {
    const user = await usuarioAutenticado(req, admin)
    const corpo = await req.json().catch(() => ({}))
    const acao = String(corpo?.acao ?? '')

    if (acao === 'config') {
      return json(req, { pagamentos_configurados: mpConfigurado(), modo_teste: mpModoTeste() })
    }

    if (acao === 'checkout') {
      if (!user.email_confirmed_at) throw new ErroHttp(403, 'Confirme seu e-mail antes de assinar.')
      const estado = await rpc<string>(admin, 'estado_acesso', { uid: user.id })
      if (['ativa', 'tolerancia', 'admin'].includes(estado)) throw new ErroHttp(409, 'Você já possui acesso Premium ativo.')
      const { data: cfg } = await admin.from('app_config').select('valor').eq('chave', 'plano').single()
      const plano = cfg!.valor as { nome: string; preco_centavos: number; vendas_ativas?: boolean }
      if (plano.vendas_ativas === false) throw new ErroHttp(403, 'As vendas estão temporariamente suspensas.')

      // Reaproveita um checkout pendente recente com o mesmo preço
      const { data: pendente } = await admin.from('subscriptions')
        .select('checkout_url, preco_centavos, created_at').eq('user_id', user.id).eq('status', 'pendente')
        .gt('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (pendente?.checkout_url && pendente.preco_centavos === plano.preco_centavos) {
        return json(req, { url: pendente.checkout_url, reaproveitado: true })
      }

      const pre = await mp('POST', '/preapproval', corpoCriarAssinatura({
        userId: user.id, email: user.email!, planoNome: plano.nome, precoCentavos: plano.preco_centavos,
        voltarPara: `${siteUrl()}/assinatura/retorno`,
      }), crypto.randomUUID())
      await rpc(admin, 'billing_registrar_assinatura', { p: {
        provider_subscription_id: String(pre.id), user_id: user.id, provider_status: pre.status ?? 'pending',
        preco_centavos: plano.preco_centavos, plano_nome: plano.nome, checkout_url: pre.init_point,
      } })
      await auditar(admin, user.id, 'assinatura.checkout', String(pre.id), { preco_centavos: plano.preco_centavos })
      log('info', 'checkout_criado', { user: user.id, preapproval: pre.id })
      return json(req, { url: pre.init_point })
    }

    if (acao === 'sincronizar') {
      const r = mpConfigurado() ? await sincronizarUsuario(admin, user.id) : { assinaturas: 0, avisos: ['mp_nao_configurado'] }
      await processarFilaEmails(admin, 5)
      const estado = await rpc<string>(admin, 'estado_acesso', { uid: user.id })
      return json(req, { estado, ...r })
    }

    if (acao === 'cancelar') {
      const { data: sub } = await admin.from('subscriptions')
        .select('*').eq('user_id', user.id).in('status', ['ativa', 'inadimplente', 'pendente'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!sub) throw new ErroHttp(404, 'Nenhuma assinatura ativa para cancelar.')
      const { data: cfg } = await admin.from('app_config').select('valor').eq('chave', 'plano').single()
      const dias = Number((cfg!.valor as Record<string, unknown>).arrependimento_dias ?? 7)

      if (sub.provider_subscription_id) {
        await mp('PUT', `/preapproval/${encodeURIComponent(sub.provider_subscription_id)}`, { status: 'cancelled' })
      }

      // Direito de arrependimento: reembolso integral dos pagamentos do período inicial.
      // Uma falha no reembolso NUNCA desfaz o cancelamento: registra para tratamento manual.
      let reembolsado = false
      let reembolsoFalhou = false
      const pedirReembolso = corpo?.reembolso === true
      if (pedirReembolso && elegivelArrependimento(sub.iniciada_em, dias)) {
        const { data: pagos } = await admin.from('payments').select('provider_payment_id')
          .eq('subscription_id', sub.id).eq('status', 'aprovado')
        let okReembolsos = 0
        for (const p of pagos ?? []) {
          try {
            await mp('POST', `/v1/payments/${encodeURIComponent(p.provider_payment_id)}/refunds`, {}, `reembolso-${p.provider_payment_id}`)
            okReembolsos++
          } catch (e) {
            reembolsoFalhou = true
            log('error', 'reembolso_falhou', { pagamento: p.provider_payment_id, erro: String(e) })
            await auditar(admin, user.id, 'assinatura.reembolso_pendente_manual', sub.id,
              { pagamento: p.provider_payment_id, erro: String(e).slice(0, 300) })
          }
        }
        reembolsado = okReembolsos > 0 && !reembolsoFalhou
      }
      const r = await rpc(admin, 'billing_cancelar', { p_sub: sub.id, p_encerrar_agora: reembolsado || sub.status === 'pendente' })
      await auditar(admin, user.id, 'assinatura.cancelada_pelo_usuario', sub.id, { reembolso: reembolsado, reembolso_falhou: reembolsoFalhou })
      await processarFilaEmails(admin, 5)
      return json(req, {
        ok: true, reembolsado,
        aviso: reembolsoFalhou
          ? 'A assinatura foi cancelada, mas o reembolso automático falhou. Nossa equipe fará o estorno manualmente pelo Mercado Pago.'
          : undefined,
        assinatura: r,
      })
    }

    // Diagnóstico da integração (somente admin): mostra a resposta completa do Mercado Pago
    if (acao === 'diagnostico') {
      if (!(await rpc<boolean>(admin, 'is_admin', { uid: user.id }))) throw new ErroHttp(403, 'Acesso negado')
      const token = Deno.env.get('MP_ACCESS_TOKEN') ?? ''
      const bruto = async (metodo: string, caminho: string, corpoReq?: unknown) => {
        try {
          const r = await fetch('https://api.mercadopago.com' + caminho, {
            method: metodo,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: corpoReq ? JSON.stringify(corpoReq) : undefined,
            signal: AbortSignal.timeout(15000),
          })
          return { status: r.status, corpo: await r.json().catch(() => null) }
        } catch (e) { return { status: 0, corpo: String(e) } }
      }
      const me = await bruto('GET', '/users/me')
      let preapproval = null
      if (typeof corpo?.payer_email === 'string' && corpo.payer_email.includes('@')) {
        preapproval = await bruto('POST', '/preapproval', corpoCriarAssinatura({
          userId: user.id, email: corpo.payer_email, planoNome: 'R2 Fit Pro Premium', precoCentavos: 1990,
          voltarPara: `${siteUrl()}/assinatura/retorno`,
        }))
        // Cancela imediatamente se por acaso criou
        if (preapproval.status === 201 && preapproval.corpo?.id) {
          await bruto('PUT', `/preapproval/${preapproval.corpo.id}`, { status: 'cancelled' })
        }
      }
      return json(req, {
        colecionador: { status: me.status, id: me.corpo?.id, nickname: me.corpo?.nickname, email: me.corpo?.email, site: me.corpo?.site_id, teste: me.corpo?.tags },
        preapproval,
      })
    }

    if (acao === 'processar_emails') {
      if (!(await rpc<boolean>(admin, 'is_admin', { uid: user.id }))) throw new ErroHttp(403, 'Acesso negado')
      if (corpo?.reenviar_sem_provedor) {
        await admin.from('email_outbox').update({ status: 'pendente' }).eq('status', 'sem_provedor')
      }
      return json(req, await processarFilaEmails(admin, 25))
    }

    throw new ErroHttp(400, 'Ação inválida')
  } catch (e) {
    if (e instanceof ErroHttp) return json(req, { erro: e.message, codigo: e.codigo }, e.status)
    log('error', 'billing_erro', { erro: String(e) })
    return json(req, { erro: 'Erro interno. Tente novamente.' }, 500)
  }
}
