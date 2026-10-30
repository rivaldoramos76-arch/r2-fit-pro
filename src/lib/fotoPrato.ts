// Foto do prato: os itens que a IA viu viram alimentos calculados pela TACO, com gramas ajustáveis
// e as quantidades de costume da pessoa. Sem dependências de runtime; testado em tests/metas.test.ts.
import { buscarBase, semAcento, tipoMedida, type ItemBase } from './alimentosBase'
import type { FoodEstimate } from './foodAI'

export interface ItemPrato extends FoodEstimate {
  /** De onde vêm os valores: tabela TACO ou estimativa da IA */
  fonte: 'taco' | 'ia'
  /** Quantidade veio do histórico da pessoa ("seu de sempre") */
  habitual?: boolean
}

const um = (n: number) => Math.round(n * 10) / 10
const chave = (nome: string) => semAcento(nome).trim()
const pesoEm = (q: string | null | undefined) => {
  const m = (q ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|ml)$/i)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** Quantidade de costume (mediana dos últimos registros em g/ml) por nome de alimento. */
export function gramasHabituais(registros: { nome: string; quantidade: string | null }[], maxPorItem = 5): Map<string, number> {
  const grupos = new Map<string, number[]>()
  for (const r of registros) { // mais recentes primeiro
    const g = pesoEm(r.quantidade)
    if (!g || g <= 0 || g > 2000) continue
    const k = chave(r.nome)
    const lista = grupos.get(k) ?? []
    if (lista.length < maxPorItem) lista.push(g)
    grupos.set(k, lista)
  }
  const res = new Map<string, number>()
  for (const [k, l] of grupos) {
    const o = [...l].sort((a, b) => a - b)
    const meio = Math.floor(o.length / 2)
    res.set(k, o.length % 2 ? o[meio] : Math.round((o[meio - 1] + o[meio]) / 2))
  }
  return res
}

/** Monta o prato: TACO quando o item é encontrado e o valor é plausível; senão, a estimativa da IA (em gramas quando houver). */
export function montarPrato(itens: FoodEstimate[], taco: ItemBase[], habituais: Map<string, number>): ItemPrato[] {
  return itens.map(i => {
    const g0 = i.gramas && i.gramas > 0 ? i.gramas : null
    const cand = g0 ? (buscarBase(taco, i.busca || i.nome, 1)[0] ?? buscarBase(taco, i.nome, 1)[0]) : undefined
    if (cand && g0) {
      const hab = habituais.get(chave(cand.nome))
      const g = Math.round(hab ?? g0)
      const kcal = Math.round(cand.kcal * g / 100)
      const kcalIA = i.calorias * g / g0
      // Valor muito diferente da IA indica item trocado na busca: fica com a IA
      if (!(kcalIA > 0 && (kcal > kcalIA * 2.5 || kcal < kcalIA / 2.5))) {
        const f = g / 100
        return {
          nome: cand.nome, quantidade: `${g} ${tipoMedida(cand) === 'liquido' ? 'ml' : 'g'}`,
          calorias: kcal, proteina_g: um(cand.proteina * f), carboidrato_g: um(cand.carboidrato * f), gordura_g: um(cand.gordura * f),
          observacao: i.observacao, fonte: 'taco', habitual: hab !== undefined,
        }
      }
    }
    if (g0) {
      const hab = habituais.get(chave(i.nome))
      const g = Math.round(hab ?? g0)
      const f = g / g0
      return {
        nome: i.nome, quantidade: `${g} g`, calorias: Math.round(i.calorias * f), proteina_g: um(i.proteina_g * f),
        carboidrato_g: um(i.carboidrato_g * f), gordura_g: um(i.gordura_g * f), observacao: i.observacao, fonte: 'ia', habitual: hab !== undefined,
      }
    }
    const { gramas: _g, busca: _b, ...resto } = i
    return { ...resto, fonte: 'ia' }
  })
}
