import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  mapearStatusPagamento, paraCentavos, extrairPreapprovalId, normalizarPagamento, normalizarAssinatura,
  corpoCriarAssinatura, parseAssinaturaHeader, montarManifesto, validarAssinaturaWebhook, lerNotificacao,
  chaveEvento, elegivelArrependimento,
} from '../supabase/functions/_shared/mpLogic'
import { renderizarEmail } from '../supabase/functions/_shared/emailTemplates'

let ok = 0
const t = async (n: string, f: () => void | Promise<void>) => { await f(); ok++; console.log('✓', n) }
const UID = '3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b'

await t('status de pagamento do Mercado Pago → interno', () => {
  assert.equal(mapearStatusPagamento('approved'), 'aprovado')
  assert.equal(mapearStatusPagamento('pending'), 'pendente')
  assert.equal(mapearStatusPagamento('in_process'), 'pendente')
  assert.equal(mapearStatusPagamento('authorized'), 'pendente')
  assert.equal(mapearStatusPagamento('rejected'), 'recusado')
  assert.equal(mapearStatusPagamento('refunded'), 'estornado')
  assert.equal(mapearStatusPagamento('charged_back'), 'estornado')
  assert.equal(mapearStatusPagamento('in_mediation'), 'em_disputa')
  assert.equal(mapearStatusPagamento('cancelled'), 'cancelado')
  assert.equal(mapearStatusPagamento(undefined), 'pendente')
})

await t('conversão de valores para centavos sem erro de ponto flutuante', () => {
  assert.equal(paraCentavos(19.9), 1990)
  assert.equal(paraCentavos('19.90'), 1990)
  assert.equal(paraCentavos(0.1 + 0.2), 30)
  assert.equal(paraCentavos('abc'), 0)
})

await t('corpo da assinatura: R$ 19,90 mensal em BRL, vinculado à conta', () => {
  const c = corpoCriarAssinatura({ userId: UID, email: 'a@b.com', planoNome: 'R2 Fit Pro Premium', precoCentavos: 1990, voltarPara: 'https://x/assinatura/retorno' })
  assert.deepEqual(c.auto_recurring, { frequency: 1, frequency_type: 'months', transaction_amount: 19.9, currency_id: 'BRL' })
  assert.equal(c.external_reference, UID)
  assert.equal(c.status, 'pending')
  assert.throws(() => corpoCriarAssinatura({ userId: 'x', email: 'a@b.com', planoNome: 'p', precoCentavos: 1990, voltarPara: 'u' }))
  assert.throws(() => corpoCriarAssinatura({ userId: UID, email: 'a@b.com', planoNome: 'p', precoCentavos: 19.9, voltarPara: 'u' }))
})

await t('normalização de pagamento e vínculo com a assinatura', () => {
  const pag = { id: 123, status: 'approved', status_detail: 'accredited', transaction_amount: 19.9, currency_id: 'BRL',
    payment_type_id: 'credit_card', payment_method_id: 'visa', date_approved: '2026-10-22T10:00:00Z',
    metadata: { preapproval_id: 'pre_1' }, external_reference: UID }
  assert.equal(extrairPreapprovalId(pag), 'pre_1')
  const n = normalizarPagamento(pag, 'pre_1')
  assert.equal(n.provider_payment_id, '123'); assert.equal(n.status, 'aprovado'); assert.equal(n.valor_centavos, 1990)
  assert.equal(n.user_id, UID); assert.equal(n.metodo, 'credit_card:visa')
  assert.equal(normalizarPagamento({ ...pag, external_reference: 'nao-uuid' }, null).user_id, null)
  assert.equal(extrairPreapprovalId({ point_of_interaction: { transaction_data: { subscription_id: 'pre_2' } } }), 'pre_2')
  assert.equal(extrairPreapprovalId({}), null)
})

await t('normalização da assinatura (preapproval)', () => {
  const n = normalizarAssinatura({ id: 'pre_9', status: 'authorized', external_reference: UID, next_payment_date: '2026-11-22T00:00:00Z', reason: 'R2 Fit Pro Premium', auto_recurring: { transaction_amount: 19.9 } })
  assert.equal(n.provider_status, 'authorized'); assert.equal(n.preco_centavos, 1990); assert.equal(n.user_id, UID)
})

await t('cabeçalho x-signature e manifesto no formato oficial', () => {
  assert.deepEqual(parseAssinaturaHeader('ts=1704908010,v1=abc123'), { ts: '1704908010', v1: 'abc123' })
  assert.equal(parseAssinaturaHeader('lixo'), null)
  assert.equal(montarManifesto('ABC123', 'req-1', '99'), 'id:abc123;request-id:req-1;ts:99;')
  assert.equal(montarManifesto(null, null, '99'), 'ts:99;')
})

await t('assinatura HMAC válida é aceita; adulterada, ausente ou sem segredo é rejeitada', async () => {
  const segredo = 'segredo-de-teste'
  const ts = String(Date.now())
  const v1 = createHmac('sha256', segredo).update(`id:123456;request-id:r-1;ts:${ts};`).digest('hex')
  assert.deepEqual(await validarAssinaturaWebhook({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'r-1', dataId: '123456', segredo }), { valida: true })
  assert.equal((await validarAssinaturaWebhook({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'r-1', dataId: '999', segredo })).valida, false)
  assert.equal((await validarAssinaturaWebhook({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'r-2', dataId: '123456', segredo })).valida, false)
  assert.equal((await validarAssinaturaWebhook({ xSignature: null, xRequestId: 'r-1', dataId: '123456', segredo })).motivo, 'cabecalho_ausente')
  assert.equal((await validarAssinaturaWebhook({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'r-1', dataId: '123456', segredo: '' })).motivo, 'segredo_nao_configurado')
  assert.equal((await validarAssinaturaWebhook({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'r-1', dataId: '123456', segredo, toleranciaSegundos: 60, agoraMs: Number(ts) + 3600_000 })).motivo, 'fora_da_janela')
})

await t('leitura de notificação (webhook e IPN) e chave de idempotência estável', () => {
  const url = new URL('https://x/functions/v1/mp-webhook?data.id=55&type=payment')
  const corpo = { id: 9001, type: 'payment', action: 'payment.updated', data: { id: '55' } }
  const n = lerNotificacao(url, corpo)
  assert.deepEqual(n, { topico: 'payment', dataId: '55', acao: 'payment.updated' })
  const k1 = chaveEvento(n.topico, n.dataId, n.acao, corpo, 'req-a')
  const k2 = chaveEvento(n.topico, n.dataId, n.acao, corpo, 'req-b')
  assert.equal(k1, k2, 'reenvio da mesma notificação gera a mesma chave')
  assert.notEqual(k1, chaveEvento(n.topico, n.dataId, 'payment.created', { ...corpo, id: 9002 }, 'req-a'))
  const ipn = lerNotificacao(new URL('https://x/?topic=preapproval&id=pre_1'), null)
  assert.deepEqual(ipn, { topico: 'preapproval', dataId: 'pre_1', acao: '' })
})

await t('direito de arrependimento: 7 dias da contratação', () => {
  const agora = Date.parse('2026-10-22T12:00:00Z')
  assert.equal(elegivelArrependimento('2026-10-16T12:00:00Z', 7, agora), true)
  assert.equal(elegivelArrependimento('2026-10-14T12:00:00Z', 7, agora), false)
  assert.equal(elegivelArrependimento('2026-10-14T12:00:00Z', 3, agora), false, 'mínimo legal de 7 dias')
  assert.equal(elegivelArrependimento(null, 7, agora), false)
})

await t('e-mails transacionais renderizam e escapam conteúdo', () => {
  for (const m of ['assinatura_confirmada', 'pagamento_aprovado', 'falha_cobranca', 'assinatura_cancelada', 'pagamento_estornado', 'aviso']) {
    const r = renderizarEmail(m, { nome: '<script>x</script>', valor_centavos: 1990, acesso_ate: '2026-11-22T00:00:00Z' }, 'https://r2-fit-pro.vercel.app')
    assert.ok(r.assunto.length > 5, m)
    assert.ok(!r.html.includes('<script>x'), 'conteúdo deve ser escapado: ' + m)
  }
  assert.ok(renderizarEmail('assinatura_confirmada', { valor_centavos: 1990 }, 'https://s').html.includes('R$'))
  assert.throws(() => renderizarEmail('inexistente', {}, 'https://s'))
})

console.log(`\n${ok} testes passaram`)
