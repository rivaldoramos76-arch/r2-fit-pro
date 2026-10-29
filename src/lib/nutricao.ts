import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Alimento } from './diario'
import { recentesUnicos } from './diario'
import type { Atividade, Objetivo, Sexo } from './metas'

export interface MetaSalva {
  user_id: string
  sexo: Sexo
  nascimento: string
  altura_cm: number
  peso_kg: number
  atividade: Atividade
  objetivo: Objetivo
  ritmo_kg_semana: number
  calorias: number
  proteina_g: number
  carboidrato_g: number
  gordura_g: number
  personalizada: boolean
  somar_exercicio: boolean
}

export interface RegistroAlimento extends Alimento {
  id: string
  data: string
  refeicao: string | null
  observacao: string | null
  origem: string | null
  created_at: string
}

export interface Favorito extends Alimento { id: string }

const num = (v: unknown) => Number(v ?? 0)
const normalizar = <T extends Alimento>(a: T): T => ({
  ...a, quantidade: a.quantidade ?? '', calorias: num(a.calorias), proteina_g: num(a.proteina_g), carboidrato_g: num(a.carboidrato_g), gordura_g: num(a.gordura_g),
})

/** Meta diária da pessoa (null enquanto não definiu). */
export function useMeta(userId: string | undefined) {
  const [meta, setMeta] = useState<MetaSalva | null>(null)
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('metas_nutricionais').select('*').eq('user_id', userId).maybeSingle()
    setMeta(data ? { ...(data as MetaSalva), altura_cm: num(data.altura_cm), peso_kg: num(data.peso_kg), ritmo_kg_semana: num(data.ritmo_kg_semana) } : null)
    setCarregando(false)
  }, [userId])
  useEffect(() => { recarregar() }, [recarregar])
  return { meta, carregando, recarregar }
}

export async function salvarMeta(m: MetaSalva) {
  const { error } = await supabase.from('metas_nutricionais').upsert(m, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export async function registrosDoDia(userId: string, data: string): Promise<RegistroAlimento[]> {
  const { data: rows } = await supabase.from('food_logs').select('*').eq('user_id', userId).eq('data', data).order('created_at', { ascending: true })
  return ((rows as RegistroAlimento[]) ?? []).map(normalizar)
}

export async function alimentosRecentes(userId: string): Promise<Alimento[]> {
  const { data: rows } = await supabase.from('food_logs')
    .select('nome, quantidade, calorias, proteina_g, carboidrato_g, gordura_g, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(200)
  return recentesUnicos(((rows as (Alimento & { created_at: string })[]) ?? []).map(normalizar))
}

export async function listarFavoritos(userId: string): Promise<Favorito[]> {
  const { data: rows } = await supabase.from('alimentos_favoritos').select('*').eq('user_id', userId).order('nome')
  return ((rows as Favorito[]) ?? []).map(normalizar)
}

export async function favoritar(userId: string, a: Alimento): Promise<Favorito> {
  const { data, error } = await supabase.from('alimentos_favoritos')
    .upsert({ user_id: userId, nome: a.nome.trim(), quantidade: (a.quantidade ?? '').trim(), calorias: Math.round(a.calorias), proteina_g: a.proteina_g, carboidrato_g: a.carboidrato_g, gordura_g: a.gordura_g }, { onConflict: 'user_id,nome,quantidade' })
    .select().single()
  if (error) throw new Error(error.message)
  return normalizar(data as Favorito)
}

export async function desfavoritar(id: string) {
  const { error } = await supabase.from('alimentos_favoritos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function registrarAlimentos(userId: string, data: string, refeicao: string, itens: (Alimento & { observacao?: string | null })[], origem: string) {
  const rows = itens.map(a => ({
    user_id: userId, data, refeicao, nome: a.nome, quantidade: a.quantidade, calorias: Math.round(a.calorias),
    proteina_g: a.proteina_g, carboidrato_g: a.carboidrato_g, gordura_g: a.gordura_g, observacao: a.observacao ?? null, origem,
  }))
  const { error } = await supabase.from('food_logs').insert(rows)
  if (error) throw new Error(error.message)
}

export function somarTotais(itens: Alimento[]) {
  return itens.reduce((t, i) => ({
    calorias: t.calorias + i.calorias, proteina_g: t.proteina_g + i.proteina_g,
    carboidrato_g: t.carboidrato_g + i.carboidrato_g, gordura_g: t.gordura_g + i.gordura_g,
  }), { calorias: 0, proteina_g: 0, carboidrato_g: 0, gordura_g: 0 })
}

export async function atualizarRegistro(id: string, a: Alimento & { refeicao: string }) {
  const { error } = await supabase.from('food_logs').update({
    nome: a.nome, quantidade: a.quantidade, calorias: Math.round(a.calorias), proteina_g: a.proteina_g,
    carboidrato_g: a.carboidrato_g, gordura_g: a.gordura_g, refeicao: a.refeicao,
  }).eq('id', id)
  if (error) throw new Error(error.message)
}
