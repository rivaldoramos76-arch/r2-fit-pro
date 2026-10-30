import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  mapearStatusPagamento, paraCentavos, extrairPreapprovalId, normalizarPagamento, normalizarAssinatura,
  corpoCriarAssinatura, parseAssinaturaHeader, montarManifesto, validarAssinaturaWebhook, lerNotificacao,
  chaveEvento, elegivelArrependimento, corpoAssinaturaCartao, corpoPreferenciaAvulsa, lerCompraAvulsa,
  motivoRecusaCartao,
} from '../supabase/functions/_shared/mpLogic'
import { renderizarEmail } from '../supabase/functions/_shared/emailTemplates'
import { mensagemLembrete, lerInscricao } from '../supabase/functions/_shared/lembretesLogic'
import { traduzirErroAuth } from '../src/lib/formatos'

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
  for (const m of ['assinatura_confirmada', 'pagamento_aprovado', 'falha_cobranca', 'assinatura_cancelada', 'pagamento_estornado', 'aviso', 'renovacao_lembrete', 'acesso_expirado', 'teste_lembrete', 'teste_encerrado']) {
    const r = renderizarEmail(m, { nome: '<script>x</script>', valor_centavos: 1990, acesso_ate: '2026-11-22T00:00:00Z' }, 'https://r2-fit-pro.vercel.app')
    assert.ok(r.assunto.length > 5, m)
    assert.ok(!r.html.includes('<script>x'), 'conteúdo deve ser escapado: ' + m)
  }
  assert.ok(renderizarEmail('assinatura_confirmada', { valor_centavos: 1990 }, 'https://s').html.includes('R$'))
  assert.ok(renderizarEmail('assinatura_confirmada', { valor_centavos: 19900, avulso: true }, 'https://s').html.includes('não renova automaticamente'))
  assert.ok(renderizarEmail('renovacao_lembrete', { acesso_ate: '2026-11-22T00:00:00Z' }, 'https://s').html.includes('https://s/assinatura'))
  assert.throws(() => renderizarEmail('inexistente', {}, 'https://s'))
})

await t('assinatura no cartão sem conta Mercado Pago usa token e já nasce autorizada', () => {
  const c = corpoAssinaturaCartao({ userId: UID, email: 'a@b.com', planoNome: 'R2 Fit Pro Premium', precoCentavos: 1990, voltarPara: 'https://x/r', cardTokenId: 'tok_123' })
  assert.equal(c.card_token_id, 'tok_123')
  assert.equal(c.status, 'authorized')
  assert.equal(c.external_reference, UID)
  assert.equal(c.auto_recurring.transaction_amount, 19.9)
  assert.throws(() => corpoAssinaturaCartao({ userId: UID, email: 'a@b.com', planoNome: 'p', precoCentavos: 1990, voltarPara: 'u', cardTokenId: '' }))
})

await t('compra avulsa (Pix/boleto/cartão) mensal e anual', () => {
  const base = { userId: UID, email: 'a@b.com', planoNome: 'R2 Fit Pro Premium', parcelasMax: 12, site: 'https://r2fitpro.com.br' }
  const m = corpoPreferenciaAvulsa({ ...base, periodo: 'mensal', precoCentavos: 1990 })
  assert.equal(m.items[0].unit_price, 19.9)
  assert.deepEqual(m.metadata, { r2_tipo: 'avulso', r2_meses: 1, r2_user: UID })
  assert.equal(m.payment_methods.installments, 1, 'mensal à vista')
  assert.equal(m.back_urls.success, 'https://r2fitpro.com.br/assinatura/retorno')
  assert.equal(m.external_reference, UID)
  const a = corpoPreferenciaAvulsa({ ...base, periodo: 'anual', precoCentavos: 19900 })
  assert.equal(a.metadata.r2_meses, 12)
  assert.equal(a.payment_methods.installments, 12)
  assert.equal(corpoPreferenciaAvulsa({ ...base, periodo: 'anual', precoCentavos: 19900, parcelasMax: 40 }).payment_methods.installments, 12)
  assert.throws(() => corpoPreferenciaAvulsa({ ...base, periodo: 'anual', precoCentavos: 50 }))
})

await t('pagamento avulso é reconhecido pelos metadados', () => {
  assert.deepEqual(lerCompraAvulsa({ metadata: { r2_tipo: 'avulso', r2_meses: 12 } }), { avulso: true, meses: 12 })
  assert.deepEqual(lerCompraAvulsa({ metadata: { r2_tipo: 'avulso', r2_meses: '1' } }), { avulso: true, meses: 1 })
  assert.deepEqual(lerCompraAvulsa({ metadata: { r2_tipo: 'avulso', r2_meses: 5 } }), { avulso: false, meses: 1 }, 'período desconhecido')
  assert.deepEqual(lerCompraAvulsa({}), { avulso: false, meses: 1 })
  const n = normalizarPagamento({ id: 9, status: 'approved', external_reference: UID, transaction_amount: 199, payment_type_id: 'bank_transfer', payment_method_id: 'pix', metadata: { r2_tipo: 'avulso', r2_meses: 12 } }, null)
  assert.equal(n.avulso, true); assert.equal(n.meses, 12); assert.equal(n.metodo, 'bank_transfer:pix'); assert.equal(n.user_id, UID)
})

await t('erros do Supabase Auth são traduzidos corretamente', () => {
  assert.equal(traduzirErroAuth('New password should be different from the old password.'), 'A nova senha deve ser diferente da atual.')
  assert.match(traduzirErroAuth('Password should be at least 8 characters.'), /Senha fraca/)
  assert.match(traduzirErroAuth('Password is known to be weak and easy to guess'), /Senha fraca/)
  assert.equal(traduzirErroAuth('Invalid login credentials'), 'E-mail ou senha incorretos.')
})

await t('recusa do cartão: mensagem pelo motivo do Mercado Pago', () => {
  assert.match(motivoRecusaCartao('cc_rejected_high_risk')!, /análise de segurança/)
  assert.match(motivoRecusaCartao('cc_rejected_insufficient_amount')!, /limite/)
  assert.match(motivoRecusaCartao('cc_rejected_bad_filled_security_code')!, /incorreto/)
  assert.match(motivoRecusaCartao('cc_rejected_other_reason')!, /banco emissor/)
  assert.equal(motivoRecusaCartao('accredited'), null)
  assert.equal(motivoRecusaCartao(null), null)
})

await t('lembretes: mensagem por tipo e validação da inscrição do aparelho', () => {
  assert.equal(mensagemLembrete('almoco')?.url, '/calorias')
  assert.equal(mensagemLembrete('treino')?.url, '/treino')
  assert.equal(mensagemLembrete('agua')?.tag, 'r2-agua')
  assert.equal(mensagemLembrete('outro'), null)
  const boa = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123def', keys: { p256dh: 'B'.repeat(87), auth: 'a1b2c3d4e5f6g7h8i9j0kw' } }
  assert.deepEqual(lerInscricao(boa), { endpoint: boa.endpoint, p256dh: boa.keys.p256dh, auth: boa.keys.auth })
  assert.equal(lerInscricao({ ...boa, endpoint: 'http://inseguro.com/x' }), null)
  assert.equal(lerInscricao({ ...boa, keys: { p256dh: 'curto', auth: 'x' } }), null)
  assert.equal(lerInscricao(null), null)
})

console.log(`\n${ok} testes passaram`)
