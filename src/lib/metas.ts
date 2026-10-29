// Cálculo da meta diária de calorias e macronutrientes (sem dependências de runtime).
// Gasto basal pela fórmula de Mifflin-St Jeor, multiplicado pelo nível de atividade;
// o objetivo ajusta as calorias pelo ritmo semanal (1 kg de gordura ≈ 7.700 kcal).

export type Sexo = 'masculino' | 'feminino'
export type Atividade = 'sedentario' | 'leve' | 'moderado' | 'intenso' | 'muito_intenso'
export type Objetivo = 'perder' | 'manter' | 'ganhar'

export interface DadosMeta {
  sexo: Sexo
  idade: number
  altura_cm: number
  peso_kg: number
  atividade: Atividade
  objetivo: Objetivo
  /** kg por semana (ignorado quando o objetivo é manter) */
  ritmo_kg_semana: number
}

export interface Meta {
  calorias: number
  proteina_g: number
  carboidrato_g: number
  gordura_g: number
}

export const ATIVIDADES: { valor: Atividade; rotulo: string; descricao: string; fator: number }[] = [
  { valor: 'sedentario', rotulo: 'Sedentário', descricao: 'Trabalho sentado e pouco ou nenhum exercício', fator: 1.2 },
  { valor: 'leve', rotulo: 'Levemente ativo', descricao: 'Exercício leve 1 a 3 vezes por semana', fator: 1.375 },
  { valor: 'moderado', rotulo: 'Moderadamente ativo', descricao: 'Exercício 3 a 5 vezes por semana', fator: 1.55 },
  { valor: 'intenso', rotulo: 'Muito ativo', descricao: 'Exercício intenso 6 a 7 vezes por semana', fator: 1.725 },
  { valor: 'muito_intenso', rotulo: 'Extremamente ativo', descricao: 'Treino pesado diário ou trabalho físico', fator: 1.9 },
]

export const OBJETIVOS: { valor: Objetivo; rotulo: string; descricao: string }[] = [
  { valor: 'perder', rotulo: 'Perder peso', descricao: 'Reduzir gordura com um déficit calórico' },
  { valor: 'manter', rotulo: 'Manter o peso', descricao: 'Comer na medida do seu gasto diário' },
  { valor: 'ganhar', rotulo: 'Ganhar massa', descricao: 'Superávit leve para construir músculo' },
]

export const RITMOS: Record<Exclude<Objetivo, 'manter'>, number[]> = {
  perder: [0.25, 0.5, 0.75, 1],
  ganhar: [0.25, 0.5],
}

const KCAL_POR_KG_SEMANA = 7700 / 7
/** Piso de segurança: abaixo disso a meta não é recomendada sem acompanhamento profissional. */
export const CALORIAS_MINIMAS: Record<Sexo, number> = { feminino: 1200, masculino: 1500 }

/** Taxa metabólica basal (Mifflin-St Jeor). */
export function taxaBasal(d: Pick<DadosMeta, 'sexo' | 'idade' | 'altura_cm' | 'peso_kg'>): number {
  return 10 * d.peso_kg + 6.25 * d.altura_cm - 5 * d.idade + (d.sexo === 'masculino' ? 5 : -161)
}

/** Gasto diário estimado (basal × atividade). */
export function gastoDiario(d: Pick<DadosMeta, 'sexo' | 'idade' | 'altura_cm' | 'peso_kg' | 'atividade'>): number {
  const fator = ATIVIDADES.find(a => a.valor === d.atividade)?.fator ?? 1.2
  return taxaBasal(d) * fator
}

/** Arredonda para múltiplos de 10 kcal, como nos apps de dieta. */
const arred10 = (n: number) => Math.round(n / 10) * 10

/** Distribui os macros a partir das calorias: proteína por kg, gordura em 25% (mínimo 0,6 g/kg), carboidrato no restante. */
export function distribuirMacros(calorias: number, peso_kg: number, objetivo: Objetivo): Omit<Meta, 'calorias'> {
  const proteinaPorKg = objetivo === 'perder' ? 2 : objetivo === 'ganhar' ? 1.8 : 1.6
  let proteina = Math.round(peso_kg * proteinaPorKg)
  let gordura = Math.round(Math.max((calorias * 0.25) / 9, peso_kg * 0.6))
  // Em metas muito baixas, proteína e gordura não podem passar do total
  const maxPG = calorias * 0.85
  if (proteina * 4 + gordura * 9 > maxPG) {
    const escala = maxPG / (proteina * 4 + gordura * 9)
    proteina = Math.round(proteina * escala)
    gordura = Math.round(gordura * escala)
  }
  const carboidrato = Math.max(0, Math.round((calorias - proteina * 4 - gordura * 9) / 4))
  return { proteina_g: proteina, carboidrato_g: carboidrato, gordura_g: gordura }
}

export function calcularMeta(d: DadosMeta): Meta & { gasto: number; abaixoDoMinimo: boolean } {
  const gasto = gastoDiario(d)
  const ritmo = d.objetivo === 'manter' ? 0 : Math.min(Math.max(d.ritmo_kg_semana, 0), 1)
  const ajuste = ritmo * KCAL_POR_KG_SEMANA * (d.objetivo === 'perder' ? -1 : d.objetivo === 'ganhar' ? 1 : 0)
  const bruto = gasto + ajuste
  const minimo = CALORIAS_MINIMAS[d.sexo]
  const calorias = arred10(Math.max(bruto, minimo))
  return { calorias, ...distribuirMacros(calorias, d.peso_kg, d.objetivo), gasto: arred10(gasto), abaixoDoMinimo: bruto < minimo }
}

/** Idade completa em anos a partir da data de nascimento (YYYY-MM-DD). */
export function idadeEm(nascimento: string, hoje = new Date()): number {
  const [a, m, d] = nascimento.split('-').map(Number)
  let idade = hoje.getFullYear() - a
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) idade--
  return idade
}

/** Calorias dos macros (4/4/9 kcal por grama). */
export const caloriasDosMacros = (m: Omit<Meta, 'calorias'>) => m.proteina_g * 4 + m.carboidrato_g * 4 + m.gordura_g * 9
