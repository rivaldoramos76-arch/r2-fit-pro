// Estorno de um pagamento pelo administrador: devolve o valor no Asaas, cancela a assinatura
// recorrente (sem novas cobranças) e encerra o acesso pago. O cliente recebe os e-mails de
// cancelamento e de estorno.
//   POST /r2-api/admin  { acao: 'estornar_pagamento', payment_id }       → botão do painel
//   POST /r2-api/cron/estornar { token, payment_id }                      → suporte, via banco (token de uso único)
import { ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, rpc, auditar } from '../_shared/supa.ts'
import { asaas } from '../_shared/asaas.ts'
import { registrarPagamentoAsaas } from '../_shared/syncAsaas.ts'
import { processarFilaEmails } from '../_shared/email.ts'
import { tokenCronValido } from './cron.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function estornarPagamento(admin: SupabaseClient, paymentId: string, autorId: string | null) {
  if (!UUID.test(paymentId)) throw new ErroHttp(400, 'Pagamento inválido')
  const { data: pag } = await admin.from('payments')
    .select('id, user_id, subscription_id, provider, provider_payment_id, status, valor_centavos').eq('id', paymentId).maybeSingle()
  if (!pag) throw new ErroHttp(404, 'Pagamento não encontrado')
  if (pag.status === 'estornado') throw new ErroHttp(400, 'Este pagamento já foi estornado.')
  if (pag.status !== 'aprovado') throw new ErroHttp(400, 'Só pagamentos aprovados podem ser estornados.')
  if (pag.provider !== 'asaas' || !pag.provider_payment_id) {
    throw new ErroHttp(400, 'Pelo painel só dá para estornar pagamentos do Asaas. Os do Mercado Pago são estornados no painel do Mercado Pago.')
  }

  await asaas('POST', `/payments/${encodeURIComponent(pag.provider_payment_id)}/refund`, {})
  await auditar(admin, autorId, 'pagamento.estornado_admin', pag.id,
    { provider_payment_id: pag.provider_payment_id, valor_centavos: pag.valor_centavos, user_id: pag.user_id })

  // Sem novas cobranças: cancela a assinatura recorrente e encerra o acesso agora.
  let assinaturaCancelada = false
  const { data: sub } = await admin.from('subscriptions')
    .select('id, modalidade, status, provider_subscription_id').eq('id', pag.subscription_id).maybeSingle()
  if (sub && ['ativa', 'inadimplente', 'pendente'].includes(sub.status)) {
    if (sub.modalidade === 'recorrente' && sub.provider_subscription_id) {
      await asaas('DELETE', `/subscriptions/${encodeURIComponent(sub.provider_subscription_id)}`).catch(e => {
        if (!(e instanceof ErroHttp && e.status === 404)) throw e
      })
    }
    await rpc(admin, 'billing_cancelar', { p_sub: sub.id, p_encerrar_agora: true })
    assinaturaCancelada = true
  }

  // Atualiza o pagamento com o que o Asaas informa agora (o webhook confirma depois).
  try { await registrarPagamentoAsaas(admin, pag.provider_payment_id) }
  catch (e) { log('warn', 'estorno_sync_falhou', { pagamento: pag.id, erro: String(e) }) }
  const { data: depois } = await admin.from('payments').select('status').eq('id', pag.id).single()
  if (depois?.status !== 'estornado') {
    await admin.from('payments').update({ status: 'estornado', valor_estornado_centavos: pag.valor_centavos, updated_at: new Date().toISOString() }).eq('id', pag.id)
  }
  await processarFilaEmails(admin, 5)
  log('info', 'pagamento_estornado_admin', { pagamento: pag.id, assinatura_cancelada: assinaturaCancelada })
  return { ok: true, assinatura_cancelada: assinaturaCancelada, valor_centavos: pag.valor_centavos }
}

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleCronEstornar(req: Request): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const corpo = await req.json().catch(() => ({}))
  const admin = clienteAdmin()
  if (!(await tokenCronValido(admin, corpo))) return resposta(401, { erro: 'Não autorizado' })
  try {
    return resposta(200, await estornarPagamento(admin, String(corpo?.payment_id ?? ''), null))
  } catch (e) {
    log('error', 'cron_estornar_erro', { erro: String(e) })
    return resposta(e instanceof ErroHttp ? e.status : 500, { erro: e instanceof ErroHttp ? e.message : String(e) })
  }
}
