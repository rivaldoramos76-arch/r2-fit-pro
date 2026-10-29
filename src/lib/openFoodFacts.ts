import type { ItemBase } from './alimentosBase'

// Open Food Facts: base aberta de produtos industrializados (código de barras).
// Chamado direto do navegador do cliente (a API permite CORS).

interface Produto {
  code?: string; product_name?: string; product_name_pt?: string; brands?: string
  serving_quantity?: number | string; serving_size?: string
  nutriments?: Record<string, number | string | undefined>
}

const CAMPOS = 'code,product_name,product_name_pt,brands,serving_quantity,serving_size,nutriments'
const n = (v: unknown) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export function produtoParaItem(p: Produto): ItemBase | null {
  const nu = p.nutriments ?? {}
  const kcal = n(nu['energy-kcal_100g']) ?? (n(nu['energy_100g']) !== null ? n(nu['energy_100g'])! / 4.184 : null)
  const nome = (p.product_name_pt || p.product_name || '').trim()
  if (!nome || kcal === null) return null
  const porcao = n(p.serving_quantity)
  return {
    id: `off-${p.code ?? nome}`, nome, fonte: 'off', codigo: p.code,
    detalhe: [p.brands?.split(',')[0]?.trim(), 'Open Food Facts'].filter(Boolean).join(' · '),
    kcal: Math.round(kcal), proteina: n(nu.proteins_100g) ?? 0, carboidrato: n(nu.carbohydrates_100g) ?? 0, gordura: n(nu.fat_100g) ?? 0,
    porcaoG: porcao && porcao > 0 && porcao <= 2000 ? porcao : undefined,
    porcaoRotulo: porcao ? `porção do rótulo` : undefined,
  }
}

export async function produtoPorCodigo(codigo: string): Promise<ItemBase | null> {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json?fields=${CAMPOS}`)
  if (!r.ok) return null
  const d = await r.json() as { status?: number; product?: Produto }
  return d.status === 1 && d.product ? produtoParaItem({ ...d.product, code: d.product.code ?? codigo }) : null
}

/** Busca por nome (produtos vendidos no Brasil). A API limita buscas: chamar só com a pessoa parada de digitar. */
export async function buscarProdutos(q: string, sinal?: AbortSignal): Promise<ItemBase[]> {
  const url = `https://br.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${CAMPOS}`
  const r = await fetch(url, { signal: sinal })
  if (!r.ok) return []
  const d = await r.json() as { products?: Produto[] }
  return (d.products ?? []).map(produtoParaItem).filter((x): x is ItemBase => !!x)
}
