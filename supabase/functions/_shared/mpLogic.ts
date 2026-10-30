// Lógica pura da integração com o Mercado Pago (sem dependências de runtime).
// Usada pelas Edge Functions (Deno) e pelos testes automatizados (Node).

export type StatusPagamento = 'aprovado' | 'pendente' | 'recusado' | 'estornado' | 'cancelado' | 'em_disputa'

/** Converte o status de pagamento do Mercado Pago para o status interno. */
export function mapearStatusPagamento(status: string | null | undefined): StatusPagamento {
  switch ((status ?? '').toLowerCase()) {
    case 'approved': return 'aprovado'
    case 'authorized':
    case 'pending':
    case 'in_process': return 'pendente'
    case 'rejected': return 'recusado'
    case 'cancelled': return 'cancelado'
    case 'refunded':
    case 'charged_back': return 'estornado'
    case 'in_mediation': return 'em_disputa'
    default: return 'pendente'
  }
}

export function paraCentavos(valor: unknown): number {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>

/** Identifica a assinatura (preapproval) a que um pagamento pertence. */
export function extrairPreapprovalId(pagamento: Obj): string | null {
  const candidatos = [
    pagamento?.metadata?.preapproval_id,
    pagamento?.point_of_interaction?.transaction_data?.subscription_id,
    pagamento?.subscription_id,
  ]
  const v = candidatos.find(c => typeof c === 'string' && c.length > 0)
  return v ?? null
}

/** Normaliza um pagamento do MP para o formato aceito por billing_registrar_pagamento. */
export function normalizarPagamento(pagamento: Obj, preapprovalId: string | null) {
  const status = mapearStatusPagamento(pagamento.status)
  return {
    provider_payment_id: String(pagamento.id),
    provider_subscription_id: preapprovalId,
    user_id: ehUuid(pagamento.external_reference) ? pagamento.external_reference : null,
    status,
    status_detalhe: pagamento.status_detail ?? null,
    valor_centavos: paraCentavos(pagamento.transaction_amount),
    valor_estornado_centavos: paraCentavos(pagamento.transaction_amount_refunded),
    moeda: pagamento.currency_id ?? 'BRL',
    metodo: [pagamento.payment_type_id, pagamento.payment_method_id].filter(Boolean).join(':') || null,
    pago_em: pagamento.date_approved ?? pagamento.date_last_updated ?? pagamento.date_created ?? null,
    ...lerCompraAvulsa(pagamento),
  }
}

/** Pagamento avulso (Checkout Pro: Pix, boleto, cartão, saldo): quantos meses de acesso ele compra. */
export function lerCompraAvulsa(pagamento: Obj): { avulso: boolean; meses: number } {
  const m = pagamento?.metadata ?? {}
  const meses = Number(m.r2_meses)
  if (m.r2_tipo !== 'avulso' || !MESES_VALIDOS.includes(meses)) return { avulso: false, meses: 1 }
  return { avulso: true, meses }
}

export const MESES_VALIDOS = [1, 12]
export type PeriodoAvulso = 'mensal' | 'anual'

/** Normaliza uma assinatura (preapproval) do MP para billing_registrar_assinatura. */
export function normalizarAssinatura(pre: Obj) {
  return {
    provider_subscription_id: String(pre.id),
    user_id: ehUuid(pre.external_reference) ? pre.external_reference : null,
    provider_status: pre.status ?? null,
    proxima_cobranca: pre.next_payment_date ?? null,
    preco_centavos: paraCentavos(pre.auto_recurring?.transaction_amount),
    plano_nome: pre.reason ?? null,
    checkout_url: pre.init_point ?? null,
  }
}

/** Monta o corpo de criação da assinatura (preapproval sem plano, status pending). */
export function corpoCriarAssinatura(opts: {
  userId: string; email: string; planoNome: string; precoCentavos: number; voltarPara: string
}) {
  if (!ehUuid(opts.userId)) throw new Error('userId inválido')
  if (!Number.isInteger(opts.precoCentavos) || opts.precoCentavos < 100) throw new Error('preço inválido')
  return {
    reason: opts.planoNome,
    external_reference: opts.userId,
    payer_email: opts.email,
    back_url: opts.voltarPara,
    status: 'pending',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: opts.precoCentavos / 100,
      currency_id: 'BRL',
    },
  }
}

/** Assinatura mensal no cartão sem conta Mercado Pago: o cartão vem tokenizado do Card Payment Brick. */
export function corpoAssinaturaCartao(opts: {
  userId: string; email: string; planoNome: string; precoCentavos: number; voltarPara: string; cardTokenId: string
}) {
  if (!opts.cardTokenId || typeof opts.cardTokenId !== 'string' || opts.cardTokenId.length > 200) throw new Error('cartão inválido')
  return { ...corpoCriarAssinatura(opts), card_token_id: opts.cardTokenId, status: 'authorized' }
}

/** Mensagem clara para a recusa do cartão, a partir do status_detail do pagamento no Mercado Pago. */
export function motivoRecusaCartao(statusDetalhe: string | null | undefined): string | null {
  const d = statusDetalhe ?? ''
  if (d === 'cc_rejected_high_risk' || d === 'cc_rejected_blacklist') {
    return 'O Mercado Pago recusou o pagamento na análise de segurança dele. Não é falta de limite nem problema no cartão, e o banco não chega a ser consultado. Isso costuma acontecer com contas novas: pague com Pix, boleto ou outros (pode ser o mesmo cartão por lá) ou tente o cartão de novo mais tarde.'
  }
  if (d === 'cc_rejected_insufficient_amount') return 'O cartão não tem limite disponível para esta cobrança. Tente outro cartão ou pague com Pix, boleto ou outros.'
  if (d.startsWith('cc_rejected_bad_filled')) return 'Algum dado do cartão está incorreto (número, validade, código de segurança ou nome). Confira e tente de novo.'
  if (d === 'cc_rejected_call_for_authorize') return 'O banco pediu para você autorizar esta cobrança. Ligue ou abra o app do banco, autorize e tente de novo.'
  if (d === 'cc_rejected_card_disabled') return 'O cartão está bloqueado ou inativo. Desbloqueie no app do banco ou use outro cartão.'
  if (d === 'cc_rejected_duplicated_payment') return 'Já existe um pagamento igual feito agora há pouco. Aguarde alguns minutos antes de tentar de novo.'
  if (d.startsWith('cc_rejected')) return 'O banco emissor recusou o cartão. Tente outro cartão ou pague com Pix, boleto ou outros.'
  return null
}

/** Preferência do Checkout Pro para comprar 1 ou 12 meses de acesso, aceitando todos os meios de pagamento. */
export function corpoPreferenciaAvulsa(opts: {
  userId: string; email: string; planoNome: string; periodo: PeriodoAvulso; precoCentavos: number
  parcelasMax: number; site: string
}) {
  if (!ehUuid(opts.userId)) throw new Error('userId inválido')
  if (!Number.isInteger(opts.precoCentavos) || opts.precoCentavos < 100) throw new Error('preço inválido')
  const meses = opts.periodo === 'anual' ? 12 : 1
  const titulo = `${opts.planoNome} — ${meses === 12 ? '12 meses' : '1 mês'}`
  const retorno = `${opts.site}/assinatura/retorno`
  return {
    items: [{
      id: `r2-premium-${opts.periodo}`, title: titulo, description: 'Acesso Premium ao app R2 Fit Pro, sem renovação automática',
      category_id: 'services', quantity: 1, currency_id: 'BRL', unit_price: opts.precoCentavos / 100,
    }],
    payer: { email: opts.email },
    external_reference: opts.userId,
    metadata: { r2_tipo: 'avulso', r2_meses: meses, r2_user: opts.userId },
    back_urls: { success: retorno, pending: retorno, failure: retorno },
    auto_return: 'approved',
    statement_descriptor: 'R2FITPRO',
    payment_methods: { installments: meses === 12 ? Math.min(Math.max(Math.trunc(opts.parcelasMax), 1), 12) : 1 },
  }
}

// ─── Webhook ────────────────────────────────────────────────────────────────

export function parseAssinaturaHeader(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null
  let ts = '', v1 = ''
  for (const parte of header.split(',')) {
    const [k, ...resto] = parte.split('=')
    const valor = resto.join('=').trim()
    if (k.trim() === 'ts') ts = valor
    if (k.trim() === 'v1') v1 = valor
  }
  return ts && v1 ? { ts, v1 } : null
}

/** Template oficial: "id:[data.id];request-id:[x-request-id];ts:[ts];" (partes ausentes são omitidas). */
export function montarManifesto(dataId: string | null, requestId: string | null, ts: string): string {
  let m = ''
  if (dataId) m += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) m += `request-id:${requestId};`
  m += `ts:${ts};`
  return m
}

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const enc = new TextEncoder()
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = await crypto.subtle.sign('HMAC', chave, enc.encode(mensagem))
  return Array.from(new Uint8Array(assinatura)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function iguaisTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function validarAssinaturaWebhook(opts: {
  xSignature: string | null; xRequestId: string | null; dataId: string | null; segredo: string
  toleranciaSegundos?: number; agoraMs?: number
}): Promise<{ valida: boolean; motivo?: string }> {
  if (!opts.segredo) return { valida: false, motivo: 'segredo_nao_configurado' }
  const partes = parseAssinaturaHeader(opts.xSignature)
  if (!partes) return { valida: false, motivo: 'cabecalho_ausente' }
  const esperado = await hmacHex(opts.segredo, montarManifesto(opts.dataId, opts.xRequestId, partes.ts))
  if (!iguaisTempoConstante(esperado, partes.v1.toLowerCase())) return { valida: false, motivo: 'assinatura_invalida' }
  if (opts.toleranciaSegundos && opts.toleranciaSegundos > 0) {
    const tsNum = Number(partes.ts)
    const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000
    if (Math.abs((opts.agoraMs ?? Date.now()) - tsMs) > opts.toleranciaSegundos * 1000) return { valida: false, motivo: 'fora_da_janela' }
  }
  return { valida: true }
}

/** Extrai tópico e id do recurso de uma notificação (formato webhook ou IPN). */
export function lerNotificacao(url: URL, corpo: Obj | null) {
  const topico = String(corpo?.type ?? corpo?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  const dataId = String(url.searchParams.get('data.id') ?? corpo?.data?.id ?? url.searchParams.get('id') ?? corpo?.id ?? '')
  const acao = String(corpo?.action ?? '')
  return { topico, dataId: dataId || null, acao }
}

/** Chave de idempotência: o mesmo evento reenviado gera a mesma chave. */
export function chaveEvento(topico: string, dataId: string | null, acao: string, corpo: Obj | null, xRequestId: string | null) {
  const idNotificacao = corpo?.id != null && String(corpo.id) !== dataId ? String(corpo.id) : (xRequestId ?? '')
  return ['mp', topico, dataId ?? '-', acao || '-', idNotificacao || '-'].join(':')
}

/** Elegibilidade ao reembolso integral pelo direito de arrependimento (CDC art. 49). */
export function elegivelArrependimento(iniciadaEm: string | null, dias: number, agoraMs = Date.now()): boolean {
  if (!iniciadaEm) return false
  const inicio = Date.parse(iniciadaEm)
  return Number.isFinite(inicio) && agoraMs - inicio <= Math.max(dias, 7) * 86400000
}
