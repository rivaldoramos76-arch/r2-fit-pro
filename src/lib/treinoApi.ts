import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { normalizarPlano, type PlanoTreino } from './treinoModel'
import type { Treino } from '../types'

export interface TreinoCarregado extends Omit<Treino, 'plano'> { plano: PlanoTreino }

export function normalizarTreino(row: Treino): TreinoCarregado {
  return { ...row, plano: normalizarPlano(row.plano, row) }
}

export async function salvarPlano(id: string, plano: PlanoTreino): Promise<TreinoCarregado> {
  const { data, error } = await supabase.from('treinos').update({
    nome: plano.nome,
    objetivo: plano.objetivo,
    nivel: plano.nivel,
    frequencia_semanal: plano.frequencia_semanal,
    plano,
  }).eq('id', id).select().single()
  if (error) throw error
  return normalizarTreino(data as Treino)
}

export async function criarPlano(userId: string, plano: PlanoTreino): Promise<TreinoCarregado> {
  const { data, error } = await supabase.from('treinos').insert({
    user_id: userId,
    nome: plano.nome,
    objetivo: plano.objetivo,
    nivel: plano.nivel,
    frequencia_semanal: plano.frequencia_semanal,
    plano,
  }).select().single()
  if (error) throw error
  return normalizarTreino(data as Treino)
}

export function useTreino(id: string | undefined) {
  const [treino, setTreino] = useState<TreinoCarregado | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!id) return
    let vivo = true
    setLoading(true)
    supabase.from('treinos').select('*').eq('id', id).single().then(({ data, error }) => {
      if (!vivo) return
      if (error || !data) setErro('Treino não encontrado.')
      else setTreino(normalizarTreino(data as Treino))
      setLoading(false)
    })
    return () => { vivo = false }
  }, [id])

  const salvar = useCallback(async (plano: PlanoTreino) => {
    if (!id) return
    // atualização otimista; reverte se o servidor recusar
    const anterior = treino
    setTreino(t => (t ? { ...t, plano, nome: plano.nome } : t))
    try {
      const salvo = await salvarPlano(id, plano)
      setTreino(salvo)
    } catch (e) {
      setTreino(anterior)
      throw e
    }
  }, [id, treino])

  return { treino, loading, erro, salvar }
}
