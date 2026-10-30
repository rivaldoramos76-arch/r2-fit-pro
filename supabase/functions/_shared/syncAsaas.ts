// Busca cobranças e assinaturas no Asaas (fonte de verdade) e aplica no banco.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.49.4'
import { asaas } from './asaas.ts'
import { rpc } from './supa.ts'
import { ErroHttp, log } from './http.ts'
import { corpoClienteAsaas, cpfValido, normalizarAssinaturaAsaas, normalizarPagamentoAsaas } from './asaasLogic.ts'

export async function registrarAssinaturaAsaas(admin: SupabaseClient, assinaturaId: string) {
  try {
    const sub = await asaas('GET', `/subscriptions/${encodeURIComponent(assinaturaId)}`)
    return await rpc<Record<string, unknown>>(admin, 'billing_registrar_assinatura', { p: normalizarAssinaturaAsaas(sub) })
  } catch (e) {
    // Assinatura apagada no Asaas: marca como cancelada se já existe aqui
    if (e instanceof ErroHttp && e.codigo === 'asaas_nao_encontrado') {
      const { data } = await admin.from('subscriptions').select('id').eq('provider_subscription_id', assinaturaId).maybeSingle()
      if (data) return await rpc<Record<string, unknown>>(admin, 'billing_registrar_assinatura', { p: normalizarAssinaturaAsaas({ id: assinaturaId }, true) })
      return { ignorado: true, motivo: 'assinatura inexistente' }
    }
    throw e
  }
}

/** Registra uma cobrança. Por padrão reconsulta no Asaas; `dados` serve de reserva (cobrança apagada)
 *  ou é usado direto quando `buscar` é falso (lista já obtida da API). */
// deno-lint-ignore no-explicit-any
export async function registrarPagamentoAsaas(admin: SupabaseClient, pagamentoId: string, evento = '', dados?: any, buscar = true) {
  // deno-lint-ignore no-explicit-any
  let pag: any = dados
  if (buscar || !dados) {
    try { pag = await asaas('GET', `/payments/${encodeURIComponent(pagamentoId)}`) } catch (e) {
      if (!(e instanceof ErroHttp && e.codigo === 'asaas_nao_encontrado' && dados)) throw e
    }
  }
  const p = normalizarPagamentoAsaas(pag, evento)
  if (p.provider_subscription_id) {
    const { data } = await admin.from('subscriptions').select('id').eq('provider_subscription_id', p.provider_subscription_id).maybeSingle()
    if (!data) await registrarAssinaturaAsaas(admin, p.provider_subscription_id)
  } else if (!p.user_id) {
    return { ignorado: true, motivo: 'cobrança sem vínculo com o R2 Fit Pro' }
  }
  return await rpc<Record<string, unknown>>(admin, 'billing_registrar_pagamento', { p })
}

/** Cliente Asaas do usuário: reaproveita o salvo; cria (exige CPF) ou atualiza o CPF informado. */
export async function garantirClienteAsaas(admin: SupabaseClient, user: User, cpf?: string): Promise<string> {
  if (cpf && !cpfValido(cpf)) throw new ErroHttp(400, 'CPF inválido. Confira os números.', 'cpf_invalido')
  const { data: salvo } = await admin.from('asaas_clientes').select('customer_id').eq('user_id', user.id).maybeSingle()
  if (salvo?.customer_id) {
    if (cpf) await asaas('PUT', `/customers/${encodeURIComponent(salvo.customer_id)}`, { cpfCnpj: cpf.replace(/\D/g, '') })
    return salvo.customer_id
  }
  // Já existe no Asaas (ex.: tentativa anterior)?
  const busca = await asaas('GET', `/customers?externalReference=${encodeURIComponent(user.id)}&limit=1`)
  let id: string | undefined = busca?.data?.[0]?.id
  if (id && cpf) await asaas('PUT', `/customers/${encodeURIComponent(id)}`, { cpfCnpj: cpf.replace(/\D/g, '') })
  if (!id) {
    if (!cpf) throw new ErroHttp(400, 'Informe seu CPF para pagar.', 'cpf_necessario')
    const { data: perfil } = await admin.from('profiles').select('nome').eq('id', user.id).maybeSingle()
    const nome = String(perfil?.nome ?? user.user_metadata?.nome ?? '').trim() || (user.email ?? '').split('@')[0]
    const cliente = await asaas('POST', '/customers', corpoClienteAsaas({ userId: user.id, nome, email: user.email!, cpf }))
    id = String(cliente.id)
  }
  await admin.from('asaas_clientes').upsert({ user_id: user.id, customer_id: id }, { onConflict: 'user_id' })
  return id
}

/** Reconsulta no Asaas as assinaturas e cobranças do usuário. */
export async function sincronizarUsuarioAsaas(admin: SupabaseClient, userId: string) {
  const avisos: string[] = []
  const { data: subs } = await admin.from('subscriptions').select('provider_subscription_id')
    .eq('user_id', userId).eq('provider', 'asaas').not('provider_subscription_id', 'is', null)
    .order('created_at', { ascending: false }).limit(3)
  for (const s of subs ?? []) {
    try { await registrarAssinaturaAsaas(admin, s.provider_subscription_id!) } catch (e) { avisos.push(String(e)) }
  }
  const { data: cli } = await admin.from('asaas_clientes').select('customer_id').eq('user_id', userId).maybeSingle()
  if (cli?.customer_id) {
    try {
      const lista = await asaas('GET', `/payments?customer=${encodeURIComponent(cli.customer_id)}&limit=20`)
      for (const pag of lista?.data ?? []) {
        try { await registrarPagamentoAsaas(admin, String(pag.id), '', pag, false) } catch (e) { avisos.push(String(e)) }
      }
    } catch (e) { avisos.push(String(e)) }
  }
  if (avisos.length) log('warn', 'sincronizar_asaas', { user: userId, avisos: avisos.slice(0, 3) })
  return { assinaturas: subs?.length ?? 0, avisos }
}
