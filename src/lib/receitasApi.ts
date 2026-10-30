import { supabase } from './supabase'
import type { Alimento } from './diario'

export interface Receita {
  id: string
  nome: string
  porcoes: number
  /** Peso da receita pronta, em gramas (opcional) */
  peso_final_g: number | null
  ingredientes: Alimento[]
  modo_preparo: string | null
  updated_at?: string
}

const normalizar = (r: Receita): Receita => ({ ...r, porcoes: Number(r.porcoes), peso_final_g: r.peso_final_g == null ? null : Number(r.peso_final_g), ingredientes: Array.isArray(r.ingredientes) ? r.ingredientes : [] })

export async function listarReceitas(userId: string): Promise<Receita[]> {
  const { data, error } = await supabase.from('receitas').select('id, nome, porcoes, peso_final_g, ingredientes, modo_preparo, updated_at').eq('user_id', userId).order('nome')
  if (error) throw new Error(error.message)
  return ((data as Receita[]) ?? []).map(normalizar)
}

export async function buscarReceita(id: string): Promise<Receita | null> {
  const { data } = await supabase.from('receitas').select('id, nome, porcoes, peso_final_g, ingredientes, modo_preparo').eq('id', id).maybeSingle()
  return data ? normalizar(data as Receita) : null
}

export async function salvarReceita(userId: string, r: Omit<Receita, 'id'> & { id?: string }): Promise<Receita> {
  const ingredientes = r.ingredientes.map(i => ({
    nome: i.nome, quantidade: i.quantidade, calorias: Math.round(i.calorias),
    proteina_g: i.proteina_g, carboidrato_g: i.carboidrato_g, gordura_g: i.gordura_g,
  }))
  const corpo = { user_id: userId, nome: r.nome.trim(), porcoes: r.porcoes, peso_final_g: r.peso_final_g || null, ingredientes, modo_preparo: r.modo_preparo?.trim() || null }
  const q = r.id ? supabase.from('receitas').update(corpo).eq('id', r.id) : supabase.from('receitas').insert(corpo)
  const { data, error } = await q.select('id, nome, porcoes, peso_final_g, ingredientes, modo_preparo').single()
  if (error) throw new Error(error.message)
  return normalizar(data as Receita)
}

export async function apagarReceita(id: string) {
  const { error } = await supabase.from('receitas').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Tudo que o relatório da semana precisa (7 dias a partir de `inicio`). */
export async function dadosDaSemana(userId: string, inicio: string, fim: string) {
  const intervalo = <T>(tabela: string, campos: string) =>
    supabase.from(tabela).select(campos).eq('user_id', userId).gte('data', inicio).lte('data', fim).then(r => (r.data as T[]) ?? [])
  const [alimentos, agua, exercicios, pesos, treinos] = await Promise.all([
    intervalo<{ data: string; nome: string; calorias: number; proteina_g: number; carboidrato_g: number; gordura_g: number }>('food_logs', 'data, nome, calorias, proteina_g, carboidrato_g, gordura_g'),
    intervalo<{ data: string; ml: number }>('registros_agua', 'data, ml'),
    intervalo<{ data: string; calorias: number; duracao_min: number }>('exercicios_registro', 'data, calorias, duracao_min'),
    supabase.from('registros_peso').select('data, peso_kg').eq('user_id', userId).lte('data', fim).order('data', { ascending: false }).limit(20)
      .then(r => ((r.data as { data: string; peso_kg: number }[]) ?? []).map(p => ({ ...p, peso_kg: Number(p.peso_kg) }))),
    supabase.from('sessoes_treino').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('concluido', true)
      .gte('data_inicio', `${inicio}T00:00:00`).lte('data_inicio', `${fim}T23:59:59`).then(r => r.count ?? 0),
  ])
  const num = (v: unknown) => Number(v ?? 0)
  return {
    alimentos: alimentos.map(a => ({ ...a, calorias: num(a.calorias), proteina_g: num(a.proteina_g), carboidrato_g: num(a.carboidrato_g), gordura_g: num(a.gordura_g) })),
    agua, exercicios, pesos, treinosConcluidos: treinos,
  }
}
