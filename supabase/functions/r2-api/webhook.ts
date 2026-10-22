// Rota /webhook/mercadopago da Edge Function r2-api: notificações do Mercado Pago.
// Autenticação por assinatura HMAC (x-signature); idempotente por evento;
// o estado é sempre reconsultado na API do Mercado Pago antes de ser aplicado.
import { log } from '../_shared/http.ts'
import { clienteAdmin } from '../_shared/supa.ts'
import { validarAssinaturaWebhook, lerNotificacao, chaveEvento } from '../_shared/mpLogic.ts'
import { registrarPreapproval, registrarPagamento, registrarAuthorizedPayment } from '../_shared/sync.ts'
import { processarFilaEmails } from '../_shared/email.ts'

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const admin = clienteAdmin()
  const url = new URL(req.url)
  const bruto = await req.text()
  if (bruto.length > 64_000) return resposta(413, { erro: 'Payload muito grande' })
  // deno-lint-ignore no-explicit-any
  let corpo: any = null
  try { corpo = bruto ? JSON.parse(bruto) : null } catch { corpo = null }

  const { topico, dataId, acao } = lerNotificacao(url, corpo)
  const xRequestId = req.headers.get('x-request-id')
  const verificacao = await validarAssinaturaWebhook({
    xSignature: req.headers.get('x-signature'), xRequestId, dataId,
    segredo: Deno.env.get('MP_WEBHOOK_SECRET') ?? '',
    toleranciaSegundos: Number(Deno.env.get('MP_WEBHOOK_TOLERANCIA_SEG') ?? 0),
  })
  const payload = { topico, dataId, acao, live_mode: corpo?.live_mode ?? null, query: Object.fromEntries(url.searchParams) }

  if (!verificacao.valida) {
    await admin.from('webhook_events').insert({
      event_key: `rejeitado:${crypto.randomUUID()}`, topico, acao, resource_id: dataId,
      assinatura_valida: false, status: 'rejeitado', erro: verificacao.motivo, payload,
    })
    log('warn', 'webhook_rejeitado', { motivo: verificacao.motivo, topico })
    return resposta(401, { erro: 'Assinatura inválida' })
  }

  const chave = chaveEvento(topico, dataId, acao, corpo, xRequestId)
  const { data: existente } = await admin.from('webhook_events').select('id, status, tentativas').eq('event_key', chave).maybeSingle()
  if (existente && ['processado', 'ignorado'].includes(existente.status)) {
    return resposta(200, { ok: true, duplicado: true })
  }
  let eventoId = existente?.id as string | undefined
  if (existente) {
    await admin.from('webhook_events').update({ tentativas: existente.tentativas + 1, status: 'recebido' }).eq('id', existente.id)
  } else {
    const { data: novo, error } = await admin.from('webhook_events').insert({
      event_key: chave, topico, acao, resource_id: dataId, assinatura_valida: true, status: 'recebido', payload,
    }).select('id').single()
    if (error) {
      // corrida com uma entrega simultânea do mesmo evento
      if (error.code === '23505') return resposta(200, { ok: true, duplicado: true })
      throw error
    }
    eventoId = novo.id
  }

  try {
    if (!dataId) throw new Error('Notificação sem id do recurso')
    let resultado: Record<string, unknown>
    if (topico === 'subscription_preapproval' || topico === 'preapproval') {
      resultado = await registrarPreapproval(admin, dataId)
    } else if (topico === 'subscription_authorized_payment' || topico === 'authorized_payment') {
      resultado = await registrarAuthorizedPayment(admin, dataId)
    } else if (topico === 'payment') {
      resultado = await registrarPagamento(admin, dataId)
    } else {
      resultado = { ignorado: true, motivo: `tópico não tratado: ${topico}` }
    }
    const status = resultado?.ignorado ? 'ignorado' : 'processado'
    await admin.from('webhook_events').update({
      status, processado_em: new Date().toISOString(), erro: resultado?.ignorado ? String(resultado.motivo) : null,
    }).eq('id', eventoId!)
    await processarFilaEmails(admin, 5)
    return resposta(200, { ok: true, status })
  } catch (e) {
    log('error', 'webhook_erro', { topico, dataId, erro: String(e) })
    await admin.from('webhook_events').update({ status: 'erro', erro: String(e).slice(0, 1000) }).eq('id', eventoId!)
    // 500 faz o Mercado Pago reenviar a notificação mais tarde
    return resposta(500, { erro: 'Falha ao processar' })
  }
}
