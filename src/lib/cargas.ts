// Histórico de carga: busca as sessões da pessoa (com o que foi feito em cada exercício).
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { historicoCargas, type PontoCarga, type SessaoComDetalhes } from './cargasBase'

let cache: { userId: string; em: number; mapa: Map<string, PontoCarga[]> } | null = null

export async function carregarHistoricoCargas(userId: string, forcar = false): Promise<Map<string, PontoCarga[]>> {
  if (!forcar && cache && cache.userId === userId && Date.now() - cache.em < 60_000) return cache.mapa
  const { data, error } = await supabase.from('sessoes_treino').select('data_inicio, detalhes')
    .eq('user_id', userId).eq('feito', true).order('data_inicio', { ascending: false }).limit(400)
  if (error) throw new Error(error.message)
  const mapa = historicoCargas((data ?? []) as SessaoComDetalhes[])
  cache = { userId, em: Date.now(), mapa }
  return mapa
}

export function useHistoricoCargas(userId: string | undefined) {
  const [mapa, setMapa] = useState<Map<string, PontoCarga[]> | null>(null)
  useEffect(() => {
    if (!userId) return
    carregarHistoricoCargas(userId).then(setMapa).catch(() => setMapa(new Map()))
  }, [userId])
  return mapa
}
