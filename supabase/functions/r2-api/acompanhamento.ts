// POST /cron/acomp-aviso → notificação no celular de uma mensagem nova do acompanhamento com personal.
// Chamada pelo gatilho do banco a cada mensagem (token de uso único em cron_tokens).
import { log } from '../_shared/http.ts'
import { clienteAdmin } from '../_shared/supa.ts'
import { chavesVapid, enviarPush } from '../_shared/push.ts'
import { mensagemAcomp } from '../_shared/acompLogic.ts'
import { tokenCronValido } from './cron.ts'

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleCronAcompAviso(req: Request): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const admin = clienteAdmin()
  const corpo = await req.json().catch(() => ({}))
  if (!(await tokenCronValido(admin, corpo))) return resposta(401, { erro: 'Não autorizado' })
  const { data: m } = await admin.from('acomp_mensagens')
    .select('id, tipo, texto, ref_id, autor_id, acompanhamentos!inner(personal_id, aluno_id, ativo)')
    .eq('id', String(corpo?.mensagem ?? '')).maybeSingle()
  // deno-lint-ignore no-explicit-any
  const a = (m as any)?.acompanhamentos as { personal_id: string; aluno_id: string; ativo: boolean } | undefined
  if (!m || !a?.ativo) return resposta(200, { ok: true, ignorado: true })
  const paraPersonal = m.autor_id === a.aluno_id
  const destino = paraPersonal ? a.personal_id : a.aluno_id
  const { data: inscricoes } = await admin.from('push_inscricoes').select('id, endpoint, p256dh, auth').eq('user_id', destino)
  if (!inscricoes?.length) return resposta(200, { ok: true, enviados: 0 })
  let autorNome = 'R2 Fit Pro'
  if (paraPersonal) {
    const { data: p } = await admin.from('profiles').select('nome, email').eq('id', m.autor_id).maybeSingle()
    autorNome = (p?.nome ?? '').trim() || String(p?.email ?? '').split('@')[0] || 'Aluno'
  } else {
    const { data: pe } = await admin.from('personais').select('nome_exibicao').eq('user_id', m.autor_id).maybeSingle()
    const { data: p } = await admin.from('profiles').select('nome').eq('id', m.autor_id).maybeSingle()
    autorNome = (pe?.nome_exibicao ?? '').trim() || (p?.nome ?? '').trim() || 'Seu personal'
  }
  const msg = mensagemAcomp({ id: m.id, tipo: m.tipo, texto: m.texto, autorNome, paraPersonal, alunoId: a.aluno_id, refId: m.ref_id })
  const chaves = await chavesVapid(admin)
  const r = await Promise.all(inscricoes.map(i => enviarPush(admin, chaves, i, msg)))
  const enviados = r.filter(s => s === 'ok').length
  log('info', 'acomp_aviso', { enviados, falhas: r.length - enviados })
  return resposta(200, { ok: true, enviados })
}
