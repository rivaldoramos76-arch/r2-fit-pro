// Lógica pura da integração com o Asaas (sem dependências de runtime).
// Usada pelas Edge Functions (Deno) e pelos testes automatizados (Node).
import { ehUuid, paraCentavos, type StatusPagamento } from './mpLogic.ts'

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>

export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '')

/** CPF (11 dígitos) com dígitos verificadores válidos. */
export function cpfValido(valor: unknown): boolean {
  const c = soDigitos(valor)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/** Data de hoje (ou daqui a N dias) no fuso de São Paulo, YYYY-MM-DD. */
export function dataSP(diasAFrente = 0, agora = new Date()): string {
  const d = new Date(agora.getTime() + diasAFrente * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Referência gravada nas cobranças avulsas: "<userId>:avulso:<meses>". */
export const refAvulso = (userId: string, meses: number) => `${userId}:avulso:${meses}`
export function lerReferencia(ref: unknown): { userId: string | null; avulso: boolean; meses: number } {
  const [id, tipo, m] = String(ref ?? '').split(':')
  const meses = Number(m)
  return { userId: ehUuid(id) ? id : null, avulso: tipo === 'avulso' && (meses === 1 || meses === 12), meses: meses === 12 ? 12 : 1 }
}

/** Status de cobrança do Asaas → status interno. O evento de cartão recusado vale como recusa. */
export function mapearStatusAsaas(status: string | null | undefined, evento = ''): StatusPagamento {
  if (evento === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' || evento === 'PAYMENT_REPROVED_BY_RISK_ANALYSIS') return 'recusado'
  if (evento === 'PAYMENT_DELETED') return 'cancelado'
  switch (String(status ?? '').toUpperCase()) {
    case 'CONFIRMED': case 'RECEIVED': case 'RECEIVED_IN_CASH': case 'DUNNING_RECEIVED': return 'aprovado'
    case 'REFUNDED': case 'REFUND_IN_PROGRESS': return 'estornado'
    case 'CHARGEBACK_REQUESTED': case 'CHARGEBACK_DISPUTE': case 'AWAITING_CHARGEBACK_REVERSAL': return 'em_disputa'
    case 'OVERDUE': return 'recusado'
    case 'DELETED': return 'cancelado'
    default: return 'pendente' // PENDING, AWAITING_RISK_ANALYSIS, REFUND_REQUESTED…
  }
}

const dataComHora = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00-03:00` : null)

/** Cobrança do Asaas → formato de billing_registrar_pagamento. */
export function normalizarPagamentoAsaas(pag: Obj, evento = '') {
  const status = mapearStatusAsaas(pag.status, evento)
  const ref = lerReferencia(pag.externalReference)
  const assinatura = typeof pag.subscription === 'string' && pag.subscription ? pag.subscription : null
  return {
    provider: 'asaas',
    provider_payment_id: String(pag.id),
    provider_subscription_id: assinatura,
    user_id: ref.userId,
    status,
    status_detalhe: evento === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' ? 'cartao_recusado'
      : evento === 'PAYMENT_REPROVED_BY_RISK_ANALYSIS' ? 'reprovado_analise_risco' : String(pag.status ?? '').toLowerCase() || null,
    valor_centavos: paraCentavos(pag.value),
    valor_estornado_centavos: status === 'estornado' ? paraCentavos(pag.value) : 0,
    moeda: 'BRL',
    metodo: pag.billingType ? String(pag.billingType).toLowerCase() : null,
    pago_em: dataComHora(pag.confirmedDate) ?? dataComHora(pag.paymentDate) ?? dataComHora(pag.clientPaymentDate),
    comprovante_url: pag.transactionReceiptUrl ?? pag.invoiceUrl ?? null,
    avulso: !assinatura && ref.avulso,
    meses: ref.meses,
  }
}

/** Assinatura do Asaas → formato de billing_registrar_assinatura. Inativa, expirada ou apagada = cancelada. */
export function normalizarAssinaturaAsaas(sub: Obj, apagada = false) {
  const st = String(sub.status ?? '').toUpperCase()
  return {
    provider: 'asaas',
    provider_subscription_id: String(sub.id),
    user_id: ehUuid(sub.externalReference) ? sub.externalReference : null,
    provider_status: apagada || sub.deleted === true || st === 'INACTIVE' || st === 'EXPIRED' ? 'cancelled' : st.toLowerCase() || 'active',
    proxima_cobranca: dataComHora(sub.nextDueDate),
    preco_centavos: paraCentavos(sub.value),
    plano_nome: sub.description ?? null,
  }
}

export function corpoClienteAsaas(o: { userId: string; nome: string; email: string; cpf: string }) {
  return {
    name: o.nome.slice(0, 100) || o.email, email: o.email, cpfCnpj: soDigitos(o.cpf),
    externalReference: o.userId, notificationDisabled: true,
  }
}

export function corpoAssinaturaAsaas(o: { cliente: string; userId: string; planoNome: string; precoCentavos: number; site: string; agora?: Date }) {
  if (!Number.isInteger(o.precoCentavos) || o.precoCentavos < 500) throw new Error('preço inválido')
  return {
    customer: o.cliente, billingType: 'CREDIT_CARD', cycle: 'MONTHLY',
    value: o.precoCentavos / 100, nextDueDate: dataSP(0, o.agora),
    description: o.planoNome, externalReference: o.userId,
    callback: { successUrl: `${o.site}/assinatura/retorno?origem=asaas`, autoRedirect: true },
  }
}

export function corpoCobrancaAvulsaAsaas(o: { cliente: string; userId: string; planoNome: string; meses: 1 | 12; precoCentavos: number; site: string; agora?: Date }) {
  if (!Number.isInteger(o.precoCentavos) || o.precoCentavos < 500) throw new Error('preço inválido')
  return {
    customer: o.cliente, billingType: 'UNDEFINED', // o cliente escolhe Pix, boleto ou cartão na fatura
    value: o.precoCentavos / 100, dueDate: dataSP(2, o.agora),
    description: `${o.planoNome} — ${o.meses === 12 ? '12 meses' : '1 mês'} (sem renovação automática)`,
    externalReference: refAvulso(o.userId, o.meses),
    callback: { successUrl: `${o.site}/assinatura/retorno?origem=asaas`, autoRedirect: true },
  }
}

export const EVENTOS_WEBHOOK_ASAAS = [
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED',
  'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED',
]

/** Lê o evento do webhook: id do evento, tipo e o recurso (cobrança ou assinatura). */
export function lerEventoAsaas(corpo: Obj | null) {
  const evento = String(corpo?.event ?? '')
  return {
    id: corpo?.id ? String(corpo.id) : null,
    evento,
    pagamentoId: corpo?.payment?.id ? String(corpo.payment.id) : null,
    assinaturaId: corpo?.subscription?.id ? String(corpo.subscription.id) : null,
  }
}

/** Compara o token do cabeçalho asaas-access-token em tempo constante. */
export function tokenIgual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
