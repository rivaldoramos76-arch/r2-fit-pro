import { CATALOGO, EQUIPAMENTOS, GRUPOS } from '../data/exercicios'
import type { Equipamento, ExercicioCatalogo } from '../data/exercicios'

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9°]+/g, ' ').trim()
}

interface Indexado {
  ex: ExercicioCatalogo
  ordem: number // posição no catálogo (variações mais comuns vêm primeiro)
  nome: string
  nomePalavras: string[]
  sinonimos: string[]
  extras: string[] // grupo, secundários, equipamento
}

function indexar(lista: ExercicioCatalogo[]): Indexado[] {
  return lista.map((ex, ordem) => {
    const nome = normalizar(ex.nome)
    return {
      ex,
      ordem,
      nome,
      nomePalavras: nome.split(' '),
      sinonimos: ex.sinonimos.map(normalizar),
      extras: [
        normalizar(GRUPOS[ex.grupo]),
        ...ex.secundarios.map(g => normalizar(GRUPOS[g])),
        normalizar(EQUIPAMENTOS[ex.equipamento]),
        normalizar(ex.equipamento.replace('_', ' ')),
      ],
    }
  })
}

let INDICE: Indexado[] | null = null
function indice(): Indexado[] {
  if (!INDICE) INDICE = indexar(CATALOGO)
  return INDICE
}

function palavrasDe(textos: string[]): string[] {
  return textos.flatMap(t => t.split(' '))
}

/** Pontua um exercício para a consulta; 0 = não corresponde. */
function pontuar(item: Indexado, consulta: string, tokens: string[]): number {
  const sinPalavras = palavrasDe(item.sinonimos)
  const extraPalavras = palavrasDe(item.extras)
  let total = 0
  for (const tk of tokens) {
    let melhor = 0
    if (item.nomePalavras.some(p => p.startsWith(tk))) melhor = 10
    else if (sinPalavras.some(p => p.startsWith(tk))) melhor = 6
    else if (extraPalavras.some(p => p.startsWith(tk))) melhor = 4
    else if (tk.length >= 3 && (item.nome.includes(tk) || item.sinonimos.some(s => s.includes(tk)))) melhor = 2
    if (!melhor) return 0
    total += melhor
  }
  if (item.nome.startsWith(consulta)) total += 30
  else if (item.sinonimos.some(s => s.startsWith(consulta))) total += 15
  if (item.nome === consulta || item.sinonimos.includes(consulta)) total += 40
  // prioriza exercícios mais comuns/simples quando empata
  total -= item.ex.nivel === 'avancado' ? 1 : 0
  return total
}

export interface FiltroBusca {
  equipamentos?: Equipamento[]
  limite?: number
}

export function buscarExercicios(texto: string, filtro: FiltroBusca = {}): ExercicioCatalogo[] {
  const consulta = normalizar(texto)
  const limite = filtro.limite ?? 40
  let base = indice()
  if (filtro.equipamentos?.length) {
    const eq = new Set(filtro.equipamentos)
    base = base.filter(i => eq.has(i.ex.equipamento))
  }
  if (!consulta) return base.slice(0, limite).map(i => i.ex)
  const tokens = consulta.split(' ').filter(Boolean)
  return base
    .map(i => ({ i, p: pontuar(i, consulta, tokens) }))
    .filter(r => r.p > 0)
    .sort((a, b) => b.p - a.p || a.i.ordem - b.i.ordem)
    .slice(0, limite)
    .map(r => r.i.ex)
}

/** Localiza no catálogo um exercício pelo nome (usado para vincular sugestões da IA). */
export function encontrarPorNome(nome: string): ExercicioCatalogo | undefined {
  const n = normalizar(nome)
  const idx = indice()
  return idx.find(i => i.nome === n)?.ex ?? idx.find(i => i.sinonimos.includes(n))?.ex
}
