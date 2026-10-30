// Rota /billing da Edge Function r2-api: checkout, sincronização e cancelamento da assinatura.
// Exige JWT válido do Supabase Auth; toda decisão de acesso é feita no servidor.
import { corsHeaders, json, ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, usuarioAutenticado, rpc, auditar } from '../_shared/supa.ts'
import { mp, mpConfigurado, mpModoTeste } from '../_shared/mp.ts'
import { corpoCriarAssinatura, corpoAssinaturaCartao, corpoPreferenciaAvulsa, elegivelArrependimento, motivoRecusaCartao } from '../_shared/mpLogic.ts'
import { sincronizarUsuario, registrarPagamentoDoUsuario } from '../_shared/sync.ts'
import { processarFilaEmails, siteUrl } from '../_shared/email.ts'

interface PlanoVenda { nome: string; preco_centavos: number; preco_anual_centavos?: number | null; parcelas_max_anual?: number; vendas_ativas?: boolean }

/** Identificação do aparelho (security.js do Mercado Pago), enviada no header X-meli-session-id. */
// deno-lint-ignore no-explicit-any
function dispositivo(corpo: any): Record<string, string> | undefined {
  const id = typeof corpo?.device_id === 'string' ? corpo.device_id.trim() : ''
  return /^[\w.:-]{1,200}$/.test(id) ? { 'X-meli-session-id': id } : undefined
}

/** Motivo da recusa: a validação do cartão gera um pagamento recusado com o status_detail. */
async function motivoRecusa(userId: string): Promise<string | null> {
  for (const espera of [0, 1500]) {
    if (espera) await new Promise(r => setTimeout(r, espera))
    try {
      // deno-lint-ignore no-explicit-any
      const r = await mp<any>('GET', `/v1/payments/search?external_reference=${encodeURIComponent(userId)}&sort=date_created&criteria=desc&limit=1`)
      const p = r?.results?.[0]
      if (p?.status === 'rejected' && Date.now() - new Date(p.date_created).getTime() < 5 * 60_000) return motivoRecusaCartao(p.status_detail)
    } catch (e) { log('warn', 'motivo_recusa', { erro: String(e) }); return null }
  }
  return null
}

// deno-lint-ignore no-explicit-any
async function planoParaVenda(admin: any, user: { email_confirmed_at?: string | null }): Promise<PlanoVenda> {
  if (!user.email_confirmed_at) throw new ErroHttp(403, 'Confirme seu e-mail antes de assinar.')
  const { data: cfg } = await admin.from('app_config').select('valor').eq('chave', 'plano').single()
  const plano = cfg!.valor as PlanoVenda
  if (plano.vendas_ativas === false) throw new ErroHttp(403, 'As vendas estão temporariamente suspensas.')
  return plano
}

export async function handleBilling(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { erro: 'Método não permitido' }, 405)
  const admin = clienteAdmin()
  try {
    const user = await usuarioAutenticado(req, admin)
    const corpo = await req.json().catch(() => ({}))
    const acao = String(corpo?.acao ?? '')

    if (acao === 'config') {
      return json(req, {
        pagamentos_configurados: mpConfigurado(), modo_teste: mpModoTeste(),
        public_key: Deno.env.get('MP_PUBLIC_KEY') ?? null,
      })
    }

    // Assinatura mensal no cartão sem conta Mercado Pago (cartão tokenizado no navegador pelo Card Payment Brick)
    if (acao === 'assinar_cartao') {
      const plano = await planoParaVenda(admin, user)
      const estado = await rpc<string>(admin, 'estado_acesso', { uid: user.id })
      if (['ativa', 'tolerancia', 'admin'].includes(estado)) throw new ErroHttp(409, 'Você já possui acesso Premium ativo.')
      // deno-lint-ignore no-explicit-any
      let pre: any
      try {
        pre = await mp('POST', '/preapproval', corpoAssinaturaCartao({
          userId: user.id, email: user.email!, planoNome: plano.nome, precoCentavos: plano.preco_centavos,
          voltarPara: `${siteUrl()}/assinatura/retorno`, cardTokenId: String(corpo?.card_token_id ?? ''),
        }), crypto.randomUUID(), dispositivo(corpo))
      } catch (e) {
        const motivo = e instanceof ErroHttp && e.codigo === 'mp_erro' ? await motivoRecusa(user.id) : null
        if (motivo) throw new ErroHttp(400, motivo, 'cartao_recusado')
        throw e
      }
      await rpc(admin, 'billing_registrar_assinatura', { p: {
        provider_subscription_id: String(pre.id), user_id: user.id, provider_status: pre.status ?? 'authorized',
        preco_centavos: plano.preco_centavos, plano_nome: plano.nome, proxima_cobranca: pre.next_payment_date ?? null,
      } })
      await auditar(admin, user.id, 'assinatura.cartao', String(pre.id), { preco_centavos: plano.preco_centavos, status: pre.status })
      log('info', 'assinatura_cartao_criada', { user: user.id, preapproval: pre.id, status: pre.status })
      // A primeira cobrança costuma sair na hora; o webhook também confirma depois
      await sincronizarUsuario(admin, user.id).catch(e => log('warn', 'sincronizar_apos_cartao', { erro: String(e) }))
      await processarFilaEmails(admin, 5)
      return json(req, { ok: true, status: pre.status, estado: await rpc<string>(admin, 'estado_acesso', { uid: user.id }) })
    }

    // Troca do cartão da assinatura recorrente
    if (acao === 'trocar_cartao') {
      const { data: sub } = await admin.from('subscriptions').select('id, provider_subscription_id')
        .eq('user_id', user.id).eq('modalidade', 'recorrente').in('status', ['ativa', 'inadimplente'])
        .not('provider_subscription_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!sub) throw new ErroHttp(404, 'Nenhuma assinatura com renovação automática encontrada.')
      const token = String(corpo?.card_token_id ?? '')
      if (!token || token.length > 200) throw new ErroHttp(400, 'Cartão inválido.')
      await mp('PUT', `/preapproval/${encodeURIComponent(sub.provider_subscription_id!)}`, { card_token_id: token }, undefined, dispositivo(corpo))
      await auditar(admin, user.id, 'assinatura.cartao_trocado', sub.id, {})
      return json(req, { ok: true })
    }

    // Compra de 1 ou 12 meses pelo Checkout Pro: Pix, boleto, cartão de crédito/débito, saldo Mercado Pago
    if (acao === 'checkout_avulso') {
      const plano = await planoParaVenda(admin, user)
      const periodo = corpo?.periodo === 'anual' ? 'anual' : 'mensal'
      const preco = periodo === 'anual' ? plano.preco_anual_centavos : plano.preco_centavos
      if (!preco) throw new ErroHttp(400, 'O plano anual não está disponível no momento.')
      const estado = await rpc<string>(admin, 'estado_acesso', { uid: user.id })
      if (estado === 'admin') throw new ErroHttp(409, 'Contas administrativas já têm acesso completo.')
      if (['ativa', 'tolerancia', 'cancelada_vigente'].includes(estado)) {
        // Quem já paga por período pode antecipar a renovação; assinatura automática ou cortesia não precisa
        const { data: outra } = await admin.from('subscriptions').select('id')
          .eq('user_id', user.id).in('modalidade', ['recorrente', 'cortesia']).in('status', ['ativa', 'inadimplente'])
          .gt('periodo_atual_fim', new Date().toISOString()).limit(1).maybeSingle()
        if (outra) throw new ErroHttp(409, 'Sua assinatura já renova automaticamente. Não é preciso pagar à parte.')
      }
      const pref = await mp('POST', '/checkout/preferences', corpoPreferenciaAvulsa({
        userId: user.id, email: user.email!, planoNome: plano.nome, periodo, precoCentavos: preco,
        parcelasMax: plano.parcelas_max_anual ?? 12, site: siteUrl(),
      }), crypto.randomUUID())
      await auditar(admin, user.id, 'assinatura.checkout_avulso', String(pref.id), { periodo, preco_centavos: preco })
      log('info', 'checkout_avulso_criado', { user: user.id, preferencia: pref.id, periodo })
      return json(req, { url: pref.init_point })
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
      // Retorno do Checkout Pro traz o id do pagamento: registra na hora (só se for deste usuário)
      const pagamentoId = String(corpo?.payment_id ?? '')
      if (mpConfigurado() && /^\d{1,20}$/.test(pagamentoId)) {
        await registrarPagamentoDoUsuario(admin, pagamentoId, user.id).catch(e => log('warn', 'registrar_retorno', { erro: String(e) }))
      }
      const r = mpConfigurado() ? await sincronizarUsuario(admin, user.id) : { assinaturas: 0, avisos: ['mp_nao_configurado'] }
      await processarFilaEmails(admin, 5)
      const estado = await rpc<string>(admin, 'estado_acesso', { uid: user.id })
      return json(req, { estado, ...r })
    }

    if (acao === 'cancelar') {
      const { data: sub } = await admin.from('subscriptions')
        .select('*').eq('user_id', user.id).in('status', ['ativa', 'inadimplente', 'pendente']).not('modalidade', 'in', '(cortesia,teste)')
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
