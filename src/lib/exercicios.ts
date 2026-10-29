// Exercícios com gasto energético pelo MET (Compendium of Physical Activities):
// kcal = MET × peso (kg) × horas. Sem dependências de runtime.

export interface Atividade { id: string; nome: string; met: number; icone: string }

export const ATIVIDADES: Atividade[] = [
  { id: 'caminhada-leve', nome: 'Caminhada leve', met: 3.0, icone: '🚶' },
  { id: 'caminhada-rapida', nome: 'Caminhada rápida', met: 5.0, icone: '🚶' },
  { id: 'corrida-leve', nome: 'Corrida leve (8 km/h)', met: 8.3, icone: '🏃' },
  { id: 'corrida-moderada', nome: 'Corrida moderada (10 km/h)', met: 9.8, icone: '🏃' },
  { id: 'corrida-rapida', nome: 'Corrida rápida (12 km/h)', met: 11.8, icone: '🏃' },
  { id: 'musculacao', nome: 'Musculação', met: 3.5, icone: '🏋️' },
  { id: 'musculacao-intensa', nome: 'Musculação intensa', met: 6.0, icone: '🏋️' },
  { id: 'funcional', nome: 'Treino funcional / HIIT', met: 8.0, icone: '🔥' },
  { id: 'crossfit', nome: 'Crossfit', met: 8.0, icone: '🔥' },
  { id: 'bike-leve', nome: 'Bicicleta (passeio)', met: 4.0, icone: '🚴' },
  { id: 'bike-moderada', nome: 'Bicicleta moderada', met: 6.8, icone: '🚴' },
  { id: 'spinning', nome: 'Spinning / bike ergométrica', met: 7.0, icone: '🚴' },
  { id: 'eliptico', nome: 'Elíptico', met: 5.0, icone: '⚙️' },
  { id: 'escada', nome: 'Escada / simulador', met: 9.0, icone: '🪜' },
  { id: 'remo', nome: 'Remo ergômetro', met: 7.0, icone: '🚣' },
  { id: 'natacao', nome: 'Natação', met: 7.0, icone: '🏊' },
  { id: 'hidroginastica', nome: 'Hidroginástica', met: 5.5, icone: '🏊' },
  { id: 'pular-corda', nome: 'Pular corda', met: 10.0, icone: '🪢' },
  { id: 'futebol', nome: 'Futebol', met: 7.0, icone: '⚽' },
  { id: 'volei', nome: 'Vôlei / futevôlei', met: 4.0, icone: '🏐' },
  { id: 'beach-tennis', nome: 'Beach tennis / tênis', met: 7.0, icone: '🎾' },
  { id: 'basquete', nome: 'Basquete', met: 6.5, icone: '🏀' },
  { id: 'lutas', nome: 'Lutas (jiu-jitsu, muay thai, boxe)', met: 10.0, icone: '🥊' },
  { id: 'danca', nome: 'Dança / zumba', met: 6.0, icone: '💃' },
  { id: 'trilha', nome: 'Trilha', met: 6.0, icone: '🥾' },
  { id: 'pilates', nome: 'Pilates', met: 3.0, icone: '🧘' },
  { id: 'yoga', nome: 'Yoga', met: 2.5, icone: '🧘' },
  { id: 'alongamento', nome: 'Alongamento', met: 2.3, icone: '🤸' },
]

export const PESO_PADRAO = 70

export function caloriasExercicio(met: number, pesoKg: number | null | undefined, minutos: number): number {
  const peso = pesoKg && pesoKg >= 30 ? pesoKg : PESO_PADRAO
  return Math.max(0, Math.round(met * peso * (Math.max(0, minutos) / 60)))
}

/** Meta de água sugerida: 35 ml por kg, arredondada a 50 ml (entre 1,5 e 4 litros). */
export function metaAguaSugerida(pesoKg: number | null | undefined): number {
  if (!pesoKg) return 2000
  return Math.min(4000, Math.max(1500, Math.round((pesoKg * 35) / 50) * 50))
}

export interface PontoPeso { data: string; peso_kg: number }

/** Resumo do peso no período: atual, variação desde o primeiro registro e na última semana, mínimo e máximo. */
export function resumoPeso(pontos: PontoPeso[], meta?: number | null) {
  const p = [...pontos].sort((a, b) => a.data.localeCompare(b.data))
  if (!p.length) return null
  const atual = p[p.length - 1]
  const primeiro = p[0]
  const semanaAtras = (() => {
    const [y, m, d] = atual.data.split('-').map(Number)
    const limite = new Date(y, m - 1, d - 7)
    const iso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`
    return [...p].reverse().find(x => x.data <= iso) ?? null
  })()
  const um = (n: number) => Math.round(n * 10) / 10
  return {
    atual: atual.peso_kg,
    dataAtual: atual.data,
    variacao: um(atual.peso_kg - primeiro.peso_kg),
    variacaoSemana: semanaAtras ? um(atual.peso_kg - semanaAtras.peso_kg) : null,
    minimo: Math.min(...p.map(x => x.peso_kg)),
    maximo: Math.max(...p.map(x => x.peso_kg)),
    faltaMeta: meta ? um(atual.peso_kg - meta) : null,
  }
}

/** Restante do dia: meta − alimentos (+ exercício, só se a pessoa ligou "somar exercício à meta"). */
export function restanteDia(meta: number, alimentos: number, exercicio: number, somarExercicio: boolean): number {
  return Math.round(meta - alimentos + (somarExercicio ? exercicio : 0))
}
