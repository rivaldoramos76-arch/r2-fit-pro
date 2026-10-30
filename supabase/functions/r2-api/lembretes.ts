// Rotas de lembretes da Edge Function r2-api:
//   /lembretes        → chave pública, inscrever/desinscrever o aparelho e notificação de teste (JWT do usuário)
//   /cron/lembretes   → envia os lembretes vencidos (pg_cron a cada 5 min, token de uso único)
import { corsHeaders, json, ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, usuarioAutenticado, rpc } from '../_shared/supa.ts'
import { chavesVapid, enviarPush } from '../_shared/push.ts'
import { lerInscricao, mensagemLembrete } from '../_shared/lembretesLogic.ts'
import { tokenCronValido } from './cron.ts'

const MAX_APARELHOS = 10

export async function handleLembretes(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { erro: 'Método não permitido' }, 405)
  const admin = clienteAdmin()
  try {
    const user = await usuarioAutenticado(req, admin)
    const corpo = await req.json().catch(() => ({}))
    const acao = String(corpo?.acao ?? '')

    if (acao === 'chave') return json(req, { chave: (await chavesVapid(admin)).publica })

    if (acao === 'inscrever') {
      if (!(await rpc<boolean>(admin, 'tem_premium', { uid: user.id }))) throw new ErroHttp(403, 'Lembretes fazem parte do Premium.')
      const insc = lerInscricao(corpo?.inscricao)
      if (!insc) throw new ErroHttp(400, 'Inscrição de notificação inválida.')
      const { error } = await admin.from('push_inscricoes').upsert({
        user_id: user.id, ...insc, user_agent: String(req.headers.get('user-agent') ?? '').slice(0, 300) || null,
      }, { onConflict: 'endpoint' })
      if (error) throw error
      // Mantém só os aparelhos mais recentes
      const { data: todos } = await admin.from('push_inscricoes').select('id').eq('user_id', user.id).order('created_at', { ascending: false })
      const sobra = (todos ?? []).slice(MAX_APARELHOS).map(i => i.id)
      if (sobra.length) await admin.from('push_inscricoes').delete().in('id', sobra)
      return json(req, { ok: true })
    }

    if (acao === 'desinscrever') {
      const endpoint = String(corpo?.endpoint ?? '')
      if (endpoint) await admin.from('push_inscricoes').delete().eq('user_id', user.id).eq('endpoint', endpoint)
      return json(req, { ok: true })
    }

    if (acao === 'testar') {
      const { data: inscricoes } = await admin.from('push_inscricoes').select('id, endpoint, p256dh, auth').eq('user_id', user.id)
      if (!inscricoes?.length) throw new ErroHttp(404, 'Nenhum aparelho com notificações ativas. Ative neste aparelho primeiro.')
      const chaves = await chavesVapid(admin)
      const msg = { titulo: 'Lembretes ativados ✅', corpo: 'É assim que os avisos do R2 Fit Pro vão aparecer.', url: '/lembretes', tag: 'r2-teste' }
      const resultados = await Promise.all(inscricoes.map(i => enviarPush(admin, chaves, i, msg)))
      return json(req, { enviados: resultados.filter(r => r === 'ok').length, falhas: resultados.filter(r => r !== 'ok').length })
    }

    throw new ErroHttp(400, 'Ação inválida')
  } catch (e) {
    if (e instanceof ErroHttp) return json(req, { erro: e.message, codigo: e.codigo }, e.status)
    log('error', 'lembretes_erro', { erro: String(e) })
    return json(req, { erro: 'Erro interno. Tente novamente.' }, 500)
  }
}

export async function handleCronLembretes(req: Request): Promise<Response> {
  const resposta = (status: number, corpo: Record<string, unknown>) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const admin = clienteAdmin()
  if (!(await tokenCronValido(admin, await req.json().catch(() => ({}))))) return resposta(401, { erro: 'Não autorizado' })
  const devidos = await rpc<{ id: string; user_id: string; tipo: string }[]>(admin, 'lembretes_devidos', {})
  const r = { lembretes: devidos?.length ?? 0, enviados: 0, expiradas: 0, falhas: 0 }
  if (r.lembretes) {
    const usuarios = [...new Set(devidos.map(d => d.user_id))]
    const { data: inscricoes } = await admin.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth').in('user_id', usuarios)
    const chaves = await chavesVapid(admin)
    const envios = devidos.flatMap(d => {
      const msg = mensagemLembrete(d.tipo)
      return msg ? (inscricoes ?? []).filter(i => i.user_id === d.user_id).map(i => enviarPush(admin, chaves, i, msg)) : []
    })
    for (const s of await Promise.all(envios)) {
      if (s === 'ok') r.enviados++; else if (s === 'expirada') r.expiradas++; else r.falhas++
    }
  }
  log('info', 'cron_lembretes', r)
  return resposta(200, { ok: true, ...r })
}
