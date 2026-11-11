import { supabase } from './supabase'
import { lembretesNativo } from './nativo'
import { diaLocal, normalizarRotina, pendentesDoTreino, rotinaVazia, somarDias, textoAviso, vezFeita, type Rotina } from './rotinaBase'

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

/** App Android: um alarme por horário de cada item com lembrete ligado, na data da próxima vez.
 *  Se não marcar como feito, o app avisa de novo no dia seguinte, no mesmo horário.
 *  "Antes/depois do treino" não tem horário: o aviso sai quando o treino começa ou termina. */
export async function agendarRotinaApp(rotina: Rotina) {
  const n = lembretesNativo()
  if (!n) return
  const hoje = diaLocal()
  const itens = rotina.itens.filter(i => i.lembrete).flatMap(i => i.vezes.map((v, k) => {
    if (v.tipo !== 'horario') return null
    const { titulo, corpo } = textoAviso(i, rotina.discreto)
    // Vez já feita hoje (com o dia ainda incompleto): o próximo aviso dela é amanhã
    const data = i.proxima <= hoje && vezFeita(i, k, hoje) ? somarDias(hoje, 1) : i.proxima
    return { id: `rotina-${i.id}-${k}`, data, hora: Number(v.horario.slice(0, 2)), minuto: Number(v.horario.slice(3, 5)), titulo, corpo }
  }).filter((x): x is NonNullable<typeof x> => !!x))
  // App antigo (sem a rotina) recusa a chamada: só os avisos do celular ficam de fora
  await Promise.resolve().then(() => n.agendarRotina({ itens }))
}

/** Treino começando ("antes") ou terminando ("depois"): avisa no celular o que é desse momento. */
export async function avisarRotinaDoTreino(userId: string, momento: 'antes' | 'depois') {
  const n = lembretesNativo()
  if (!n) return
  const rotina = await carregarRotina(userId)
  const pend = pendentesDoTreino(rotina, momento).filter(p => p.item.lembrete)
  if (!pend.length) return
  const { titulo, corpo } = pend.length === 1 || !rotina.discreto
    ? textoAviso(pend[0].item, rotina.discreto, momento)
    : { titulo: 'Lembrete da sua rotina ⏰', corpo: `Você tem ${pend.length} itens ${momento === 'antes' ? 'antes' : 'depois'} do treino.` }
  await Promise.resolve().then(() => n.avisarAgora({ titulo, corpo, url: '/ergogenicos' }))
}
