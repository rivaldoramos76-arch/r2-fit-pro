// Dados pequenos do app guardados em user_settings.preferencias (só a pessoa lê e grava, por RLS):
// revisão semanal da meta, jejum... sem precisar de tabela própria.
import { supabase } from './supabase'

export async function carregarPrefsApp(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('user_settings').select('preferencias').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.preferencias ?? {}) as Record<string, unknown>
}

/** Grava uma chave sem apagar as outras. */
export async function salvarPrefApp(userId: string, chave: string, valor: unknown): Promise<void> {
  const atual = await carregarPrefsApp(userId).catch(() => ({}))
  const { error } = await supabase.from('user_settings')
    .upsert({ user_id: userId, preferencias: { ...atual, [chave]: valor }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error('Não foi possível salvar. Confira a internet e tente de novo.')
}
