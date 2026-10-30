// Rota /cron/emails da Edge Function r2-api: chamada pelo pg_cron (função billing_rotina).
// Autenticação por token de uso único gravado pelo próprio banco em cron_tokens (sem segredo compartilhado).
import { log } from '../_shared/http.ts'
import { clienteAdmin } from '../_shared/supa.ts'
import { processarFilaEmails } from '../_shared/email.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

/** Consome o token de uso único criado pelo banco (válido por 10 minutos). */
// deno-lint-ignore no-explicit-any
export async function tokenCronValido(admin: SupabaseClient, corpo: any): Promise<boolean> {
  const token = String(corpo?.token ?? '')
  if (!/^[0-9a-f]{64}$/.test(token)) return false
  const { data } = await admin.from('cron_tokens').delete().eq('token', token)
    .gt('created_at', new Date(Date.now() - 10 * 60_000).toISOString()).select('token')
  return Boolean(data?.length)
}

export async function handleCron(req: Request): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' })
  const corpo = await req.json().catch(() => ({}))
  const admin = clienteAdmin()
  if (!(await tokenCronValido(admin, corpo))) return resposta(401, { erro: 'Não autorizado' })
  const r = await processarFilaEmails(admin, 50)
  log('info', 'cron_emails', r)
  return resposta(200, { ok: true, ...r })
}
