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
  { chave: 'plano', valor: { produto: 'R2 Fit Pro', nome: 'R2 Fit Pro Premium', preco_centavos: 1990, moeda: 'BRL', intervalo: 'mensal', tolerancia_dias: 3, arrependimento_dias: 7, vendas_ativas: true, beneficios: ['Treinos com IA', 'Dieta personalizada'] } },
  { chave: 'empresa', valor: { nome_fantasia: 'R2 Fit Pro', razao_social: null, cnpj: null, endereco: null, email_suporte: null, email_privacidade: null, telefone: null, encarregado_dados: null, foro: null } },
  { chave: 'textos', valor: { versao_termos: '2026-10-22', versao_privacidade: '2026-10-22', aviso_global: null, horario_suporte: null } },
]

let ok = 0
const erros = []
const t = async (nome, f) => { try { await f(); ok++; console.log('✓', nome) } catch (e) { erros.push(nome); console.log('✗', nome, '\n   ', e.message.split('\n')[0]) } }

async function contexto(browser, { logado = false, estado = 'sem_assinatura', admin = false, acessoFalha = false, viewport = { width: 390, height: 844 } } = {}) {
  const ctx = await browser.newContext({ viewport })
  await ctx.addInitScript(([s, logado]) => {
    sessionStorage.setItem('r2fit:welcome-visto', '1')
    if (logado) localStorage.setItem('sb-mock-auth-token', JSON.stringify(s))
  }, [sessao, logado])
  const premium = ['ativa', 'tolerancia', 'cancelada_vigente', 'admin'].includes(estado)
  await ctx.route('https://mock.supabase.co/**', async rota => {
    const url = new URL(rota.request().url())
    const p = url.pathname
    const json = (corpo, status = 200) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) })
    if (p.startsWith('/auth/v1/user')) return json(usuario)
    if (p.startsWith('/auth/v1/token')) return json(sessao)
    if (p === '/rest/v1/rpc/meu_acesso') return acessoFalha ? json({ message: 'erro' }, 500) : json({ estado, premium, admin })
    if (p === '/rest/v1/rpc/admin_metricas') return admin ? json({ usuarios_total: 3, usuarios_30d: 2, assinantes_ativos: 1, mrr_centavos: 1990, recebido_mes_centavos: 1990, recebido_total_centavos: 3980, pendente_centavos: 0, estornado_centavos: 0, projetado_proximo_mes_centavos: 1990, falhas_30d: 1, webhooks_erro_7d: 0, emails_pendentes: 2, tickets_abertos: 1, privacidade_abertas: 0, assinaturas_por_status: { ativa: 1 } }) : json({ message: 'Acesso negado' }, 400)
    if (p === '/rest/v1/app_config') return json(CONFIG)
    if (p === '/rest/v1/profiles') {
      const perfil = { id: UID, nome: 'Cliente Teste', email: usuario.email, telefone: null, data_nascimento: null, avatar_url: null, created_at: '2026-10-01T00:00:00Z', versao_termos: '2026-10-22', aceite_termos_em: '2026-10-01T00:00:00Z', marketing_opt_in: false }
      return json(rota.request().headers()['accept']?.includes('vnd.pgrst.object') ? perfil : [perfil])
    }
    if (p === '/rest/v1/user_settings') return json(rota.request().headers()['accept']?.includes('vnd.pgrst.object') ? { notificacoes: {}, audio: { volume: 0.8, mudo: false } } : [])
    if (p.startsWith('/rest/v1/')) return json([])
    if (p.startsWith('/functions/v1/r2-api/billing')) return json({ pagamentos_configurados: false, modo_teste: false })
    return json({})
  })
  const page = await ctx.newPage()
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
  for (const item of ['Início', 'Meus Treinos', 'Dieta', 'Contador de Calorias', 'Perfil', 'Configurações', 'Minha Assinatura', 'Pagamentos e Faturas', 'Ajuda e Suporte', 'Termos de Uso', 'Política de Privacidade', 'Sobre o aplicativo']) {
    await page.getByRole('main').getByRole('link', { name: item, exact: true }).waitFor()
  }
  await page.getByRole('button', { name: 'Sair da conta' }).waitFor()
  assert.equal(await page.getByText('Painel administrativo').count(), 0, 'usuário comum não vê o painel')
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
