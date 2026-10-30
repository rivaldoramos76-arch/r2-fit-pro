// Receitas (por porção) e relatório semanal. Sem dependências de runtime; testado em tests/metas.test.ts.
import type { Alimento } from './diario'
import type { ItemBase } from './alimentosBase'
import { somarDias } from './diario'

const um = (n: number) => Math.round(n * 10) / 10

// --- Receitas ---

export function totaisIngredientes(ingredientes: Alimento[]) {
  return ingredientes.reduce((t, i) => ({
    calorias: t.calorias + (Number(i.calorias) || 0), proteina_g: t.proteina_g + (Number(i.proteina_g) || 0),
    carboidrato_g: t.carboidrato_g + (Number(i.carboidrato_g) || 0), gordura_g: t.gordura_g + (Number(i.gordura_g) || 0),
  }), { calorias: 0, proteina_g: 0, carboidrato_g: 0, gordura_g: 0 })
}

/** Uma porção da receita como alimento do diário ("1 porção", com o peso se a receita tiver peso final). */
export function porcaoReceita(nome: string, ingredientes: Alimento[], porcoes: number, pesoFinalG?: number | null): Alimento {
  const t = totaisIngredientes(ingredientes)
  const p = porcoes > 0 ? porcoes : 1
  const gramas = pesoFinalG && pesoFinalG > 0 ? Math.round(pesoFinalG / p) : null
  return {
    nome, quantidade: gramas ? `1 porção (${gramas} g)` : '1 porção',
    calorias: Math.round(t.calorias / p), proteina_g: um(t.proteina_g / p),
    carboidrato_g: um(t.carboidrato_g / p), gordura_g: um(t.gordura_g / p),
  }
}

/** Receita com peso final vira um item "por 100 g", para registrar em gramas no diário. */
export function receitaComoItem(r: { id: string; nome: string; ingredientes: Alimento[]; porcoes: number; peso_final_g: number | null }): ItemBase | null {
  if (!r.peso_final_g || r.peso_final_g <= 0) return null
  const t = totaisIngredientes(r.ingredientes)
  const f = 100 / r.peso_final_g
  const p = r.porcoes > 0 ? r.porcoes : 1
  return {
    id: `receita-${r.id}`, nome: r.nome, fonte: 'receita',
    detalhe: `Receita · ${Math.round(r.peso_final_g).toLocaleString('pt-BR')} g pronta`,
    kcal: um(t.calorias * f), proteina: um(t.proteina_g * f), carboidrato: um(t.carboidrato_g * f), gordura: um(t.gordura_g * f),
    porcaoG: r.peso_final_g / p, porcaoRotulo: 'porção',
  }
}

// --- Relatório semanal ---

/** Segunda-feira da semana da data (YYYY-MM-DD). */
export function inicioSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay() // 0 = domingo
  return somarDias(iso, dia === 0 ? -6 : 1 - dia)
}

export interface DadosSemana {
  inicio: string
  alimentos: { data: string; nome: string; calorias: number; proteina_g: number; carboidrato_g: number; gordura_g: number }[]
  agua: { data: string; ml: number }[]
  exercicios: { data: string; calorias: number; duracao_min: number }[]
  pesos: { data: string; peso_kg: number }[]
  treinosConcluidos: number
  meta: { calorias: number; proteina_g: number; carboidrato_g: number; gordura_g: number; agua_ml: number; somar_exercicio: boolean } | null
}

export function resumoSemana(d: DadosSemana) {
  const datas = Array.from({ length: 7 }, (_, i) => somarDias(d.inicio, i))
  const dentro = (x: { data: string }) => x.data >= datas[0] && x.data <= datas[6]
  const al = d.alimentos.filter(dentro), ag = d.agua.filter(dentro), ex = d.exercicios.filter(dentro)
  const dias = datas.map(data => {
    const doDia = al.filter(a => a.data === data)
    const exercicio = ex.filter(e => e.data === data).reduce((s, e) => s + e.calorias, 0)
    const metaDia = d.meta ? d.meta.calorias + (d.meta.somar_exercicio ? exercicio : 0) : null
    return {
      data,
      registrou: doDia.length > 0,
      calorias: Math.round(doDia.reduce((s, a) => s + a.calorias, 0)),
      proteina_g: doDia.reduce((s, a) => s + a.proteina_g, 0),
      carboidrato_g: doDia.reduce((s, a) => s + a.carboidrato_g, 0),
      gordura_g: doDia.reduce((s, a) => s + a.gordura_g, 0),
      agua: ag.filter(a => a.data === data).reduce((s, a) => s + a.ml, 0),
      exercicio,
      metaDia,
    }
  })
  const registrados = dias.filter(x => x.registrou)
  const media = (f: (x: (typeof dias)[number]) => number, lista = registrados) => (lista.length ? lista.reduce((s, x) => s + f(x), 0) / lista.length : 0)
  const diasComAgua = dias.filter(x => x.agua > 0)
  // Peso: último da semana comparado ao primeiro registro da semana (ou ao último antes dela)
  const pesosOrd = [...d.pesos].sort((a, b) => a.data.localeCompare(b.data))
  const naSemana = pesosOrd.filter(dentro)
  const antes = pesosOrd.filter(p => p.data < datas[0]).pop()
  const base = antes ?? naSemana[0]
  const fim = naSemana[naSemana.length - 1]
  const contagem = new Map<string, number>()
  for (const a of al) contagem.set(a.nome, (contagem.get(a.nome) ?? 0) + 1)
  const topo = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]
  const melhor = d.meta ? [...registrados].sort((a, b) => Math.abs(a.calorias - (a.metaDia ?? 0)) - Math.abs(b.calorias - (b.metaDia ?? 0)))[0] : undefined
  return {
    dias,
    diasRegistrados: registrados.length,
    mediaCalorias: Math.round(media(x => x.calorias)),
    diasNaMeta: d.meta ? registrados.filter(x => x.calorias <= (x.metaDia ?? 0) && x.calorias >= (x.metaDia ?? 0) * 0.8).length : null,
    macrosMedios: { proteina_g: Math.round(media(x => x.proteina_g)), carboidrato_g: Math.round(media(x => x.carboidrato_g)), gordura_g: Math.round(media(x => x.gordura_g)) },
    aguaMedia: Math.round(media(x => x.agua, diasComAgua)),
    diasMetaAgua: d.meta ? dias.filter(x => x.agua >= d.meta!.agua_ml).length : null,
    exercicio: { calorias: ex.reduce((s, e) => s + e.calorias, 0), minutos: ex.reduce((s, e) => s + e.duracao_min, 0), sessoes: ex.length },
    peso: fim && base && fim !== base ? { atual: fim.peso_kg, variacao: um(fim.peso_kg - base.peso_kg) } : fim ? { atual: fim.peso_kg, variacao: null } : null,
    treinosConcluidos: d.treinosConcluidos,
    alimentoMaisRegistrado: topo && topo[1] > 1 ? { nome: topo[0], vezes: topo[1] } : null,
    melhorDia: melhor?.data ?? null,
  }
}
