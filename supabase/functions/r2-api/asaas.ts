// Rotas do Asaas na Edge Function r2-api:
//   POST /webhook/asaas      → eventos de cobrança e assinatura (cabeçalho asaas-access-token)
//   POST /cron/asaas-webhook → cadastra/atualiza o webhook no Asaas (token de uso único do banco)
import { log } from '../_shared/http.ts'
import { clienteAdmin } from '../_shared/supa.ts'
import { asaas } from '../_shared/asaas.ts'
import { EVENTOS_WEBHOOK_ASAAS, lerEventoAsaas, normalizarAssinaturaAsaas, tokenIgual } from '../_shared/asaasLogic.ts'
import { registrarAssinaturaAsaas, registrarPagamentoAsaas } from '../_shared/syncAsaas.ts'
import { rpc } from '../_shared/supa.ts'
import { processarFilaEmails } from '../_shared/email.ts'
import { tokenCronValido } from './cron.ts'

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleWebhookAsaas(req: Request): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const admin = clienteAdmin()
  const bruto = await req.text()
  if (bruto.length > 128_000) return resposta(413, { erro: 'Payload muito grande' })
  // deno-lint-ignore no-explicit-any
  let corpo: any = null
  try { corpo = bruto ? JSON.parse(bruto) : null } catch { corpo = null }
  const ev = lerEventoAsaas(corpo)
  const payload = { evento: ev.evento, pagamento: ev.pagamentoId, assinatura: ev.assinaturaId }

  const { data: cfg } = await admin.from('asaas_config').select('webhook_token').eq('id', true).maybeSingle()
  if (!tokenIgual(req.headers.get('asaas-access-token'), cfg?.webhook_token)) {
    await admin.from('webhook_events').insert({
      provider: 'asaas', event_key: `rejeitado:${crypto.randomUUID()}`, topico: ev.evento, acao: ev.evento,
      resource_id: ev.pagamentoId ?? ev.assinaturaId, assinatura_valida: false, status: 'rejeitado', erro: 'token_invalido', payload,
    })
    log('warn', 'webhook_asaas_rejeitado', { evento: ev.evento })
    return resposta(401, { erro: 'Não autorizado' })
  }

  const chave = `asaas:${ev.id ?? `${ev.evento}:${ev.pagamentoId ?? ev.assinaturaId}:${crypto.randomUUID()}`}`
  const { data: existente } = await admin.from('webhook_events').select('id, status, tentativas').eq('event_key', chave).maybeSingle()
  if (existente && ['processado', 'ignorado'].includes(existente.status)) return resposta(200, { ok: true, duplicado: true })
  let eventoId = existente?.id as string | undefined
  if (existente) {
    await admin.from('webhook_events').update({ tentativas: existente.tentativas + 1, status: 'recebido' }).eq('id', existente.id)
  } else {
    const { data: novo, error } = await admin.from('webhook_events').insert({
      provider: 'asaas', event_key: chave, topico: ev.evento, acao: ev.evento, resource_id: ev.pagamentoId ?? ev.assinaturaId,
      assinatura_valida: true, status: 'recebido', payload,
    }).select('id').single()
    if (error) {
      if (error.code === '23505') return resposta(200, { ok: true, duplicado: true })
      log('error', 'webhook_asaas_gravar', { erro: error.message })
      return resposta(500, { erro: 'Falha ao registrar' })
    }
    eventoId = novo.id
  }

  try {
    let resultado: Record<string, unknown>
    if (ev.pagamentoId) {
      resultado = await registrarPagamentoAsaas(admin, ev.pagamentoId, ev.evento, corpo.payment)
    } else if (ev.assinaturaId) {
      resultado = ev.evento === 'SUBSCRIPTION_DELETED'
        ? await rpc<Record<string, unknown>>(admin, 'billing_registrar_assinatura', { p: normalizarAssinaturaAsaas(corpo.subscription, true) })
        : await registrarAssinaturaAsaas(admin, ev.assinaturaId)
    } else {
      resultado = { ignorado: true, motivo: `evento não tratado: ${ev.evento}` }
    }
    const status = resultado?.ignorado ? 'ignorado' : 'processado'
    await admin.from('webhook_events').update({
      status, processado_em: new Date().toISOString(), erro: resultado?.ignorado ? String(resultado.motivo) : null,
    }).eq('id', eventoId!)
    await processarFilaEmails(admin, 5)
  } catch (e) {
    // Responde 200 mesmo assim: erros repetidos fazem o Asaas pausar a fila de webhooks.
    // O evento fica marcado como erro no painel e o app reconsulta o Asaas ao abrir.
    log('error', 'webhook_asaas_erro', { evento: ev.evento, erro: String(e) })
    await admin.from('webhook_events').update({ status: 'erro', erro: String(e).slice(0, 1000) }).eq('id', eventoId!)
  }
  return resposta(200, { ok: true })
}

/** Cadastra (ou atualiza) o webhook no Asaas com um token gerado aqui e guardado em asaas_config. */
export async function handleCronAsaasWebhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const admin = clienteAdmin()
  if (!(await tokenCronValido(admin, await req.json().catch(() => ({}))))) return resposta(401, { erro: 'Não autorizado' })
  try {
    let { data: cfg } = await admin.from('asaas_config').select('webhook_token, webhook_id').eq('id', true).maybeSingle()
    if (!cfg) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
      await admin.from('asaas_config').upsert({ id: true, webhook_token: token }, { onConflict: 'id', ignoreDuplicates: true })
      cfg = (await admin.from('asaas_config').select('webhook_token, webhook_id').eq('id', true).single()).data
    }
    const { data: empresa } = await admin.from('app_config').select('valor').eq('chave', 'empresa').maybeSingle()
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/r2-api/webhook/asaas`
    const corpo = {
      name: 'R2 Fit Pro', url, email: (empresa?.valor as Record<string, string> | undefined)?.email_suporte ?? undefined,
      enabled: true, interrupted: false, apiVersion: 3, authToken: cfg!.webhook_token, sendType: 'SEQUENTIALLY',
      events: EVENTOS_WEBHOOK_ASAAS,
    }
    const lista = await asaas('GET', '/webhooks?limit=100')
    // deno-lint-ignore no-explicit-any
    const atual = (lista?.data ?? []).find((w: any) => w.id === cfg!.webhook_id || w.url === url)
    const r = atual ? await asaas('PUT', `/webhooks/${encodeURIComponent(atual.id)}`, corpo) : await asaas('POST', '/webhooks', corpo)
    await admin.from('asaas_config').update({ webhook_id: String(r.id) }).eq('id', true)
    log('info', 'asaas_webhook_configurado', { id: r.id, atualizado: Boolean(atual) })
    return resposta(200, { ok: true, id: r.id, atualizado: Boolean(atual), eventos: r.events?.length ?? null })
  } catch (e) {
    log('error', 'asaas_webhook_configurar', { erro: String(e) })
    return resposta(500, { erro: String(e) })
  }
}
