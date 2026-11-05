// Rotas do acompanhamento com personal (token de uso único em cron_tokens):
//   POST /cron/acomp-aviso         → notificação no celular de uma mensagem nova (gatilho do banco a cada mensagem)
//   POST /cron/personal-descontos  → ajusta no Asaas a mensalidade dos personais pelo número de alunos pagantes (diária)
import { ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, rpc } from '../_shared/supa.ts'
import { chavesVapid, enviarPush } from '../_shared/push.ts'
import { acaoDescontoPersonal, mensagemAcomp } from '../_shared/acompLogic.ts'
import { asaas } from '../_shared/asaas.ts'
import { dataSP } from '../_shared/asaasLogic.ts'
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

interface Desconto { gratis: boolean; preco_centavos: number; alunos_pagantes: number; percentual: number }

export async function handleCronPersonalDescontos(req: Request): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const admin = clienteAdmin()
  if (!(await tokenCronValido(admin, await req.json().catch(() => ({}))))) return resposta(401, { erro: 'Não autorizado' })
  const { data: personais } = await admin.from('personais').select('user_id')
  const ids = new Set((personais ?? []).map(p => p.user_id as string))
  const { data: subs } = await admin.from('subscriptions').select('id, user_id, provider_subscription_id')
    .eq('provider', 'asaas').eq('modalidade', 'recorrente').in('status', ['ativa', 'inadimplente'])
    .not('provider_subscription_id', 'is', null)
  const r = { avaliados: 0, ajustados: 0, cobrancas_apagadas: 0, erros: 0 }
  for (const s of (subs ?? []).filter(x => ids.has(x.user_id))) {
    r.avaliados++
    const id = encodeURIComponent(s.provider_subscription_id!)
    try {
      const d = await rpc<Desconto>(admin, 'acomp_desconto_personal', { p_personal: s.user_id })
      const sub = await asaas('GET', `/subscriptions/${id}`)
      const pend = await asaas('GET', `/payments?subscription=${id}&status=PENDING&limit=20`)
      const acao = acaoDescontoPersonal({
        gratis: d.gratis, precoCentavos: d.preco_centavos, valorAtual: Number(sub?.value ?? 0), hoje: dataSP(0),
        // deno-lint-ignore no-explicit-any
        pendentes: (pend?.data ?? []).map((p: any) => ({ id: String(p.id), dueDate: String(p.dueDate), value: Number(p.value) })),
      })
      if (acao.novoValor !== null) {
        const corpo = { value: acao.novoValor, updatePendingPayments: true }
        await asaas('PUT', `/subscriptions/${id}`, corpo).catch(e => {
          if (e instanceof ErroHttp && e.status < 500) return asaas('POST', `/subscriptions/${id}`, corpo)
          throw e
        })
        await admin.from('subscriptions').update({ preco_centavos: Math.round(acao.novoValor * 100), updated_at: new Date().toISOString() }).eq('id', s.id)
        await admin.from('audit_logs').insert({ actor_id: null, acao: 'personal.mensalidade_ajustada', alvo: s.user_id,
          detalhes: { alunos_pagantes: d.alunos_pagantes, percentual: d.percentual, valor: acao.novoValor } })
        r.ajustados++
      }
      for (const pid of acao.apagar) {
        await asaas('DELETE', `/payments/${encodeURIComponent(pid)}`)
        await admin.from('audit_logs').insert({ actor_id: null, acao: 'personal.cobranca_dispensada', alvo: s.user_id, detalhes: { cobranca: pid } })
        r.cobrancas_apagadas++
      }
    } catch (e) {
      r.erros++
      log('error', 'personal_desconto', { user: s.user_id, erro: String(e) })
    }
  }
  log('info', 'cron_personal_descontos', r)
  return resposta(200, { ok: true, ...r })
}
