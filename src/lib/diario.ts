// Regras do diário alimentar (sem dependências de runtime, testadas em tests/metas.test.ts).

export const REFEICOES = ['Café da manhã', 'Almoço', 'Jantar', 'Lanches'] as const
export type Refeicao = (typeof REFEICOES)[number]

export interface Alimento {
  nome: string
  quantidade: string
  calorias: number
  proteina_g: number
  carboidrato_g: number
  gordura_g: number
}

/** Registros antigos usavam 7 refeições; lanches, ceia e outros entram em "Lanches". */
export function grupoRefeicao(r: string | null | undefined): Refeicao {
  return r === 'Café da manhã' || r === 'Almoço' || r === 'Jantar' ? r : 'Lanches'
}

/** Refeição sugerida pelo horário. */
export function refeicaoDoHorario(h = new Date().getHours()): Refeicao {
  if (h >= 5 && h < 11) return 'Café da manhã'
  if (h >= 11 && h < 15) return 'Almoço'
  if (h >= 18 && h < 23) return 'Jantar'
  return 'Lanches'
}

const um = (n: number) => Math.round(n * 10) / 10

/** Multiplica a porção (ex.: 1,5 × 100 g). */
export function escalarAlimento<T extends Alimento>(a: T, porcoes: number): T {
  if (porcoes === 1) return a
  const fator = String(porcoes).replace('.', ',')
  return {
    ...a,
    quantidade: a.quantidade ? `${fator} × ${a.quantidade}` : `${fator} porções`,
    calorias: Math.round(a.calorias * porcoes),
    proteina_g: um(a.proteina_g * porcoes),
    carboidrato_g: um(a.carboidrato_g * porcoes),
    gordura_g: um(a.gordura_g * porcoes),
  }
}

export const chaveAlimento = (a: Pick<Alimento, 'nome' | 'quantidade'>) =>
  `${a.nome.trim().toLowerCase()}|${(a.quantidade ?? '').trim().toLowerCase()}`

/** Recentes sem repetição, na ordem recebida (mais novos primeiro). */
export function recentesUnicos<T extends Alimento>(itens: T[], limite = 30): T[] {
  const vistos = new Set<string>()
  const r: T[] = []
  for (const i of itens) {
    const k = chaveAlimento(i)
    if (vistos.has(k)) continue
    vistos.add(k); r.push(i)
    if (r.length >= limite) break
  }
  return r
}

// Datas sempre no fuso local do usuário (YYYY-MM-DD), sem conversão para UTC.
export function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
export function rotuloDia(iso: string): string {
  const hoje = hojeLocal()
  if (iso === hoje) return 'Hoje'
  if (iso === somarDias(hoje, -1)) return 'Ontem'
  if (iso === somarDias(hoje, 1)) return 'Amanhã'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}
