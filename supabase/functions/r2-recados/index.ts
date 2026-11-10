// Edge Function r2-recados: avisa no celular dos administradores a cada recado novo
// ("Fale com o desenvolvedor" na tela inicial e chamados do Suporte).
// Chamada pelo gatilho do banco em support_tickets com um token de uso único gravado em cron_tokens
// (sem segredo compartilhado). Publicada sem verificação de JWT, como a r2-api.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import webpush from 'npm:web-push@3.6.7'

const CATEGORIA: Record<string, string> = {
  sugestao: '💡 Sugestão', bug: '🐞 Erro', dificuldade: '🤔 Dificuldade', outro: '💬 Recado',
  conta: '🙋 Suporte: conta', assinatura: '🙋 Suporte: assinatura', pagamento: '🙋 Suporte: pagamento',
  treino: '🙋 Suporte: treino', dieta: '🙋 Suporte: dieta', calorias: '🙋 Suporte: calorias', privacidade: '🙋 Suporte: privacidade',
}

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const log = (nivel: string, evento: string, dados: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ nivel, evento, ...dados }))

Deno.serve(async req => {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const corpo = await req.json().catch(() => ({}))

  // Token de uso único criado pelo gatilho (válido por 10 minutos)
  const token = String(corpo?.token ?? '')
  if (!/^[0-9a-f]{64}$/.test(token)) return resposta(401, { erro: 'Não autorizado' })
  const { data: usado } = await admin.from('cron_tokens').delete().eq('token', token)
    .gt('created_at', new Date(Date.now() - 10 * 60_000).toISOString()).select('token')
  if (!usado?.length) return resposta(401, { erro: 'Não autorizado' })

  const { data: t } = await admin.from('support_tickets').select('id, user_id, categoria, assunto')
    .eq('id', String(corpo?.chamado ?? '')).maybeSingle()
  if (!t) return resposta(200, { ok: true, ignorado: true })

  const { data: adms } = await admin.from('admins').select('user_id')
  const ids = (adms ?? []).map(a => a.user_id as string).filter(id => id !== t.user_id)
  if (!ids.length) return resposta(200, { ok: true, enviados: 0 })
  const { data: inscricoes } = await admin.from('push_inscricoes').select('id, endpoint, p256dh, auth').in('user_id', ids)
    .not('endpoint', 'like', 'https://app.r2fitpro.com.br/%') // app Android não recebe Web Push
  if (!inscricoes?.length) return resposta(200, { ok: true, enviados: 0 })
  const { data: cfg } = await admin.from('push_config').select('vapid_publica, vapid_privada').eq('id', true).maybeSingle()
  if (!cfg) return resposta(200, { ok: true, enviados: 0, sem_chaves: true })

  const { data: p } = await admin.from('profiles').select('nome, email').eq('id', t.user_id).maybeSingle()
  const nome = String(p?.nome ?? '').trim() || String(p?.email ?? '').split('@')[0] || 'Alguém'
  const msg = { titulo: `${CATEGORIA[t.categoria] ?? '💬 Recado'} · ${nome}`, corpo: t.assunto, url: '/admin', tag: `recado-${t.id}` }
  const site = (Deno.env.get('SITE_URL') ?? 'https://r2fitpro.com.br').replace(/\/$/, '')

  let enviados = 0
  for (const i of inscricoes) {
    try {
      const r = webpush.generateRequestDetails(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        JSON.stringify(msg),
        { vapidDetails: { subject: site, publicKey: cfg.vapid_publica, privateKey: cfg.vapid_privada }, TTL: 24 * 3600, urgency: 'normal' },
      )
      const resp = await fetch(r.endpoint, { method: 'POST', headers: r.headers, body: r.body, signal: AbortSignal.timeout(10000) })
      if (resp.status === 404 || resp.status === 410) { await admin.from('push_inscricoes').delete().eq('id', i.id); continue }
      if (!resp.ok) { log('warn', 'recado_push_falhou', { status: resp.status }); continue }
      enviados++
    } catch (e) { log('warn', 'recado_push_erro', { erro: String(e) }) }
  }
  log('info', 'recado_aviso', { enviados, inscricoes: inscricoes.length })
  return resposta(200, { ok: true, enviados })
})
