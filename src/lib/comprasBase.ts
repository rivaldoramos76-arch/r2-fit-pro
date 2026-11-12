// Lista de compras a partir do plano alimentar (testada em tests/logica.test.ts): soma as quantidades de cada
// alimento das refeições do dia e multiplica pelos dias escolhidos.
import { normalizar } from './busca'

export interface ItemCompra { chave: string; nome: string; total: string }
type Acumulado = { nome: string; g: number; ml: number; unidades: Map<string, { n: number; rotulo: string }>; vezes: number }

const NUMEROS: Record<string, number> = { meio: 0.5, meia: 0.5, '½': 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5 }
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const singular = (s: string) => s.split(' ').map((p, i) => (i === 0 ? p.replace(/(ões)$/, 'ão').replace(/(ães)$/, 'ão').replace(/s$/, '') : p)).join(' ')

export function listaDeCompras(refeicoes: { alimentos?: { nome: string; quantidade?: string }[] }[], dias: number): ItemCompra[] {
  const mapa = new Map<string, Acumulado>()
  for (const r of refeicoes) for (const a of r.alimentos ?? []) {
    const chave = normalizar(a.nome)
    if (!chave) continue
    const acc = mapa.get(chave) ?? { nome: a.nome.trim(), g: 0, ml: 0, unidades: new Map(), vezes: 0 }
    const q = (a.quantidade ?? '').trim().toLowerCase().replace(',', '.')
    const medida = q.match(/^(\d+(?:\.\d+)?)\s*(kg|g|gramas?|ml|l|litros?)\b/)
    const conta = q.match(/^(\d+(?:\.\d+)?|½|meia|meio|uma?|duas?|dois|tr[eê]s|quatro|cinco)\s+(?:de\s+)?(.+)$/)
    if (medida) {
      const v = parseFloat(medida[1]), u = medida[2]
      if (u === 'kg') acc.g += v * 1000; else if (u.startsWith('g')) acc.g += v
      else if (u === 'ml') acc.ml += v; else acc.ml += v * 1000
    } else if (conta) {
      const n = NUMEROS[conta[1]] ?? parseFloat(conta[1])
      const rotulo = conta[2].replace(/\s*\(.*\)$/, '').trim()
      const k = normalizar(singular(rotulo))
      const u = acc.unidades.get(k) ?? { n: 0, rotulo: singular(rotulo) }
      u.n += n
      acc.unidades.set(k, u)
    } else acc.vezes += 1
    mapa.set(chave, acc)
  }
  return [...mapa.entries()].map(([chave, a]) => {
    const partes: string[] = []
    if (a.g) partes.push(a.g * dias >= 1000 ? `${fmt((a.g * dias) / 1000)} kg` : `${fmt(a.g * dias)} g`)
    if (a.ml) partes.push(a.ml * dias >= 1000 ? `${fmt((a.ml * dias) / 1000)} L` : `${fmt(a.ml * dias)} ml`)
    for (const u of a.unidades.values()) { const n = u.n * dias; partes.push(`${fmt(n)} ${n > 1 ? plural(u.rotulo) : u.rotulo}`) }
    if (a.vezes) partes.push(`${a.vezes * dias}x`)
    return { chave, nome: a.nome, total: partes.join(' + ') }
  }).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
}

function plural(s: string): string {
  const [p, ...resto] = s.split(' ')
  const pl = /ão$/.test(p) ? p.replace(/ão$/, 'ões') : /[aeiou]$/.test(p) ? `${p}s` : /[rz]$/.test(p) ? `${p}es` : /l$/.test(p) ? p.replace(/l$/, 'is') : p
  return [pl, ...resto].join(' ')
}

export const textoDaLista = (titulo: string, itens: ItemCompra[], marcados: Set<string>) =>
  [`🛒 ${titulo}`, ...itens.filter(i => !marcados.has(i.chave)).map(i => `• ${i.nome}: ${i.total}`)].join('\n')
