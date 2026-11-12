// Edge Function "r2-api": ponto único do backend do R2 Fit Pro.
//   POST /r2-api/webhook/mercadopago  → notificações do Mercado Pago (assinatura HMAC)
//   POST /r2-api/webhook/asaas        → eventos do Asaas (cabeçalho asaas-access-token)
//   POST /r2-api/billing               → checkout, sincronização, cancelamento (JWT do usuário)
//   POST /r2-api/conta                 → exclusão de conta (JWT do usuário + reautenticação)
//   POST /r2-api/admin                 → ações do painel admin com chave de serviço (JWT de admin)
//   POST /r2-api/cron/emails           → fila de e-mails (pg_cron, token de uso único)
//   POST /r2-api/lembretes             → notificações: inscrever aparelho, teste (JWT do usuário)
//   POST /r2-api/cron/lembretes        → envio dos lembretes vencidos (pg_cron, token de uso único)
//   POST /r2-api/cron/acomp-aviso      → notificação de mensagem do acompanhamento (gatilho do banco, token de uso único)
//   POST /r2-api/cron/personal-descontos → mensalidade dos personais pelo número de alunos pagantes (pg_cron diário)
//   POST /r2-api/cron/estornar         → estorno feito pelo suporte via banco (token de uso único)
//   POST /r2-api/app/lembrete          → apps Android até 1.8 chamavam aqui: repassa para r2-app/lembrete
import { handleBilling } from './billing.ts'
import { handleWebhook } from './webhook.ts'
import { handleConta } from './conta.ts'
import { handleCron } from './cron.ts'
import { handleAdmin } from './admin.ts'
import { handleLembretes, handleCronLembretes } from './lembretes.ts'
import { handleWebhookAsaas, handleCronAsaasWebhook } from './asaas.ts'
import { handleCronAcompAviso, handleCronPersonalDescontos } from './acompanhamento.ts'
import { handleCronEstornar } from './estorno.ts'
import { corsHeaders, json } from '../_shared/http.ts'

Deno.serve((req) => {
  const caminho = new URL(req.url).pathname.replace(/^.*\/r2-api/, '')
  if (caminho.startsWith('/webhook/mercadopago')) return handleWebhook(req)
  if (caminho.startsWith('/webhook/asaas')) return handleWebhookAsaas(req)
  if (caminho.startsWith('/cron/asaas-webhook')) return handleCronAsaasWebhook(req)
  if (caminho.startsWith('/billing')) return handleBilling(req)
  if (caminho.startsWith('/app/lembrete')) return repassarLembreteApp(req)
  if (caminho.startsWith('/conta')) return handleConta(req)
  if (caminho.startsWith('/cron/emails')) return handleCron(req)
  if (caminho.startsWith('/admin')) return handleAdmin(req)
  if (caminho.startsWith('/cron/lembretes')) return handleCronLembretes(req)
  if (caminho.startsWith('/lembretes')) return handleLembretes(req)
  if (caminho.startsWith('/cron/acomp-aviso')) return handleCronAcompAviso(req)
  if (caminho.startsWith('/cron/personal-descontos')) return handleCronPersonalDescontos(req)
  if (caminho.startsWith('/cron/estornar')) return handleCronEstornar(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (caminho === '/saude' || caminho === '/saude/') return json(req, { ok: true, servico: 'r2-api' })
  return json(req, { erro: 'Rota não encontrada' }, 404)
})

/** Apps Android até a 1.8 perguntavam "este lembrete ainda vale?" neste endereço; a resposta mora na função r2-app. */
async function repassarLembreteApp(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(req, { erro: 'Método não permitido' }, 405)
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) return json(req, { erro: 'Indisponível' }, 503)
  const r = await fetch(`${base}/functions/v1/r2-app/lembrete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await req.text(), signal: AbortSignal.timeout(7000),
  })
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } })
}
