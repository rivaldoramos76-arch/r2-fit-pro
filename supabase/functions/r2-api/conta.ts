// Rota /conta da Edge Function r2-api: exclusão definitiva da conta (LGPD art. 18).
import { corsHeaders, json, ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, usuarioAutenticado, auditar } from '../_shared/supa.ts'
import { mp, mpConfigurado } from '../_shared/mp.ts'

export async function handleConta(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { erro: 'Método não permitido' }, 405)
  const admin = clienteAdmin()
  try {
    const user = await usuarioAutenticado(req, admin)
    const corpo = await req.json().catch(() => ({}))
    if (corpo?.acao !== 'excluir') throw new ErroHttp(400, 'Ação inválida')
    if (corpo?.confirmacao !== 'EXCLUIR') throw new ErroHttp(400, 'Digite EXCLUIR para confirmar.')

    // Sessão recente obrigatória (o app pede a senha novamente antes de chamar)
    const ultimoLogin = Date.parse(user.last_sign_in_at ?? '')
    if (!Number.isFinite(ultimoLogin) || Date.now() - ultimoLogin > 10 * 60_000) {
      throw new ErroHttp(401, 'Por segurança, confirme sua senha novamente antes de excluir a conta.', 'reautenticar')
    }

    // Interrompe cobranças futuras antes de excluir
    const { data: subs } = await admin.from('subscriptions').select('id, provider_subscription_id, status')
      .eq('user_id', user.id).in('status', ['ativa', 'inadimplente', 'pendente'])
    for (const s of subs ?? []) {
      if (s.provider_subscription_id) {
        if (!mpConfigurado()) throw new ErroHttp(409, 'Não foi possível cancelar sua assinatura agora. Fale com o suporte.')
        await mp('PUT', `/preapproval/${encodeURIComponent(s.provider_subscription_id)}`, { status: 'cancelled' })
      }
      await admin.rpc('billing_cancelar', { p_sub: s.id, p_encerrar_agora: true })
    }

    await admin.from('privacy_requests').insert({
      user_id: user.id, email: user.email, tipo: 'exclusao', status: 'concluida',
      detalhes: 'Exclusão solicitada pelo próprio titular no aplicativo', concluida_em: new Date().toISOString(),
    })
    await auditar(admin, user.id, 'conta.excluida', user.id, { assinaturas_canceladas: subs?.length ?? 0 })

    // Remove arquivos pessoais
    const { data: arquivos } = await admin.storage.from('avatars').list(user.id, { limit: 100 })
    if (arquivos?.length) await admin.storage.from('avatars').remove(arquivos.map(a => `${user.id}/${a.name}`))

    // Exclui o usuário: dados pessoais são removidos em cascata; registros financeiros
    // permanecem anonimizados (user_id nulo) pelo prazo legal de guarda.
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
    log('info', 'conta_excluida', { user: user.id })
    return json(req, { ok: true })
  } catch (e) {
    if (e instanceof ErroHttp) return json(req, { erro: e.message, codigo: e.codigo }, e.status)
    log('error', 'conta_erro', { erro: String(e) })
    return json(req, { erro: 'Erro interno. Tente novamente.' }, 500)
  }
}
