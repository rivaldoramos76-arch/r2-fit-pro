// Rota /conta da Edge Function r2-api: exclusão definitiva da conta (LGPD art. 18).
import { corsHeaders, json, ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, usuarioAutenticado, auditar } from '../_shared/supa.ts'
import { mp, mpConfigurado } from '../_shared/mp.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'

/** Exclui a conta: cancela cobranças futuras, registra o pedido (LGPD), apaga arquivos e o usuário.
 *  Dados pessoais saem em cascata; registros financeiros ficam anonimizados (user_id nulo). */
export async function excluirUsuario(admin: SupabaseClient, alvo: { id: string; email: string | null }, autorId: string, motivo: string) {
  // Interrompe cobranças futuras antes de excluir
  const { data: subs } = await admin.from('subscriptions').select('id, provider_subscription_id, status')
    .eq('user_id', alvo.id).in('status', ['ativa', 'inadimplente', 'pendente']).neq('modalidade', 'teste')
  for (const s of subs ?? []) {
    if (s.provider_subscription_id) {
      if (!mpConfigurado()) throw new ErroHttp(409, 'Não foi possível cancelar a assinatura no Mercado Pago agora. Tente mais tarde.')
      await mp('PUT', `/preapproval/${encodeURIComponent(s.provider_subscription_id)}`, { status: 'cancelled' })
    }
    await admin.rpc('billing_cancelar', { p_sub: s.id, p_encerrar_agora: true })
  }

  await admin.from('privacy_requests').insert({
    user_id: alvo.id, email: alvo.email, tipo: 'exclusao', status: 'concluida',
    detalhes: motivo, concluida_em: new Date().toISOString(),
  })
  await auditar(admin, autorId, 'conta.excluida', alvo.id, { assinaturas_canceladas: subs?.length ?? 0, motivo })

  // Remove arquivos pessoais
  const { data: arquivos } = await admin.storage.from('avatars').list(alvo.id, { limit: 100 })
  if (arquivos?.length) await admin.storage.from('avatars').remove(arquivos.map(a => `${alvo.id}/${a.name}`))

  const { error } = await admin.auth.admin.deleteUser(alvo.id)
  if (error) throw error
}

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

    await excluirUsuario(admin, { id: user.id, email: user.email ?? null }, user.id, 'Exclusão solicitada pelo próprio titular no aplicativo')
    log('info', 'conta_excluida', { user: user.id })
    return json(req, { ok: true })
  } catch (e) {
    if (e instanceof ErroHttp) return json(req, { erro: e.message, codigo: e.codigo }, e.status)
    log('error', 'conta_erro', { erro: String(e) })
    return json(req, { erro: 'Erro interno. Tente novamente.' }, 500)
  }
}
