// Edge Function "r2-app": rotas do app Android (publicada sem verificação de JWT; cada rota se autentica).
//   POST /r2-app/inscrever     → registra o aparelho do app para lembretes (JWT do usuário + identificador do aparelho)
//   POST /r2-app/desinscrever  → remove o aparelho (JWT do usuário)
//   POST /r2-app/lembrete      → na hora do alarme, o lembrete ainda vale? (só o identificador do aparelho)
// Os lembretes do app não usam Web Push: o próprio aparelho agenda os alarmes nos horários salvos e pergunta aqui.
import { corsHeaders, json, ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, usuarioAutenticado, rpc } from '../_shared/supa.ts'
import { ENDPOINT_APP, mensagemLembrete, tokenAppValido } from '../_shared/lembretesLogic.ts'

const MAX_APARELHOS = 10

Deno.serve(async (req) => {
  const caminho = new URL(req.url).pathname.replace(/^.*\/r2-app/, '')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (caminho.startsWith('/lembrete')) return lembrete(req)
  if (caminho.startsWith('/inscrever') || caminho.startsWith('/desinscrever')) return aparelho(req, caminho.startsWith('/inscrever'))
  return json(req, { erro: 'Rota não encontrada' }, 404)
})

/** Liga ou desliga os lembretes do app neste aparelho (guardado em push_inscricoes com endereço próprio do app). */
async function aparelho(req: Request, inscrever: boolean): Promise<Response> {
  if (req.method !== 'POST') return json(req, { erro: 'Método não permitido' }, 405)
  const admin = clienteAdmin()
  try {
    const user = await usuarioAutenticado(req, admin)
    const corpo = await req.json().catch(() => ({}))
    if (!tokenAppValido(corpo?.token)) throw new ErroHttp(400, 'Aparelho inválido.')
    const endpoint = ENDPOINT_APP + await hash(corpo.token)
    if (!inscrever) {
      await admin.from('push_inscricoes').delete().eq('user_id', user.id).eq('endpoint', endpoint)
      return json(req, { ok: true })
    }
    if (!(await rpc<boolean>(admin, 'tem_premium', { uid: user.id }))) throw new ErroHttp(403, 'Lembretes fazem parte do Premium.')
    const { error } = await admin.from('push_inscricoes').upsert({
      user_id: user.id, endpoint, p256dh: 'app', auth: 'app', user_agent: 'R2 Fit Pro Android',
    }, { onConflict: 'endpoint' })
    if (error) throw error
    const { data: todos } = await admin.from('push_inscricoes').select('id').eq('user_id', user.id).order('created_at', { ascending: false })
    const sobra = (todos ?? []).slice(MAX_APARELHOS).map(i => i.id)
    if (sobra.length) await admin.from('push_inscricoes').delete().in('id', sobra)
    return json(req, { ok: true })
  } catch (e) {
    if (e instanceof ErroHttp) return json(req, { erro: e.message, codigo: e.codigo }, e.status)
    log('error', 'app_aparelho_erro', { erro: String(e) })
    return json(req, { erro: 'Erro interno. Tente novamente.' }, 500)
  }
}

async function hash(t: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Dia local (AAAA-MM-DD) no fuso da pessoa. */
function diaLocal(fuso: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
  catch { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
}

/**
 * App Android, na hora do alarme: o lembrete ainda faz sentido? (mesmas regras do envio por Web Push:
 * refeição não registrada, meta de água não batida, treino não feito, peso não registrado; Premium ativo.)
 */
async function lembrete(req: Request): Promise<Response> {
  const resposta = (status: number, corpo: Record<string, unknown>) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  try {
    const corpo = await req.json().catch(() => ({}))
    const tipo = String(corpo?.tipo ?? '')
    const msg = mensagemLembrete(tipo)
    if (!tokenAppValido(corpo?.token) || !msg) return resposta(400, { erro: 'Pedido inválido' })
    const admin = clienteAdmin()
    const endpoint = ENDPOINT_APP + await hash(corpo.token)
    const { data: insc } = await admin.from('push_inscricoes').select('id, user_id').eq('endpoint', endpoint).maybeSingle()
    if (!insc) return resposta(200, { mostrar: false, motivo: 'aparelho' })
    await admin.from('push_inscricoes').update({ ultimo_uso: new Date().toISOString() }).eq('id', insc.id)
    const uid = insc.user_id as string
    if (!(await rpc<boolean>(admin, 'tem_premium', { uid }))) return resposta(200, { mostrar: false, motivo: 'premium' })
    const { data: lemb } = await admin.from('lembretes').select('fuso').eq('user_id', uid).eq('tipo', tipo).limit(1).maybeSingle()
    const fuso = String(lemb?.fuso ?? 'America/Sao_Paulo')
    const dia = diaLocal(fuso)
    let vale = true
    const existe = async (q: PromiseLike<{ count: number | null }>) => ((await q).count ?? 0) > 0
    if (tipo === 'cafe' || tipo === 'almoco' || tipo === 'lanche' || tipo === 'jantar') {
      const padrao = { cafe: 'refeicao.ilike.caf%', almoco: 'refeicao.ilike.almo%', lanche: 'refeicao.ilike.lanch%', jantar: 'refeicao.ilike.jant%,refeicao.ilike.ceia%' }[tipo]
      vale = !(await existe(admin.from('food_logs').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('data', dia).or(padrao)))
    } else if (tipo === 'agua') {
      const { data: aguas } = await admin.from('registros_agua').select('ml').eq('user_id', uid).eq('data', dia)
      const { data: meta } = await admin.from('metas_nutricionais').select('meta_agua_ml').eq('user_id', uid).maybeSingle()
      vale = (aguas ?? []).reduce((s, a) => s + Number(a.ml ?? 0), 0) < Number(meta?.meta_agua_ml ?? 2000)
    } else if (tipo === 'treino') {
      // Sessão iniciada hoje no fuso da pessoa (janela de 36 h e filtro pelo dia local)
      const { data: sessoes } = await admin.from('sessoes_treino').select('data_inicio').eq('user_id', uid)
        .gte('data_inicio', new Date(Date.now() - 36 * 3600_000).toISOString())
      vale = !(sessoes ?? []).some(s => diaLocalDe(String(s.data_inicio), fuso) === dia)
    } else if (tipo === 'peso') {
      vale = !(await existe(admin.from('registros_peso').select('data', { count: 'exact', head: true }).eq('user_id', uid).eq('data', dia)))
    }
    return resposta(200, vale ? { mostrar: true, ...msg } : { mostrar: false, motivo: 'feito' })
  } catch (e) {
    log('error', 'app_lembrete_erro', { erro: String(e) })
    return resposta(500, { erro: 'Erro interno' })
  }
}

function diaLocalDe(iso: string, fuso: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) }
  catch { return iso.slice(0, 10) }
}
