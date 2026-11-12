// Sequência de treinos e conquistas: busca os treinos feitos e os recordes de carga.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { carregarHistoricoCargas } from './cargas'
import { recordesBatidos } from './cargasBase'
import { sequenciaETreinos, type Sequencia } from './progressoBase'
import { dataLocalHoje } from './treinoModel'

export async function carregarSequencia(userId: string): Promise<Sequencia> {
  const [{ data: sess }, { data: treinos }, cargas] = await Promise.all([
    supabase.from('sessoes_treino').select('data_inicio').eq('user_id', userId).eq('feito', true).order('data_inicio', { ascending: false }).limit(1000),
    supabase.from('treinos').select('frequencia_semanal').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
    carregarHistoricoCargas(userId).catch(() => new Map()),
  ])
  const recordes = [...cargas.values()].reduce((n, pts) => n + recordesBatidos(pts).length, 0)
  const freq = Number((treinos as { frequencia_semanal: number }[] | null)?.[0]?.frequencia_semanal) || 3
  return sequenciaETreinos(((sess ?? []) as { data_inicio: string }[]).map(s => s.data_inicio), freq, recordes, dataLocalHoje())
}

export function useSequencia(userId: string | undefined) {
  const [s, setS] = useState<Sequencia | null>(null)
  useEffect(() => { if (userId) carregarSequencia(userId).then(setS).catch(() => {}) }, [userId])
  return s
}
