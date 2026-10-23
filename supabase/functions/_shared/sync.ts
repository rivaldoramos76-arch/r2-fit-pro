// Busca recursos no Mercado Pago (fonte de verdade) e aplica no banco.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'
import { mp } from './mp.ts'
import { rpc } from './supa.ts'
import { normalizarAssinatura, normalizarPagamento, extrairPreapprovalId } from './mpLogic.ts'

export async function registrarPreapproval(admin: SupabaseClient, preId: string) {
  const pre = await mp('GET', `/preapproval/${encodeURIComponent(preId)}`)
  return await rpc<Record<string, unknown>>(admin, 'billing_registrar_assinatura', { p: normalizarAssinatura(pre) })
}

export async function registrarPagamento(admin: SupabaseClient, paymentId: string, preIdDica?: string | null) {
  const pag = await mp('GET', `/v1/payments/${encodeURIComponent(paymentId)}`)
  const preId = preIdDica ?? extrairPreapprovalId(pag)
  if (preId) {
    const { data } = await admin.from('subscriptions').select('id').eq('provider_subscription_id', preId).maybeSingle()
    if (!data) await registrarPreapproval(admin, preId)
  } else if (!normalizarPagamento(pag, null).user_id) {
    return { ignorado: true, motivo: 'pagamento sem vínculo com assinatura do R2 Fit Pro' }
  }
  return await rpc<Record<string, unknown>>(admin, 'billing_registrar_pagamento', { p: normalizarPagamento(pag, preId) })
}

export async function registrarAuthorizedPayment(admin: SupabaseClient, apId: string) {
  const ap = await mp('GET', `/authorized_payments/${encodeURIComponent(apId)}`)
  if (ap?.preapproval_id) await registrarPreapproval(admin, String(ap.preapproval_id))
  if (ap?.payment?.id) return await registrarPagamento(admin, String(ap.payment.id), ap.preapproval_id ? String(ap.preapproval_id) : null)
  return { ignorado: true, motivo: `cobrança agendada sem pagamento (status ${ap?.status ?? '?'})` }
}

/** Reconsulta assinatura e pagamentos de um usuário diretamente no Mercado Pago. */
export async function sincronizarUsuario(admin: SupabaseClient, userId: string) {
  const { data: subs } = await admin.from('subscriptions')
    .select('id, provider_subscription_id').eq('user_id', userId).not('provider_subscription_id', 'is', null)
    .order('created_at', { ascending: false }).limit(3)
  const avisos: string[] = []
  for (const s of subs ?? []) {
    await registrarPreapproval(admin, s.provider_subscription_id!)
    try {
      const busca = await mp('GET', `/authorized_payments/search?preapproval_id=${encodeURIComponent(s.provider_subscription_id!)}`)
      for (const ap of busca?.results ?? []) {
        if (ap?.payment?.id) await registrarPagamento(admin, String(ap.payment.id), s.provider_subscription_id)
      }
    } catch (e) {
      avisos.push(`authorized_payments: ${String(e)}`)
      const busca = await mp('GET', `/v1/payments/search?external_reference=${encodeURIComponent(userId)}&sort=date_created&criteria=desc&limit=20`)
      for (const pag of busca?.results ?? []) await registrarPagamento(admin, String(pag.id))
    }
  }
  return { assinaturas: subs?.length ?? 0, avisos }
}
