import { supabase } from './supabase'
import { chatCompletion } from './aiClient'
import type { PontoPeso } from './exercicios'

// Água, peso e exercício do diário (tabelas registros_agua, registros_peso, exercicios_registro).

export interface RegistroAgua { id: string; data: string; ml: number; created_at: string }
export interface Exercicio { id: string; data: string; nome: string; duracao_min: number; calorias: number; origem: 'lista' | 'ia' | 'treino' }

const erroOu = <T>({ data, error }: { data: T | null; error: { message: string } | null }) => {
  if (error) throw new Error(error.message)
  return data as T
}

export async function aguaDoDia(userId: string, data: string): Promise<RegistroAgua[]> {
  return erroOu(await supabase.from('registros_agua').select('id, data, ml, created_at').eq('user_id', userId).eq('data', data).order('created_at')) ?? []
}
export async function adicionarAgua(userId: string, data: string, ml: number): Promise<RegistroAgua> {
  return erroOu(await supabase.from('registros_agua').insert({ user_id: userId, data, ml: Math.round(ml) }).select('id, data, ml, created_at').single())
}
export async function removerAgua(id: string) {
  erroOu(await supabase.from('registros_agua').delete().eq('id', id))
}

export async function historicoPeso(userId: string, desde?: string): Promise<(PontoPeso & { id: string })[]> {
  let q = supabase.from('registros_peso').select('id, data, peso_kg').eq('user_id', userId).order('data')
  if (desde) q = q.gte('data', desde)
  const linhas = erroOu(await q) ?? []
  return (linhas as { id: string; data: string; peso_kg: number }[]).map(l => ({ ...l, peso_kg: Number(l.peso_kg) }))
}
/** Um registro por dia: registrar de novo no mesmo dia substitui. */
export async function registrarPeso(userId: string, data: string, pesoKg: number) {
  erroOu(await supabase.from('registros_peso').upsert({ user_id: userId, data, peso_kg: Math.round(pesoKg * 10) / 10 }, { onConflict: 'user_id,data' }))
}
export async function removerPeso(id: string) {
  erroOu(await supabase.from('registros_peso').delete().eq('id', id))
}
export async function ultimoPeso(userId: string): Promise<number | null> {
  const { data } = await supabase.from('registros_peso').select('peso_kg').eq('user_id', userId).order('data', { ascending: false }).limit(1).maybeSingle()
  return data ? Number(data.peso_kg) : null
}

export async function exerciciosDoDia(userId: string, data: string): Promise<Exercicio[]> {
  return erroOu(await supabase.from('exercicios_registro').select('id, data, nome, duracao_min, calorias, origem').eq('user_id', userId).eq('data', data).order('created_at')) ?? []
}
export async function adicionarExercicio(userId: string, e: Omit<Exercicio, 'id'>) {
  erroOu(await supabase.from('exercicios_registro').insert({ user_id: userId, ...e, calorias: Math.round(e.calorias), duracao_min: Math.round(e.duracao_min) }))
}
export async function removerExercicio(id: string) {
  erroOu(await supabase.from('exercicios_registro').delete().eq('id', id))
}

/** Metas de água e de peso (ficam junto da meta diária). */
export async function salvarMetasExtras(userId: string, campos: { meta_agua_ml?: number | null; meta_peso_kg?: number | null }) {
  erroOu(await supabase.from('metas_nutricionais').update(campos).eq('user_id', userId))
}

/** Exercício descrito em texto ("corri 5 km em 30 min"): a IA estima tempo e calorias pelo peso da pessoa. */
export async function estimarExercicio(descricao: string, pesoKg: number): Promise<{ nome: string; duracao_min: number; calorias: number }> {
  const resp = await chatCompletion({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: `Você é um educador físico. Estime o gasto calórico do exercício descrito para uma pessoa de ${Math.round(pesoKg)} kg, usando valores MET do Compendium of Physical Activities (kcal = MET × peso × horas).
Responda só JSON: {"nome": string curto em português (ex.: "Corrida 5 km"), "duracao_min": number, "calorias": number}. Se a duração não for informada, assuma uma duração típica. Se não for exercício, responda {"erro": "não é exercício"}.` },
      { role: 'user', content: descricao },
    ],
  })
  const d = JSON.parse(resp.choices[0]?.message?.content ?? '{}')
  if (d.erro || !d.nome) throw new Error('Não entendemos esse exercício. Tente descrever de outro jeito (ex.: "pedalei 40 minutos").')
  return {
    nome: String(d.nome).slice(0, 120),
    duracao_min: Math.min(600, Math.max(1, Math.round(Number(d.duracao_min) || 30))),
    calorias: Math.min(4000, Math.max(0, Math.round(Number(d.calorias) || 0))),
  }
}
