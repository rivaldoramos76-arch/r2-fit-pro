// Treino perdido: busca o plano e os treinos feitos na semana, grava os ajustes e agenda o aviso de manhã do app.
import { supabase } from './supabase'
import { lembretesNativo } from './nativo'
import { normalizarTreino, salvarPlano, type TreinoCarregado } from './treinoApi'
import type { Treino } from '../types'
import { avisosDaSemana, dataLocal, hojeIso, inicioSemana, somar, temDiasDaSemana, type Agendado } from './semanaBase'

export interface Semana {
  treino: TreinoCarregado
  hoje: string
  /** dia_index de cada treino feito nesta semana */
  feitos: number[]
  hojeFeito: boolean
}

/** Plano mais recente da pessoa e os treinos feitos desde segunda. */
export async function carregarSemana(userId: string): Promise<Semana | null> {
  const { data } = await supabase.from('treinos').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
  const row = (data as Treino[] | null)?.[0]
  if (!row) return null
  const treino = normalizarTreino(row)
  const hoje = hojeIso()
  const [y, m, d] = inicioSemana(hoje).split('-').map(Number)
  const { data: sess } = await supabase.from('sessoes_treino').select('dia_index, data_inicio, data_fim')
    .eq('treino_id', treino.id).eq('feito', true).gte('data_inicio', new Date(y, m - 1, d).toISOString())
  const lista = (sess ?? []) as { dia_index: number; data_inicio: string; data_fim: string | null }[]
  return {
    treino, hoje,
    feitos: lista.map(s => s.dia_index),
    hojeFeito: lista.some(s => dataLocal(s.data_fim ?? s.data_inicio) === hoje),
  }
}

/** "Marcar como concluído": registra o treino daquele dia como feito (todas as séries), no meio do dia. */
export async function marcarConcluido(userId: string, treino: TreinoCarregado, perdido: Agendado): Promise<void> {
  const dia = treino.plano.dias[perdido.diaIdx]
  const exs = dia?.exercicios.filter(e => !e.temporarioAte) ?? []
  const [y, m, d] = perdido.data.split('-').map(Number)
  const inicio = new Date(y, m - 1, d, 12, 0, 0)
  const fim = new Date(inicio.getTime() + Math.max(20, dia?.duracao_estimada_min ?? 45) * 60_000)
  const { error } = await supabase.from('sessoes_treino').insert({
    user_id: userId, treino_id: treino.id, treino_nome: treino.nome, dia_index: perdido.diaIdx,
    series_realizadas: Object.fromEntries(exs.map(e => [e.id, Math.max(1, e.series)])),
    concluido: true, data_inicio: inicio.toISOString(), data_fim: fim.toISOString(),
  })
  if (error) throw new Error('Não foi possível salvar. Confira a internet e tente de novo.')
}

export async function salvarAjuste(treino: TreinoCarregado, plano: TreinoCarregado['plano']): Promise<TreinoCarregado> {
  try { return await salvarPlano(treino.id, plano) } catch { throw new Error('Não foi possível salvar. Confira a internet e tente de novo.') }
}

/** App Android: aviso às 8h do dia seguinte a cada dia de treino desta semana que ainda está sem treino. */
export async function agendarAvisosSemana(s: Semana | null) {
  const n = lembretesNativo()
  if (!n) return
  const itens = s && temDiasDaSemana(s.treino.plano)
    ? avisosDaSemana(s.treino.plano, s.hoje, s.feitos).map(a => ({
        id: `semana-${a.data}`, data: somar(a.data, 1), hora: 8, minuto: 0, url: '/dashboard',
        titulo: `Ontem ficou faltando o treino ${a.letra} 💪`,
        corpo: 'Toque para ajustar a semana: dividir nos próximos treinos ou encaixar num dia livre.',
      }))
    : []
  // App antigo (sem esse aviso) recusa a chamada: fica só sem o aviso
  await Promise.resolve().then(() => n.agendarRotina({ grupo: 'semana', itens }))
}

export const sincronizarAvisosSemana = (userId: string) => carregarSemana(userId).then(agendarAvisosSemana)
