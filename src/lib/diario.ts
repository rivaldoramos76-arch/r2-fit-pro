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

// --- Quantidade editável ("4 ovos" → 2 ovos, "150 g" → 200 g) ---

const FRACOES: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
const UNIDADES_FIXAS = /^(g|kg|mg|ml|l|kcal|gramas?|litros?|mililitros?)$/i

/** Lê o número do início da quantidade: "4 ovos", "1,5 xícara", "1/2 copo", "½ maçã", "150g". */
export function lerQuantidade(q: string | null | undefined): { valor: number; unidade: string } | null {
  const s = (q ?? '').trim()
  const m = s.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔])\s*(.*)$/)
  if (!m) return null
  let valor: number
  if (FRACOES[m[1]]) valor = FRACOES[m[1]]
  else if (m[1].includes('/')) { const [a, b] = m[1].split('/').map(x => Number(x.trim())); valor = b ? a / b : NaN }
  else valor = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(valor) || valor <= 0) return null
  return { valor, unidade: m[2].trim() }
}

export const numeroBR = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/** Ajusta singular/plural da primeira palavra da unidade ("1 ovos" → "1 ovo", "2 colher" → "2 colheres"). */
function concordar(unidade: string, valor: number): string {
  const [primeira, ...resto] = unidade.split(' ')
  if (!primeira || !/^[a-zà-ú]+$/i.test(primeira) || UNIDADES_FIXAS.test(primeira)) return unidade
  let p = primeira
  const plural = /s$/i.test(p)
  if (valor <= 1 && plural && p.length > 3) p = /(r|z|l)es$/i.test(p) ? p.slice(0, -2) : p.slice(0, -1)
  else if (valor > 1 && !plural) p = /ão$/i.test(p) ? p.slice(0, -2) + 'ões' : /[rzl]$/i.test(p) ? p + 'es' : /[aeiouáéíóú]$/i.test(p) ? p + 's' : p
  return [p, ...resto].join(' ')
}

/** Recalcula o alimento para uma nova quantidade, proporcional à original. */
export function ajustarQuantidade<T extends Alimento>(a: T, novoValor: number): T {
  const q = lerQuantidade(a.quantidade)
  if (!q || !(novoValor > 0)) return a
  const f = novoValor / q.valor
  return {
    ...a,
    quantidade: q.unidade ? `${numeroBR(novoValor)} ${concordar(q.unidade, novoValor)}` : numeroBR(novoValor),
    calorias: Math.round(a.calorias * f),
    proteina_g: um(a.proteina_g * f),
    carboidrato_g: um(a.carboidrato_g * f),
    gordura_g: um(a.gordura_g * f),
  }
}

/** Peso de cada unidade, entre parênteses no fim da quantidade: "2 porções (350 g)" → { valor: 350, unidade: 'g' }. */
export function pesoDaQuantidade(q: string | null | undefined): { valor: number; unidade: 'g' | 'ml' } | null {
  const m = (q ?? '').match(/\((\d+(?:[.,]\d+)?)\s*(g|ml)\)\s*$/i)
  const valor = m ? Number(m[1].replace(',', '.')) : 0
  return m && valor > 0 ? { valor, unidade: m[2].toLowerCase() as 'g' | 'ml' } : null
}

/** Mesmo alimento em gramas (ou ml), a partir do peso da medida. */
export function alimentoEmPeso<T extends Alimento>(a: T, valor: number): T {
  const q = lerQuantidade(a.quantidade)
  const peso = pesoDaQuantidade(a.quantidade)
  if (!q || !peso || !(valor > 0)) return a
  const f = valor / (q.valor * peso.valor)
  return {
    ...a,
    quantidade: `${numeroBR(valor)} ${peso.unidade}`,
    calorias: Math.round(a.calorias * f), proteina_g: um(a.proteina_g * f),
    carboidrato_g: um(a.carboidrato_g * f), gordura_g: um(a.gordura_g * f),
  }
}

/** Passo dos botões − / + conforme a unidade (gramas sobem de 10 em 10). */
export function passoQuantidade(q: { valor: number; unidade: string }): number {
  if (/^(g|ml|gramas?|mililitros?)\b/i.test(q.unidade) || q.valor >= 20) return 10
  return q.valor < 1 || q.valor % 1 !== 0 ? 0.5 : 1
}
