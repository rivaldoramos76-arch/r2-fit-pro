// Testes de interface (Playwright) com a API do Supabase simulada.
// Uso: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build --outDir <dir>
//      npx vite preview --outDir <dir> --port 4173 &  node tests/e2e/ui.test.mjs <pasta-screenshots>
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs'
import assert from 'node:assert/strict'

const BASE = 'http://localhost:4173'
const SHOTS = process.argv[2] ?? '.'
const UID = '11111111-2222-4333-8444-555555555555'
const agora = Math.floor(Date.now() / 1000)
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: agora + 3600 })}.assinatura`
const usuario = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cliente@teste.com', email_confirmed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', user_metadata: { nome: 'Cliente Teste' }, app_metadata: {} }
const sessao = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, user: usuario }
const CONFIG = [
  { chave: 'plano', valor: { produto: 'R2 Fit Pro', nome: 'R2 Fit Pro Premium', preco_centavos: 1990, moeda: 'BRL', intervalo: 'mensal', tolerancia_dias: 3, arrependimento_dias: 7, vendas_ativas: true, preco_anual_centavos: 19900, parcelas_max_anual: 12, beneficios: ['Treinos com IA', 'Dieta personalizada'] } },
  { chave: 'empresa', valor: { nome_fantasia: 'R2 Fit Pro', razao_social: null, cnpj: null, endereco: null, email_suporte: null, email_privacidade: null, telefone: null, encarregado_dados: null, foro: null } },
  { chave: 'textos', valor: { versao_termos: '2026-10-22', versao_privacidade: '2026-10-22', aviso_global: null, horario_suporte: null } },
]

const hojeISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
const registro = (refeicao, nome, quantidade, calorias, i) => ({ id: 'f' + i, user_id: UID, data: hojeISO, refeicao, nome, quantidade, calorias, proteina_g: 10, carboidrato_g: 20, gordura_g: 5, observacao: null, origem: 'texto', created_at: `${hojeISO}T0${i}:00:00Z` })
const REGISTROS = [registro('Café da manhã', 'Pão francês', '1 unidade', 135, 1), registro('Lanche da tarde', 'Banana prata', '1 unidade', 89, 2)]
const META = { user_id: UID, sexo: 'masculino', nascimento: '1990-05-10', altura_cm: 178, peso_kg: 82, atividade: 'moderado', objetivo: 'perder', ritmo_kg_semana: 0.5, calorias: 2280, proteina_g: 164, carboidrato_g: 233, gordura_g: 76, personalizada: false, somar_exercicio: false }
const DIETA = { id: 'd1', user_id: UID, nome: 'Plano Cutting', objetivo: 'Perda de gordura', calorias_dia: 600, created_at: '2026-10-20T00:00:00Z',
  plano: { nome: 'Plano Cutting', objetivo: 'Perda de gordura', calorias_dia: 600, macros: { proteina_g: 150, carboidrato_g: 180, gordura_g: 60 }, dicas: ['Beba água'],
    refeicoes: [{ nome: 'Café da manhã', horario: '07:00', calorias: 300, alimentos: [{ nome: 'Ovos mexidos', quantidade: '3 ovos', calorias: 210 }, { nome: 'Pão integral', quantidade: '1 fatia', calorias: 90 }] },
      { nome: 'Almoço', horario: '12:30', calorias: 300, alimentos: [{ nome: 'Frango grelhado', quantidade: '150 g', calorias: 300 }] }] } }
const CLIENTE = { id: '99999999-2222-4333-8444-555555555555', nome: 'Maria Cliente', email: 'maria@teste.com', criado_em: '2026-10-25T10:00:00Z', ultimo_login: '2026-10-29T10:00:00Z', email_confirmado: true, estado: 'sem_assinatura', admin: false, total: 1 }
const TREINO = { id: 't1', user_id: UID, nome: 'Treino teste', objetivo: 'Hipertrofia', nivel: 'Iniciante', frequencia_semanal: 3, created_at: '2026-10-20T00:00:00Z',
  plano: { versao: 2, dias: [{ id: 'd0', letra: 'A', dia: 'Treino A', exercicios: [{ id: 'e1', nome: 'Supino reto com barra', series: 2, tempo_execucao_segundos: 3, tempo_descanso_segundos: 2 }] }] } }
// Vozes de teste: tons curtos em WAV (o navegador reconhece o formato pelo conteúdo)
function tomWav(seg = 0.3, sr = 16000) {
  const n = Math.round(seg * sr), b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 4) * 12000), 44 + i * 2)
  return b
}

let ok = 0
const erros = []
const t = async (nome, f) => { try { await f(); ok++; console.log('✓', nome) } catch (e) { erros.push(nome); console.log('✗', nome, '\n   ', e.message.split('\n')[0]) } }

async function contexto(browser, { logado = false, estado = 'sem_assinatura', admin = false, acessoFalha = false, pagamentos = false, checkoutFalha = false, nutricao = false, treino = false, userAgent, viewport = { width: 390, height: 844 } } = {}) {
  const chamadasBilling = []
  const gravacoes = []
  const ctx = await browser.newContext({ viewport, ...(userAgent ? { userAgent } : {}) })
  await ctx.addInitScript(([s, logado]) => {
    sessionStorage.setItem('r2fit:welcome-visto', '1')
    if (logado) localStorage.setItem('sb-mock-auth-token', JSON.stringify(s))
  }, [sessao, logado])
  const premium = ['ativa', 'tolerancia', 'cancelada_vigente', 'admin', 'teste'].includes(estado)
  const testeAte = estado === 'teste' ? new Date(Date.now() + 5 * 86400000 - 3600000).toISOString() : null
  await ctx.route('https://mock.supabase.co/**', async rota => {
    const url = new URL(rota.request().url())
    const p = url.pathname
    const json = (corpo, status = 200) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) })
    if (p.startsWith('/auth/v1/user')) return json(usuario)
    if (p.startsWith('/auth/v1/token')) return json(sessao)
    if (p === '/rest/v1/rpc/meu_acesso') return acessoFalha ? json({ message: 'erro' }, 500) : json({ estado, premium, admin, teste_ate: testeAte })
    if (p === '/rest/v1/rpc/admin_metricas') return admin ? json({ usuarios_total: 3, usuarios_30d: 2, assinantes_ativos: 1, mrr_centavos: 1990, recebido_mes_centavos: 1990, recebido_total_centavos: 3980, pendente_centavos: 0, estornado_centavos: 0, projetado_proximo_mes_centavos: 1990, falhas_30d: 1, webhooks_erro_7d: 0, emails_pendentes: 2, tickets_abertos: 1, privacidade_abertas: 0, assinaturas_por_status: { ativa: 1 } }) : json({ message: 'Acesso negado' }, 400)
    if (p === '/rest/v1/app_config') return json(CONFIG)
    if (p === '/rest/v1/rpc/admin_usuarios') return admin ? json([CLIENTE]) : json({ message: 'Acesso negado' }, 400)
    if (p === '/rest/v1/rpc/admin_gerenciar_acesso') { gravacoes.push({ tabela: 'admin_gerenciar_acesso', corpo: rota.request().postDataJSON() }); return json({ estado: 'ativa', acesso_ate: '2099-12-31T23:59:59Z' }) }
    if (p === '/rest/v1/profiles') {
      const perfil = { id: UID, nome: 'Cliente Teste', email: usuario.email, telefone: null, data_nascimento: null, avatar_url: null, created_at: '2026-10-01T00:00:00Z', versao_termos: '2026-10-22', aceite_termos_em: '2026-10-01T00:00:00Z', marketing_opt_in: false }
      return json(rota.request().headers()['accept']?.includes('vnd.pgrst.object') ? perfil : [perfil])
    }
    if (p === '/rest/v1/user_settings') return json(rota.request().headers()['accept']?.includes('vnd.pgrst.object') ? { notificacoes: {}, audio: { volume: 0.8, mudo: false } } : [])
    if (nutricao && ['/rest/v1/food_logs', '/rest/v1/metas_nutricionais', '/rest/v1/alimentos_favoritos'].includes(p)) {
      const metodo = rota.request().method()
      if (metodo !== 'GET') { gravacoes.push({ tabela: p.split('/').pop(), metodo, corpo: rota.request().postDataJSON() }); return json(p.endsWith('favoritos') ? { id: 'fav1', ...rota.request().postDataJSON() } : []) }
      if (p.endsWith('food_logs')) return json(REGISTROS)
      if (p.endsWith('metas_nutricionais')) return json(nutricao === 'sem_meta' ? [] : [META])
      return json([])
    }
    if (treino && p === '/rest/v1/treinos') return json(rota.request().headers()['accept']?.includes('vnd.pgrst.object') ? TREINO : [TREINO])
    if (nutricao && p === '/rest/v1/dietas') {
      const objeto = rota.request().headers()['accept']?.includes('vnd.pgrst.object')
      if (rota.request().method() !== 'GET') { const corpo = rota.request().postDataJSON(); gravacoes.push({ tabela: 'dietas', metodo: rota.request().method(), corpo }); return json({ ...DIETA, ...corpo }) }
      return json(objeto ? DIETA : [DIETA])
    }
    if (p.startsWith('/rest/v1/')) return json([])
    if (p.startsWith('/functions/v1/r2-api/billing')) {
      const corpo = rota.request().postDataJSON() ?? {}
      chamadasBilling.push(corpo)
      if (!pagamentos) return json({ pagamentos_configurados: false, modo_teste: false })
      if (corpo.acao === 'checkout_avulso') return checkoutFalha ? json({ erro: 'Mercado Pago: pagamento indisponível' }, 400) : json({ url: BASE + '/assinatura/retorno?status=approved&payment_id=123' })
      if (corpo.acao === 'sincronizar') return json({ estado: 'ativa' })
      return json({ pagamentos_configurados: true, modo_teste: false, public_key: null })
    }
    return json({})
  })
  if (treino) {
    await ctx.route('**/audio/*.wav', r => r.fulfill({ status: 200, contentType: 'audio/wav', body: tomWav() }))
    await ctx.addInitScript(() => {
      const w = window
      w.__agendados = []; w.__mediaPlays = 0
      const start = AudioBufferSourceNode.prototype.start
      AudioBufferSourceNode.prototype.start = function (...a) { w.__agendados.push(a[0]); return start.apply(this, a) }
      const Orig = window.AudioContext
      window.AudioContext = class extends Orig { constructor(...a) { super(...a); w.__ctx = this } }
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function (...a) { w.__mediaPlays++; return play.apply(this, a) }
    })
  }
  const page = await ctx.newPage()
  page.chamadasBilling = chamadasBilling
  page.gravacoes = gravacoes
  page.consoleErros = []
  page.on('pageerror', e => page.consoleErros.push(e.message))
  return { ctx, page }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch())

for (const [nomeDisp, viewport] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  await t(`[${nomeDisp}] visitante vê a página comercial com preço vindo da configuração`, async () => {
    const { ctx, page } = await contexto(browser, { viewport })
    await page.goto(BASE + '/')
    await page.getByRole('heading', { name: /Seu personal de bolso/ }).waitFor()
    await page.getByText('R$ 19,90').first().waitFor()
    await page.getByText('Perguntas frequentes').waitFor()
    await page.screenshot({ path: `${SHOTS}/landing-${nomeDisp}.png`, fullPage: true })
    const larguraExcedente = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    assert.equal(larguraExcedente, false, 'sem rolagem horizontal')
    assert.deepEqual(page.consoleErros, [])
    await ctx.close()
  })
}

await t('visitante: Termos e Privacidade mostram campos empresariais pendentes', async () => {
  const { ctx, page } = await contexto(browser)
  await page.goto(BASE + '/termos')
  await page.getByRole('heading', { name: 'Termos de Uso' }).waitFor()
  await page.getByText('[a definir pelo responsável]').first().waitFor()
  await page.getByText(/R\$\s19,90 por mês/).waitFor()
  await page.goto(BASE + '/privacidade')
  await page.getByRole('heading', { name: 'Política de Privacidade' }).waitFor()
  await page.getByText(/OpenAI/).first().waitFor()
  await page.screenshot({ path: `${SHOTS}/privacidade.png` })
  await ctx.close()
})

await t('visitante: rota protegida redireciona para login com retorno', async () => {
  const { ctx, page } = await contexto(browser)
  await page.goto(BASE + '/treino')
  await page.waitForURL(/\/auth\?next=%2Ftreino/)
  await ctx.close()
})

await t('cadastro valida campos e exige aceite dos termos', async () => {
  const { ctx, page } = await contexto(browser)
  await page.goto(BASE + '/auth?modo=cadastro')
  await page.getByLabel('Nome').fill('Novo Cliente')
  await page.getByLabel('E-mail', { exact: true }).fill('novo@cliente.com')
  await page.getByLabel('Senha', { exact: true }).fill('curta')
  await page.getByRole('button', { name: 'Criar conta' }).last().click()
  await page.getByText('pelo menos 8 caracteres').first().waitFor()
  await page.getByLabel('Senha', { exact: true }).fill('SenhaForte1')
  await page.getByLabel('Confirmar senha').fill('SenhaForte1')
  await page.getByRole('button', { name: 'Criar conta' }).last().click()
  await page.getByText(/aceite os Termos de Uso/).waitFor()
  await page.screenshot({ path: `${SHOTS}/cadastro.png` })
  await ctx.close()
})

await t('login: 5 falhas bloqueiam novas tentativas temporariamente', async () => {
  const { ctx, page } = await contexto(browser)
  await ctx.unroute('https://mock.supabase.co/**')
  await ctx.route('https://mock.supabase.co/**', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }) }))
  await page.goto(BASE + '/auth')
  await page.getByLabel('E-mail', { exact: true }).fill('a@b.com')
  await page.getByLabel('Senha').fill('errada123')
  for (let i = 0; i < 5; i++) { await page.getByRole('button', { name: 'Entrar' }).last().click(); await page.waitForTimeout(250) }
  await page.getByText(/Muitas tentativas/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Entrar' }).last().isDisabled(), true)
  await ctx.close()
})

await t('usuário sem assinatura: paywall nos recursos Premium e CTA no início', async () => {
  const { ctx, page } = await contexto(browser, { logado: true })
  await page.goto(BASE + '/dashboard')
  await page.getByText('Ative o R2 Fit Pro Premium').waitFor()
  await page.goto(BASE + '/treino')
  await page.getByRole('heading', { name: 'Recurso Premium' }).waitFor()
  await page.screenshot({ path: `${SHOTS}/paywall.png` })
  await page.goto(BASE + '/calorias')
  await page.getByRole('heading', { name: 'Recurso Premium' }).waitFor()
  assert.deepEqual(page.consoleErros, [])
  await ctx.close()
})

await t('usuário sem assinatura acessa conta, menu, assinatura e pagamentos', async () => {
  const { ctx, page } = await contexto(browser, { logado: true })
  await page.goto(BASE + '/menu')
  for (const item of ['Início', 'Meus Treinos', 'Dieta', 'Diário alimentar', 'Meta diária', 'Perfil', 'Configurações', 'Minha Assinatura', 'Pagamentos e Faturas', 'Ajuda e Suporte', 'Termos de Uso', 'Política de Privacidade', 'Sobre o aplicativo']) {
    await page.getByRole('main').getByRole('link', { name: item, exact: true }).waitFor()
  }
  await page.getByRole('button', { name: 'Sair da conta' }).waitFor()
  assert.equal(await page.getByText('Painel administrativo').count(), 0, 'usuário comum não vê o painel')
  await page.getByRole('link', { name: /Assinar o Premium/ }).waitFor()
  await page.screenshot({ path: `${SHOTS}/menu.png`, fullPage: true })
  await page.goto(BASE + '/assinatura')
  await page.getByRole('heading', { name: 'Minha Assinatura' }).waitFor()
  await page.getByText('As assinaturas ainda não estão disponíveis').waitFor()
  await page.screenshot({ path: `${SHOTS}/assinatura.png`, fullPage: true })
  await page.goto(BASE + '/pagamentos')
  await page.getByText('Nenhum pagamento ainda').waitFor()
  await page.goto(BASE + '/configuracoes')
  await page.getByText('Áudio dos treinos').waitFor()
  await page.getByText('Baixar meus dados (JSON)').waitFor()
  await page.screenshot({ path: `${SHOTS}/configuracoes.png`, fullPage: true })
  await page.goto(BASE + '/perfil')
  await page.getByRole('heading', { name: 'Perfil' }).waitFor()
  await page.goto(BASE + '/suporte')
  await page.getByRole('heading', { name: 'Abrir chamado' }).waitFor()
  assert.deepEqual(page.consoleErros, [])
  await ctx.close()
})

await t('usuário comum é impedido de abrir o painel administrativo', async () => {
  const { ctx, page } = await contexto(browser, { logado: true })
  await page.goto(BASE + '/admin')
  await page.waitForURL(/\/dashboard/)
  await ctx.close()
})

await t('assinante ativo acessa os treinos', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa' })
  await page.goto(BASE + '/treino')
  await page.waitForTimeout(800)
  assert.equal(await page.getByRole('heading', { name: 'Recurso Premium' }).count(), 0)
  await page.screenshot({ path: `${SHOTS}/treinos-assinante.png` })
  await ctx.close()
})

await t('assinatura: escolhe plano e forma de pagamento (cartão, Pix/boleto, anual)', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, pagamentos: true })
  await page.goto(BASE + '/assinatura')
  await page.getByRole('radio', { name: /Cartão de crédito/ }).waitFor()
  // Sem chave pública do formulário de cartão, cai no checkout da conta Mercado Pago
  await page.getByRole('button', { name: 'Assinar com Mercado Pago' }).waitFor()
  await page.getByRole('radio', { name: /Pix, boleto/ }).click()
  await page.getByRole('button', { name: /Pagar R\$\s19,90 — 1 mês/ }).waitFor()
  await page.getByRole('radio', { name: /Anual/ }).click()
  await page.getByText('Economize 17%').waitFor()
  await page.getByText(/até 12x no cartão/).waitFor()
  assert.equal(await page.getByRole('radio', { name: /Cartão de crédito/ }).count(), 0, 'anual é pagamento único')
  await page.screenshot({ path: `${SHOTS}/assinatura-anual.png`, fullPage: true })
  await page.getByRole('button', { name: /Pagar R\$\s199,00 — 12 meses/ }).click()
  await page.waitForURL(/\/assinatura\/retorno/)
  await page.getByText('Acesso Premium liberado!').waitFor()
  assert.ok(page.chamadasBilling.some(c => c.acao === 'checkout_avulso' && c.periodo === 'anual'), 'pediu o checkout anual')
  assert.ok(page.chamadasBilling.some(c => c.acao === 'sincronizar' && c.payment_id === '123'), 'confirmou o pagamento devolvido pelo Mercado Pago')
  await ctx.close()
})

await t('erro no pagamento aparece em destaque no meio da tela', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, pagamentos: true, checkoutFalha: true })
  await page.goto(BASE + '/assinatura')
  await page.getByRole('radio', { name: /Pix, boleto/ }).click()
  await page.getByRole('button', { name: /Pagar R\$\s19,90 — 1 mês/ }).click()
  const popup = page.getByRole('alertdialog', { name: 'Pagamento não concluído' })
  await popup.waitFor()
  await popup.getByText('pagamento indisponível').waitFor()
  assert.ok(await popup.isVisible(), 'popup visível sem rolar a tela')
  await page.screenshot({ path: `${SHOTS}/popup-erro.png` })
  await popup.getByRole('button', { name: 'Entendi' }).click()
  assert.equal(await page.getByRole('alertdialog').count(), 0)
  await ctx.close()
})

await t('conta nova em teste grátis vê os dias restantes e o botão de assinar', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'teste' })
  await page.goto(BASE + '/menu')
  await page.getByText(/Teste grátis: faltam 5 dias/).waitFor()
  await page.getByRole('link', { name: /Assinar o Premium.*termina em 5 dias/ }).waitFor()
  await page.getByRole('main').getByText('Teste grátis', { exact: true }).waitFor()
  await page.screenshot({ path: `${SHOTS}/menu-teste.png`, fullPage: true })
  await page.goto(BASE + '/treino')
  assert.equal(await page.getByText('Recurso Premium').count(), 0, 'teste grátis libera os recursos')
  await ctx.close()
})

await t('início mostra o anel de calorias com meta, macros e refeições do dia', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', nutricao: true })
  await page.goto(BASE + '/dashboard')
  await page.getByRole('img', { name: '2.056 kcal restantes' }).waitFor()
  await page.getByText('233 g').waitFor()
  const refeicoes = page.getByRole('region', { name: 'Refeições de hoje' })
  for (const r of ['Café da manhã', 'Almoço', 'Jantar', 'Lanches']) await refeicoes.getByText(r, { exact: true }).waitFor()
  await refeicoes.getByText('Banana prata').waitFor()  // "Lanche da tarde" antigo entra em Lanches
  await page.screenshot({ path: `${SHOTS}/inicio-meta.png`, fullPage: true })
  await page.getByRole('link', { name: 'Adicionar em Jantar' }).click()
  await page.waitForURL(/\/calorias$/)
  const folha = page.getByRole('dialog')
  await folha.getByRole('button', { name: 'Jantar', pressed: true }).waitFor()
  await folha.getByRole('button', { name: 'Adicionar Pão francês' }).click()
  await folha.getByRole('button', { name: /Concluir \(1\)/ }).waitFor()
  const ins = page.gravacoes.find(g => g.tabela === 'food_logs' && g.metodo === 'POST')
  assert.equal(ins?.corpo?.[0]?.refeicao, 'Jantar'); assert.equal(ins?.corpo?.[0]?.nome, 'Pão francês')
  await folha.getByRole('button', { name: 'Adicionar aos favoritos' }).first().click()
  await folha.getByRole('button', { name: 'Remover dos favoritos' }).first().waitFor()
  assert.ok(page.gravacoes.some(g => g.tabela === 'alimentos_favoritos' && g.metodo === 'POST'), 'favoritou')
  await folha.getByText('Pão francês').click()
  await folha.getByRole('button', { name: 'Mais' }).click()
  assert.equal(await folha.getByLabel('Quantidade').inputValue(), '2')
  await folha.getByText('2 unidades').first().waitFor()
  await folha.getByText('270').waitFor() // 135 × 2
  await folha.getByLabel('Quantidade').fill('3')
  await folha.getByText('405').waitFor()
  await page.screenshot({ path: `${SHOTS}/porcoes.png` })
  assert.deepEqual(page.consoleErros, [])
  await ctx.close()
})

await t('meta personalizada: calorias e macros acompanham um ao outro', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', nutricao: true })
  await page.goto(BASE + '/meta')
  await page.getByRole('heading', { name: 'Sua meta diária' }).waitFor()
  await page.getByRole('button', { name: 'Ajustar valores' }).click()
  const cal = page.getByLabel('Calorias (kcal)')
  const prot = page.getByLabel('Proteína (g)')
  const antes = Number(await cal.inputValue())
  const protAntes = Number(await prot.inputValue())
  await prot.fill(String(protAntes + 25))
  assert.equal(Number(await cal.inputValue()), antes + 100, 'calorias sobem 4 kcal por grama de proteína')
  await cal.fill('3000')
  const p = Number(await prot.inputValue()), c = Number(await page.getByLabel('Carboidrato (g)').inputValue()), g = Number(await page.getByLabel('Gordura (g)').inputValue())
  assert.ok(Math.abs(p * 4 + c * 4 + g * 9 - 3000) <= 15, `macros acompanham as calorias (${p}/${c}/${g})`)
  await page.screenshot({ path: `${SHOTS}/meta-manual.png` })
  await page.getByRole('button', { name: 'Salvar minha meta' }).click()
  await page.waitForURL(/\/dashboard/)
  const salvo = page.gravacoes.find(x => x.tabela === 'metas_nutricionais')
  assert.equal(salvo?.corpo?.calorias, 3000); assert.equal(salvo?.corpo?.personalizada, true)
  assert.ok(Math.abs(salvo.corpo.proteina_g * 4 + salvo.corpo.carboidrato_g * 4 + salvo.corpo.gordura_g * 9 - 3000) <= 15)
  await ctx.close()
})

await t('diário: editar alimento já salvo e ajustar item da IA', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', nutricao: true })
  await page.goto(BASE + '/calorias')
  await page.getByRole('button', { name: 'Editar Pão francês' }).click()
  const folha = page.getByRole('dialog')
  await folha.getByRole('heading', { name: 'Editar alimento' }).waitFor()
  await folha.getByLabel('Quantidade').fill('2')
  await folha.getByText('270').waitFor()
  await folha.getByRole('button', { name: 'Jantar' }).click()
  await page.screenshot({ path: `${SHOTS}/editar-registro.png` })
  await folha.getByRole('button', { name: 'Salvar alterações' }).click()
  await folha.waitFor({ state: 'detached' })
  const upd = page.gravacoes.find(x => x.tabela === 'food_logs' && x.metodo === 'PATCH')
  assert.equal(upd?.corpo?.calorias, 270); assert.equal(upd?.corpo?.quantidade, '2 unidades'); assert.equal(upd?.corpo?.refeicao, 'Jantar')
  // Busca sem resultado leva para o cálculo com IA com o texto já preenchido
  await page.getByRole('button', { name: 'Adicionar alimento' }).first().click()
  await page.getByPlaceholder('Buscar nos recentes').fill('tapioca')
  await page.getByRole('button', { name: /Calcular "tapioca" com IA/ }).click()
  assert.equal(await page.getByLabel('O que você comeu?').inputValue(), 'tapioca')
  assert.deepEqual(page.consoleErros, [])
  await ctx.close()
})

await t('dieta: editar alimentos e salvar recalcula as calorias', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', nutricao: true })
  await page.goto(BASE + '/dieta/d1')
  await page.getByRole('heading', { name: 'Plano Cutting' }).waitFor()
  await page.getByText('Ajustar com IA').waitFor()
  await page.getByRole('button', { name: 'Editar' }).click()
  await page.getByRole('heading', { name: 'Editar plano' }).waitFor()
  await page.getByLabel('Calorias').first().fill('250')
  await page.getByText('640 kcal').waitFor()
  await page.screenshot({ path: `${SHOTS}/dieta-editar.png`, fullPage: true })
  await page.getByRole('button', { name: 'Salvar plano' }).click()
  await page.getByText('Plano atualizado.').waitFor()
  const salvo = page.gravacoes.find(x => x.tabela === 'dietas')
  assert.equal(salvo?.corpo?.calorias_dia, 640)
  assert.equal(salvo?.corpo?.plano?.refeicoes?.[0]?.calorias, 340)
  await ctx.close()
})

await t('perfil mostra o e-mail do cadastro e a data de nascimento da meta', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', nutricao: true })
  await page.goto(BASE + '/perfil')
  assert.equal(await page.getByLabel('E-mail', { exact: true }).inputValue(), 'cliente@teste.com')
  await page.waitForTimeout(400)
  assert.equal(await page.getByLabel('Data de nascimento (opcional)').inputValue(), '1990-05-10')
  assert.equal(await page.getByLabel('Novo e-mail').count(), 0, 'troca de e-mail só aparece ao pedir')
  await ctx.close()
})

await t('início mostra o lembrete para instalar com passo a passo', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', nutricao: true })
  await page.goto(BASE + '/dashboard')
  const card = page.getByRole('region', { name: 'Instalar o app' })
  await card.getByText('Instale o app no celular').waitFor()
  await card.getByRole('button', { name: /Como instalar/ }).click()
  await card.getByText('Adicionar à Tela de Início').waitFor()
  await card.getByRole('tab', { name: 'Android' }).click()
  await card.getByText('Instalar app').waitFor()
  await page.screenshot({ path: `${SHOTS}/instalar.png` })
  await ctx.close()
})

await t('contador: por cima da música toca só os avisos curtos, agendados, e retoma após interrupção', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', treino: true })
  await page.goto(BASE + '/assistente/t1/0')
  await page.getByRole('radio', { name: /Por cima da música/ }).waitFor()
  assert.equal(await page.getByRole('radio', { name: /Por cima da música/ }).getAttribute('aria-checked'), 'true', 'modo padrão')
  await page.getByRole('button', { name: /Iniciar treino/ }).click()
  await page.waitForTimeout(600)
  const agendados = await page.evaluate(() => window.__agendados.length)
  assert.equal(agendados, 19, '2 séries: 5-4-3-2-1 + comando por contagem (3 contagens) + aviso final')
  assert.equal(await page.evaluate(() => window.__mediaPlays), 0, 'não usa faixa de mídia (não pausa a música)')
  // Interrupção do sistema (ex.: tela bloqueada no iPhone): ao voltar, retoma e reagenda do ponto certo
  await page.evaluate(() => window.__ctx.suspend())
  await page.waitForTimeout(1200)
  assert.equal(await page.evaluate(() => window.__ctx.state), 'running', 'retomou sozinho')
  assert.ok(await page.evaluate(() => window.__agendados.length) > 19, 'reagendou os avisos restantes')
  // Sair e voltar para o app (como bloquear e desbloquear): a sessão é revalidada e a série não pode parar
  await page.evaluate(() => { window.__ctx.__marca = 'antes' })
  await page.evaluate(() => {
    const definir = v => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
    definir('hidden'); document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
    definir('visible'); document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
  await page.waitForTimeout(1500)
  assert.equal(await page.getByRole('button', { name: /Iniciar treino/ }).count(), 0, 'não voltou para a tela inicial do contador')
  assert.ok(await page.evaluate(() => window.__ctx.__marca === 'antes' && window.__ctx.state === 'running'), 'mesmo som continua tocando')
  await page.getByRole('button', { name: /Pausar/ }).click()
  await page.getByText('Pausado').waitFor()
  assert.equal(await page.evaluate(() => window.__ctx.state), 'suspended')
  await page.getByRole('button', { name: /Retomar/ }).click()
  await page.waitForFunction(() => window.__ctx.state === 'running')
  await page.getByRole('heading', { name: 'Exercício concluído!' }).waitFor({ timeout: 40000 })
  assert.deepEqual(page.consoleErros, [])
  await ctx.close()
})

await t('contador: aviso de tela desbloqueada só no iPhone; no Android a música abaixa nos avisos', async () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
  for (const [ua, deve] of [[iphone, true], [android, false]]) {
    const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', treino: true, userAgent: ua })
    await page.goto(BASE + '/assistente/t1/0')
    await page.getByRole('radio', { name: /Por cima da música/ }).waitFor()
    assert.equal(await page.getByRole('note').filter({ hasText: 'Só para iPhone' }).count(), deve ? 1 : 0, deve ? 'iPhone vê o aviso' : 'Android não vê')
    if (deve) {
      await page.screenshot({ path: `${SHOTS}/contador-iphone.png` })
      await page.getByRole('radio', { name: /Tela bloqueada/ }).click()
      assert.equal(await page.getByRole('note').count(), 0, 'aviso só no modo por cima da música')
      await page.getByRole('radio', { name: /Por cima da música/ }).click()
    }
    // Android pede ao sistema para abaixar a música durante os avisos (áudio curto silencioso); iPhone não
    await page.getByRole('button', { name: /Iniciar treino/ }).click()
    await page.waitForTimeout(2500)
    const plays = await page.evaluate(() => window.__mediaPlays)
    assert.ok(deve ? plays === 0 : plays >= 2, `abaixar música: ${plays} disparos`)
    assert.equal(await page.evaluate(() => window.__agendados.length), 19, 'voz continua agendada no Web Audio')
    await ctx.close()
  }
})

await t('contador: modo tela bloqueada usa a faixa contínua', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', treino: true })
  await page.goto(BASE + '/assistente/t1/0')
  await page.getByRole('radio', { name: /Tela bloqueada/ }).click()
  await page.getByText(/pausa a sua música/).waitFor()
  await page.getByRole('button', { name: /Iniciar treino/ }).click()
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.__mediaPlays), 1)
  assert.equal(await page.evaluate(() => window.__agendados.length), 0)
  await ctx.close()
})

await t('meta diária: assistente calcula e salva com exercício desligado', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'ativa', nutricao: 'sem_meta' })
  await page.goto(BASE + '/dashboard')
  await page.getByRole('link', { name: 'Calcular minha meta' }).click()
  await page.getByRole('heading', { name: 'Qual é o seu objetivo?' }).waitFor()
  await page.getByRole('button', { name: /Perder peso/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  assert.equal(await page.getByRole('button', { name: 'Continuar' }).isDisabled(), true, 'exige os dados')
  await page.getByRole('button', { name: 'masculino' }).click()
  await page.getByLabel('Data de nascimento').fill(`${new Date().getFullYear() - 30}-01-01`)  // 30 anos
  await page.getByLabel('Altura (cm)').fill('180')
  await page.getByLabel('Peso (kg)').fill('80')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: /Moderadamente ativo/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: /0,5 kg por semana/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('heading', { name: 'Sua meta diária' }).waitFor()
  await page.waitForTimeout(1300)
  await page.getByText('2.210').waitFor()
  await page.screenshot({ path: `${SHOTS}/meta-resultado.png` })
  await page.getByRole('button', { name: 'Salvar minha meta' }).click()
  await page.waitForURL(/\/dashboard/)
  const salvo = page.gravacoes.find(g => g.tabela === 'metas_nutricionais')
  assert.equal(salvo?.corpo?.calorias, 2210)
  assert.equal(salvo?.corpo?.somar_exercicio, false)
  assert.equal(salvo?.corpo?.personalizada, false)
  assert.deepEqual(page.consoleErros, [])
  await ctx.close()
})

await t('assinatura em tolerância mostra aviso de regularização', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, estado: 'tolerancia' })
  await page.goto(BASE + '/dashboard')
  await page.getByText(/Não conseguimos renovar sua assinatura/).waitFor()
  await ctx.close()
})

for (const [nomeDisp, viewport] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  await t(`[${nomeDisp}] administrador abre o painel com indicadores`, async () => {
    const { ctx, page } = await contexto(browser, { logado: true, estado: 'admin', admin: true, viewport })
    await page.goto(BASE + '/admin')
    await page.getByText('Receita recorrente mensal (MRR)').waitFor()
    await page.screenshot({ path: `${SHOTS}/admin-${nomeDisp}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Plano e empresa' }).click()
    await page.getByLabel('Preço mensal (R$)').waitFor()
    assert.equal(await page.getByLabel('Preço mensal (R$)').inputValue(), '19,90')
    await page.getByRole('button', { name: 'Usuários' }).click()
    await page.getByRole('button', { name: 'Gerenciar' }).click()
    const ficha = page.getByRole('dialog', { name: /Cliente maria@teste.com/ })
    await ficha.getByRole('button', { name: 'Liberar acesso' }).click()
    await ficha.getByRole('button', { name: 'Liberar acesso' }).last().click()
    await ficha.getByText(/Acesso até/).waitFor()
    const acao = page.gravacoes.find(x => x.tabela === 'admin_gerenciar_acesso')
    assert.equal(acao?.corpo?.p_acao, 'cortesia'); assert.equal(acao?.corpo?.p_user, CLIENTE.id)
    await page.screenshot({ path: `${SHOTS}/admin-cliente-${nomeDisp}.png` })
    assert.deepEqual(page.consoleErros, [])
    await ctx.close()
  })
}

await t('falha de rede ao verificar acesso mostra erro e opção de tentar novamente', async () => {
  const { ctx, page } = await contexto(browser, { logado: true, acessoFalha: true })
  await page.goto(BASE + '/dieta')
  await page.getByText('Não foi possível verificar seu acesso').waitFor()
  await page.getByRole('button', { name: 'Tentar novamente' }).waitFor()
  await ctx.close()
})

await browser.close()
console.log(`\n${ok} testes de interface passaram${erros.length ? `, ${erros.length} falharam: ${erros.join('; ')}` : ''}`)
process.exit(erros.length ? 1 : 0)
