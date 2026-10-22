import { supabase } from './supabase'

export interface PrefsNotificacoes { email_cobranca: boolean; email_novidades: boolean; lembrete_treino: boolean }
export interface PrefsAudio { volume: number; mudo: boolean }
export interface Preferencias { notificacoes: PrefsNotificacoes; audio: PrefsAudio }

const PADRAO: Preferencias = {
  notificacoes: { email_cobranca: true, email_novidades: false, lembrete_treino: false },
  audio: { volume: 1, mudo: false },
}

export async function carregarPreferencias(userId: string): Promise<Preferencias> {
  const { data } = await supabase.from('user_settings').select('notificacoes, audio').eq('user_id', userId).maybeSingle()
  return {
    notificacoes: { ...PADRAO.notificacoes, ...(data?.notificacoes ?? {}) },
    audio: { ...PADRAO.audio, ...(data?.audio ?? {}) },
  }
}

export async function salvarPreferencias(userId: string, parcial: Partial<Preferencias>) {
  const { error } = await supabase.from('user_settings')
    .upsert({ user_id: userId, ...parcial, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}
