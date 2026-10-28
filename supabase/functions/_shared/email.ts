// Envio de e-mails transacionais via Resend, a partir da fila email_outbox.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'
import { renderizarEmail } from './emailTemplates.ts'
import { log } from './http.ts'

export const siteUrl = () => (Deno.env.get('SITE_URL') ?? 'https://r2fitpro.com.br').replace(/\/$/, '')

export async function processarFilaEmails(admin: SupabaseClient, limite = 10): Promise<{ enviados: number; falhas: number; semProvedor: number }> {
  const chave = Deno.env.get('RESEND_API_KEY')
  const remetente = Deno.env.get('EMAIL_FROM')
  const r = { enviados: 0, falhas: 0, semProvedor: 0 }
  const { data: itens } = await admin.from('email_outbox')
    .select('*').in('status', ['pendente', 'erro']).lt('tentativas', 5)
    .order('created_at', { ascending: true }).limit(limite)
  for (const item of itens ?? []) {
    if (!chave || !remetente) {
      await admin.from('email_outbox').update({ status: 'sem_provedor', erro: 'RESEND_API_KEY/EMAIL_FROM não configurados' }).eq('id', item.id)
      r.semProvedor++
      continue
    }
    try {
      const { assunto, html } = renderizarEmail(item.modelo, item.dados ?? {}, siteUrl())
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'Idempotency-Key': item.id },
        body: JSON.stringify({ from: remetente, to: [item.destinatario], subject: assunto, html }),
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) throw new Error(`Resend ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
      await admin.from('email_outbox').update({ status: 'enviado', enviado_em: new Date().toISOString(), tentativas: item.tentativas + 1, erro: null }).eq('id', item.id)
      r.enviados++
    } catch (e) {
      log('warn', 'email_falhou', { id: item.id, modelo: item.modelo, erro: String(e) })
      await admin.from('email_outbox').update({ status: 'erro', tentativas: item.tentativas + 1, erro: String(e).slice(0, 500) }).eq('id', item.id)
      r.falhas++
    }
  }
  return r
}
