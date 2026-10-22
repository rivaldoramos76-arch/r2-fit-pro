// Registro de conclusão por plano (treino_id) → sessão (sessoes_treino.id) → exercício (id).
// Uma sessão representa uma execução de um treino (A, B, C...). `series_realizadas`
// guarda apenas exercícios concluídos: { [exercicioId]: séries feitas }.
// A sessão só é marcada como concluída quando todos os exercícios previstos foram feitos.
// O Supabase é a fonte de verdade; o localStorage espelha os dados para uso offline.
import { supabase } from './supabase'

export interface Sessao {
  id: string
  treino_id: string
  dia_index: number
  concluido: boolean
  series_realizadas: Record<string, number>
  data_inicio: string
  data_fim: string | null
}

const chaveLocal = (treinoId: string, dia: number) => `r2fit_sessao_${treinoId}_${dia}`

function lerLocal(treinoId: string, dia: number): Sessao | null {
  try {
    const s = localStorage.getItem(chaveLocal(treinoId, dia))
    return s ? (JSON.parse(s) as Sessao) : null
  } catch { return null }
}

function salvarLocal(s: Sessao) {
  try { localStorage.setItem(chaveLocal(s.treino_id, s.dia_index), JSON.stringify(s)) } catch { /* ignore */ }
}

/** Última sessão do treino (pode já estar concluída). */
export async function sessaoAtual(treinoId: string, dia: number): Promise<Sessao | null> {
  const { data, error } = await supabase.from('sessoes_treino')
    .select('id, treino_id, dia_index, concluido, series_realizadas, data_inicio, data_fim')
    .eq('treino_id', treinoId).eq('dia_index', dia)
    .order('data_inicio', { ascending: false }).limit(1)
  if (error) return lerLocal(treinoId, dia)
  const s = (data?.[0] as Sessao | undefined) ?? null
  const local = lerLocal(treinoId, dia)
  // conclusão registrada offline que ainda não chegou ao servidor
  if (local && local.id.startsWith('local-') && (!s || s.concluido)) return local
  if (s) salvarLocal(s)
  return s
}

/** Última sessão concluída de cada treino do plano (para sugerir o próximo). */
export async function ultimasConcluidas(treinoId: string): Promise<{ dia_index: number; data_fim: string }[]> {
  const { data } = await supabase.from('sessoes_treino')
    .select('dia_index, data_fim').eq('treino_id', treinoId).eq('concluido', true)
    .order('data_fim', { ascending: false }).limit(20)
  return (data ?? []) as { dia_index: number; data_fim: string }[]
}

/**
 * Marca um exercício como concluído na sessão em andamento (cria a sessão se preciso).
 * Retorna a sessão atualizada.
 */
export async function concluirExercicio(params: {
  userId: string
  treinoId: string
  treinoNome: string
  dia: number
  exercicioId: string
  series: number
  exerciciosDoTreino: string[]
}): Promise<Sessao> {
  const { userId, treinoId, treinoNome, dia, exercicioId, series, exerciciosDoTreino } = params
  let atual = await sessaoAtual(treinoId, dia)
  if (atual?.concluido) atual = null // sessão anterior já finalizada → nova sessão

  const feitos = { ...(atual?.series_realizadas ?? {}), [exercicioId]: series }
  const todos = exerciciosDoTreino.length > 0 && exerciciosDoTreino.every(id => feitos[id] != null)
  const agora = new Date().toISOString()
  const campos = { series_realizadas: feitos, concluido: todos, data_fim: todos ? agora : null }

  let salva: Sessao | null = null
  if (atual && !atual.id.startsWith('local-')) {
    const { data } = await supabase.from('sessoes_treino').update(campos).eq('id', atual.id).select().single()
    salva = (data as Sessao) ?? null
  } else {
    const { data } = await supabase.from('sessoes_treino').insert({
      user_id: userId, treino_id: treinoId, treino_nome: treinoNome, dia_index: dia,
      data_inicio: atual?.data_inicio ?? agora, ...campos,
    }).select().single()
    salva = (data as Sessao) ?? null
  }
  const final: Sessao = salva ?? {
    id: atual?.id ?? `local-${Date.now()}`, treino_id: treinoId, dia_index: dia,
    data_inicio: atual?.data_inicio ?? agora, ...campos,
  }
  salvarLocal(final)
  return final
}

/** Desfaz a conclusão de um exercício (ex.: marcado por engano). */
export async function desmarcarExercicio(sessao: Sessao, exercicioId: string): Promise<Sessao> {
  const feitos = { ...sessao.series_realizadas }
  delete feitos[exercicioId]
  const nova: Sessao = { ...sessao, series_realizadas: feitos, concluido: false, data_fim: null }
  if (!sessao.id.startsWith('local-')) {
    await supabase.from('sessoes_treino').update({ series_realizadas: feitos, concluido: false, data_fim: null }).eq('id', sessao.id)
  }
  salvarLocal(nova)
  return nova
}

/** Inicia uma nova execução do treino (zera os indicadores sem apagar o histórico). */
export async function novaSessao(userId: string, treinoId: string, treinoNome: string, dia: number): Promise<Sessao> {
  const agora = new Date().toISOString()
  const { data } = await supabase.from('sessoes_treino').insert({
    user_id: userId, treino_id: treinoId, treino_nome: treinoNome, dia_index: dia,
    data_inicio: agora, concluido: false, series_realizadas: {},
  }).select().single()
  const s: Sessao = (data as Sessao) ?? {
    id: `local-${Date.now()}`, treino_id: treinoId, dia_index: dia, concluido: false,
    series_realizadas: {}, data_inicio: agora, data_fim: null,
  }
  salvarLocal(s)
  return s
}
