import { supabase } from './supabase'
import { lembretesNativo } from './nativo'
import { normalizarRotina, rotinaVazia, textoAviso, type Rotina } from './rotinaBase'

// Ergogênicos: guardados nas preferências da pessoa (user_settings.preferencias.rotina; só ela lê e grava, por RLS).

export async function carregarRotina(userId: string): Promise<Rotina> {
  const { data, error } = await supabase.from('user_settings').select('preferencias').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.preferencias?.rotina ? normalizarRotina(data.preferencias.rotina) : rotinaVazia()
}

export async function salvarRotina(userId: string, rotina: Rotina): Promise<void> {
  // Lê as outras preferências para não apagar nada além da rotina
  const { data } = await supabase.from('user_settings').select('preferencias').eq('user_id', userId).maybeSingle()
  const preferencias = { ...(data?.preferencias ?? {}), rotina }
  const { error } = await supabase.from('user_settings')
    .upsert({ user_id: userId, preferencias, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error('Não foi possível salvar. Confira a internet e tente de novo.')
  await agendarRotinaApp(rotina).catch(() => {})
}

/** App Android: um alarme por item com lembrete ligado, na data da próxima vez e no horário escolhido.
 *  Se não marcar como feito, o app avisa de novo no dia seguinte, no mesmo horário. */
export async function agendarRotinaApp(rotina: Rotina) {
  const n = lembretesNativo()
  if (!n) return
  // App antigo (sem a rotina) recusa a chamada: só os avisos do celular ficam de fora
  await Promise.resolve().then(() => n.agendarRotina({
    itens: rotina.itens.filter(i => i.lembrete).map(i => {
      const { titulo, corpo } = textoAviso(i, rotina.discreto)
      return { id: `rotina-${i.id}`, data: i.proxima, hora: Number(i.horario.slice(0, 2)), minuto: Number(i.horario.slice(3, 5)), titulo, corpo }
    }),
  }))
}
