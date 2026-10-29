// Edge Function "r2-api": ponto único do backend do R2 Fit Pro.
//   POST /r2-api/webhook/mercadopago  → notificações do Mercado Pago (assinatura HMAC)
//   POST /r2-api/billing               → checkout, sincronização, cancelamento (JWT do usuário)
//   POST /r2-api/conta                 → exclusão de conta (JWT do usuário + reautenticação)
//   POST /r2-api/cron/emails           → fila de e-mails (pg_cron, token de uso único)
import { handleBilling } from './billing.ts'
import { handleWebhook } from './webhook.ts'
import { handleConta } from './conta.ts'
import { handleCron } from './cron.ts'
import { corsHeaders, json } from '../_shared/http.ts'

Deno.serve((req) => {
  const caminho = new URL(req.url).pathname.replace(/^.*\/r2-api/, '')
  if (caminho.startsWith('/webhook/mercadopago')) return handleWebhook(req)
  if (caminho.startsWith('/billing')) return handleBilling(req)
  if (caminho.startsWith('/conta')) return handleConta(req)
  if (caminho.startsWith('/cron/emails')) return handleCron(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (caminho === '/saude' || caminho === '/saude/') return json(req, { ok: true, servico: 'r2-api' })
  return json(req, { erro: 'Rota não encontrada' }, 404)
})
