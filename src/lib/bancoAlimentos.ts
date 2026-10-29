import { supabase } from './supabase'
import { semAcento } from './alimentosBase'
import type { ItemBase } from './alimentosBase'

// Banco compartilhado (Supabase): alimentos estimados pela IA, produtos do código de barras
// e tabelas nutricionais fotografadas. Complementa a TACO, que vem dentro do app.

interface Linha {
  id: string; nome: string; marca: string | null; codigo_barras: string | null; fonte: 'ia' | 'rotulo' | 'off'
  kcal: number; proteina: number; carboidrato: number; gordura: number; porcao_rotulo: string | null; porcao_g: number | null
}

const DETALHE: Record<Linha['fonte'], string> = { ia: 'Estimado pela IA', rotulo: 'Tabela nutricional', off: 'Produto industrializado' }

function paraItem(l: Linha): ItemBase {
  return {
    id: `base-${l.id}`, nome: l.nome, fonte: l.fonte, codigo: l.codigo_barras ?? undefined,
    detalhe: [l.marca, DETALHE[l.fonte]].filter(Boolean).join(' · '),
    kcal: Number(l.kcal), proteina: Number(l.proteina), carboidrato: Number(l.carboidrato), gordura: Number(l.gordura),
    porcaoG: l.porcao_g ? Number(l.porcao_g) : undefined, porcaoRotulo: l.porcao_rotulo ?? undefined,
  }
}

const CAMPOS = 'id, nome, marca, codigo_barras, fonte, kcal, proteina, carboidrato, gordura, porcao_rotulo, porcao_g'

/** Busca pelo termo mais longo no banco (o filtro fino por todas as palavras é feito no app). */
export async function buscarNoBanco(q: string): Promise<ItemBase[]> {
  const termos = semAcento(q).split(/\s+/).filter(t => t.length >= 2).sort((a, b) => b.length - a.length)
  if (!termos.length) return []
  const termo = termos[0].replace(/[%_]/g, '')
  const { data } = await supabase.from('alimentos_base').select(CAMPOS).ilike('nome_busca', `%${termo}%`).limit(60)
  return ((data as Linha[]) ?? []).map(paraItem)
}

export async function buscarCodigoNoBanco(codigo: string): Promise<ItemBase | null> {
  const { data } = await supabase.from('alimentos_base').select(CAMPOS).eq('codigo_barras', codigo).maybeSingle()
  return data ? paraItem(data as Linha) : null
}

/** Guarda no banco compartilhado (se já existir o mesmo nome/código, devolve o existente). */
export async function salvarNoBanco(item: Omit<ItemBase, 'id' | 'detalhe'> & { marca?: string }): Promise<ItemBase> {
  const { data, error } = await supabase.rpc('salvar_alimento_base', { p: {
    nome: item.nome, marca: item.marca ?? null, codigo_barras: item.codigo ?? null, fonte: item.fonte,
    kcal: item.kcal, proteina: item.proteina, carboidrato: item.carboidrato, gordura: item.gordura,
    porcao_rotulo: item.porcaoRotulo ?? null, porcao_g: item.porcaoG ?? null,
  } })
  if (error) throw new Error(error.message)
  return paraItem(data as Linha)
}
