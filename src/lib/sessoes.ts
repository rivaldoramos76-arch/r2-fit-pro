// Registro de conclusão por plano (treino_id) → sessão (sessoes_treino.id) → exercício (id).
// Uma sessão representa uma execução de um treino (A, B, C...). `series_realizadas`
// guarda as séries feitas de cada exercício: { [exercicioId]: séries feitas }. O exercício está concluído
// quando fez todas as séries previstas; com menos, conta como treino incompleto (vai para o diário igual).
// A sessão só é marcada como concluída quando todos os exercícios previstos foram feitos, mas com
// pelo menos 1 exercício feito ela já conta como treino (coluna `feito` no banco).
// Uma sessão incompleta sem atividade há mais de 6 horas fica encerrada: o próximo exercício abre outra.
// O Supabase é a fonte de verdade; o localStorage espelha os dados para uso offline.
import { supabase } from './supabase'

export interface Sessao {
  id: string
  treino_id: string
  dia_index: number
  concluido: boolean
  /** pelo menos 1 exercício feito (calculado no banco) */
  feito?: boolean
  series_realizadas: Record<string, number>
  data_inicio: string
  data_fim: string | null
}

/** Séries feitas de um exercício na sessão (aceita o formato antigo em lista). */
export function seriesFeitas(s: Pick<Sessao, 'series_realizadas'> | null | undefined, exercicioId: string): number {
  const v = (s?.series_realizadas as Record<string, unknown> | undefined)?.[exercicioId]
  return typeof v === 'number' ? v : Array.isArray(v) ? v.length : 0
}
/** Exercício com todas as séries previstas feitas. */
export const exercicioConcluido = (s: Pick<Sessao, 'series_realizadas'> | null | undefined, ex: { id: string; series: number }) =>
  seriesFeitas(s, ex.id) >= Math.max(1, ex.series)

const LIMITE_SESSAO_MS = 6 * 3600_000
/** Sessão ainda aberta: não concluída e com atividade nas últimas 6 horas. */
export function emAndamento(s: Sessao | null, agora = Date.now()): boolean {
  if (!s || s.concluido) return false
  const ultima = Date.parse(s.data_fim ?? s.data_inicio)
  return Number.isFinite(ultima) && agora - ultima < LIMITE_SESSAO_MS
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
    .select('dia_index, data_fim, data_inicio').eq('treino_id', treinoId).eq('feito', true)
    .order('data_inicio', { ascending: false }).limit(20)
  return ((data ?? []) as { dia_index: number; data_fim: string | null; data_inicio: string }[])
    .map(s => ({ dia_index: s.dia_index, data_fim: s.data_fim ?? s.data_inicio }))
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
  /** séries feitas até agora neste exercício (pode ser menos que as previstas) */
  series: number
  exerciciosDoTreino: { id: string; series: number }[]
}): Promise<Sessao> {
  const { userId, treinoId, treinoNome, dia, exercicioId, series, exerciciosDoTreino } = params
  let atual = await sessaoAtual(treinoId, dia)
  // sessão anterior já finalizada (ou incompleta e parada há horas) → nova sessão
  if (atual && !emAndamento(atual) && Object.keys(atual.series_realizadas ?? {}).length > 0) atual = null
  if (atual?.concluido) atual = null

  // Refazer um exercício nunca diminui o que já foi feito na mesma sessão
  const feitos = { ...(atual?.series_realizadas ?? {}), [exercicioId]: Math.max(series, seriesFeitas(atual, exercicioId)) }
  const todos = exerciciosDoTreino.length > 0 && exerciciosDoTreino.every(e => exercicioConcluido({ series_realizadas: feitos }, e))
  const agora = new Date().toISOString()
  // data_fim = hora do último exercício feito (mesmo com o treino incompleto)
  const campos = { series_realizadas: feitos, concluido: todos, data_fim: agora }

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
