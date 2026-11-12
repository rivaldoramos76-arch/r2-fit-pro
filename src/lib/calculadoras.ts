// Calculadoras de treino (testadas em tests/logica.test.ts).

/** Carga máxima estimada para 1 repetição (média das fórmulas de Epley e Brzycki), arredondada em 0,5 kg. */
export function umRM(kg: number, reps: number): number | null {
  if (!(kg > 0) || !(reps >= 1) || reps > 20) return null
  if (reps === 1) return kg
  const epley = kg * (1 + reps / 30)
  const brzycki = kg * 36 / (37 - reps)
  return Math.round(((epley + brzycki) / 2) * 2) / 2
}

/** Faixas de treino a partir do 1RM: % da carga máxima e repetições aproximadas. */
export const FAIXAS: [number, string][] = [[95, '2'], [90, '3-4'], [85, '5-6'], [80, '7-8'], [75, '9-10'], [70, '11-12'], [65, '13-15'], [60, '16-20']]
export const cargaDaFaixa = (rm: number, pct: number) => Math.round(rm * pct / 100 * 2) / 2

export const ANILHAS_PADRAO = [25, 20, 15, 10, 5, 2.5, 1.25]

/**
 * Anilhas de cada lado da barra para chegar no peso total (a barra conta no total).
 * Usa as maiores primeiro. `sobra` > 0 quando não dá para fechar exato com as anilhas disponíveis.
 */
export function anilhasPorLado(total: number, barra: number, disponiveis = ANILHAS_PADRAO): { anilhas: number[]; sobra: number; real: number } | null {
  if (!(total > 0) || !(barra >= 0) || total < barra) return null
  let lado = Math.round(((total - barra) / 2) * 100) / 100
  const anilhas: number[] = []
  for (const a of [...disponiveis].sort((x, y) => y - x)) {
    while (lado + 1e-9 >= a) { anilhas.push(a); lado = Math.round((lado - a) * 100) / 100 }
  }
  const real = Math.round((barra + 2 * anilhas.reduce((s, a) => s + a, 0)) * 100) / 100
  return { anilhas, sobra: Math.round((total - real) * 100) / 100, real }
}
