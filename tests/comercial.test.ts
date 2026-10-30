import assert from 'node:assert/strict'
import { mensagemAcomp } from '../supabase/functions/_shared/acompLogic'
import { createHmac } from 'node:crypto'
import {
  mapearStatusPagamento, paraCentavos, extrairPreapprovalId, normalizarPagamento, normalizarAssinatura,
  corpoCriarAssinatura, parseAssinaturaHeader, montarManifesto, validarAssinaturaWebhook, lerNotificacao,
  chaveEvento, elegivelArrependimento, corpoAssinaturaCartao, corpoPreferenciaAvulsa, lerCompraAvulsa,
  motivoRecusaCartao,
} from '../supabase/functions/_shared/mpLogic'
import { renderizarEmail } from '../supabase/functions/_shared/emailTemplates'
import { mensagemLembrete, lerInscricao } from '../supabase/functions/_shared/lembretesLogic'
import { cpfValido, dataSP, refAvulso, lerReferencia, mapearStatusAsaas, normalizarPagamentoAsaas, normalizarAssinaturaAsaas, corpoAssinaturaAsaas, corpoCobrancaAvulsaAsaas, lerEventoAsaas, tokenIgual } from '../supabase/functions/_shared/asaasLogic'
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

await t('Asaas: CPF, referências e status', () => {
  assert.equal(cpfValido('529.982.247-25'), true)
  assert.equal(cpfValido('52998224724'), false)
  assert.equal(cpfValido('111.111.111-11'), false)
  assert.equal(cpfValido('123'), false)
  assert.equal(dataSP(0, new Date('2026-10-30T02:00:00Z')), '2026-10-29', 'data no fuso de São Paulo')
  const uid = '11111111-2222-4333-8444-555555555555'
  assert.deepEqual(lerReferencia(refAvulso(uid, 12)), { userId: uid, avulso: true, meses: 12 })
  assert.deepEqual(lerReferencia(uid), { userId: uid, avulso: false, meses: 1 })
  assert.deepEqual(lerReferencia('lixo:avulso:5'), { userId: null, avulso: false, meses: 1 })
  assert.equal(mapearStatusAsaas('CONFIRMED'), 'aprovado'); assert.equal(mapearStatusAsaas('RECEIVED'), 'aprovado')
  assert.equal(mapearStatusAsaas('PENDING'), 'pendente'); assert.equal(mapearStatusAsaas('OVERDUE'), 'recusado')
  assert.equal(mapearStatusAsaas('REFUNDED'), 'estornado'); assert.equal(mapearStatusAsaas('CHARGEBACK_REQUESTED'), 'em_disputa')
  assert.equal(mapearStatusAsaas('PENDING', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'), 'recusado')
  assert.equal(mapearStatusAsaas('PENDING', 'PAYMENT_DELETED'), 'cancelado')
})

await t('Asaas: cobranças, assinaturas e corpos das requisições', () => {
  const uid = '11111111-2222-4333-8444-555555555555'
  const av = normalizarPagamentoAsaas({ id: 'pay_1', status: 'RECEIVED', value: 199, billingType: 'PIX', externalReference: refAvulso(uid, 12), confirmedDate: '2026-10-30', invoiceUrl: 'https://asaas.com/i/1' })
  assert.equal(av.provider, 'asaas'); assert.equal(av.avulso, true); assert.equal(av.meses, 12); assert.equal(av.user_id, uid)
  assert.equal(av.valor_centavos, 19900); assert.equal(av.metodo, 'pix'); assert.equal(av.pago_em, '2026-10-30T12:00:00-03:00'); assert.equal(av.status, 'aprovado')
  const rec = normalizarPagamentoAsaas({ id: 'pay_2', status: 'PENDING', value: 19.9, billingType: 'CREDIT_CARD', subscription: 'sub_9' }, 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED')
  assert.equal(rec.provider_subscription_id, 'sub_9'); assert.equal(rec.avulso, false); assert.equal(rec.status, 'recusado'); assert.equal(rec.status_detalhe, 'cartao_recusado')
  const est = normalizarPagamentoAsaas({ id: 'pay_3', status: 'REFUNDED', value: 19.9, externalReference: refAvulso(uid, 1) })
  assert.equal(est.valor_estornado_centavos, 1990)
  const sub = normalizarAssinaturaAsaas({ id: 'sub_9', status: 'ACTIVE', value: 19.9, externalReference: uid, nextDueDate: '2026-11-30', description: 'R2 Fit Pro Premium' })
  assert.equal(sub.provider_status, 'active'); assert.equal(sub.preco_centavos, 1990); assert.equal(sub.user_id, uid)
  assert.equal(normalizarAssinaturaAsaas({ id: 'sub_9', status: 'INACTIVE' }).provider_status, 'cancelled')
  assert.equal(normalizarAssinaturaAsaas({ id: 'sub_9' }, true).provider_status, 'cancelled')
  const agora = new Date('2026-10-30T15:00:00Z')
  const ca = corpoAssinaturaAsaas({ cliente: 'cus_1', userId: uid, planoNome: 'R2 Fit Pro Premium', precoCentavos: 1990, site: 'https://r2fitpro.com.br', agora })
  assert.equal(ca.billingType, 'CREDIT_CARD'); assert.equal(ca.cycle, 'MONTHLY'); assert.equal(ca.value, 19.9); assert.equal(ca.nextDueDate, '2026-10-30'); assert.equal(ca.externalReference, uid)
  assert.equal(ca.callback.successUrl, 'https://r2fitpro.com.br/assinatura/retorno?origem=asaas')
  const cv = corpoCobrancaAvulsaAsaas({ cliente: 'cus_1', userId: uid, planoNome: 'R2 Fit Pro Premium', meses: 12, precoCentavos: 19900, site: 'https://r2fitpro.com.br', agora })
  assert.equal(cv.billingType, 'UNDEFINED'); assert.equal(cv.dueDate, '2026-11-01'); assert.equal(cv.externalReference, refAvulso(uid, 12)); assert.match(cv.description, /12 meses/)
  assert.throws(() => corpoAssinaturaAsaas({ cliente: 'c', userId: uid, planoNome: 'x', precoCentavos: 300, site: 's' }))
  assert.deepEqual(lerEventoAsaas({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }), { id: 'evt_1', evento: 'PAYMENT_RECEIVED', pagamentoId: 'pay_1', assinaturaId: null })
  assert.equal(tokenIgual('abc', 'abc'), true); assert.equal(tokenIgual('abc', 'abd'), false); assert.equal(tokenIgual(null, 'abc'), false); assert.equal(tokenIgual('', ''), false)
})

await t('acompanhamento: notificação certa para aluno e personal', () => {
  const base = { id: 'm1', texto: 'Boa! Aumenta a carga semana que vem.', autorNome: 'Rafa', alunoId: 'al1', refId: null }
  const aluno = mensagemAcomp({ ...base, tipo: 'texto', paraPersonal: false })
  assert.equal(aluno.titulo, 'Rafa (seu personal)'); assert.equal(aluno.url, '/personal')
  assert.equal(mensagemAcomp({ ...base, tipo: 'treino', paraPersonal: false, refId: 't9' }).url, '/treino/t9')
  assert.equal(mensagemAcomp({ ...base, tipo: 'dieta', paraPersonal: false, refId: 'd9' }).url, '/dieta/d9')
  assert.equal(mensagemAcomp({ ...base, tipo: 'meta', paraPersonal: false }).url, '/meta')
  const personal = mensagemAcomp({ ...base, autorNome: 'Bia', tipo: 'texto', paraPersonal: true })
  assert.equal(personal.titulo, 'Bia'); assert.equal(personal.url, '/alunos/al1'); assert.equal(personal.tag, 'r2-acomp-al1')
  const longo = mensagemAcomp({ ...base, texto: 'x'.repeat(300), tipo: 'texto', paraPersonal: true })
  assert.equal(longo.corpo.length, 140); assert.ok(longo.corpo.endsWith('…'))
})

console.log(`\n${ok} testes passaram`)
