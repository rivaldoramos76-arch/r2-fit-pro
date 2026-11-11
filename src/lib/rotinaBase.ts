// Ergogênicos (rotina de uso): lógica pura, sem dependências de runtime (testada em tests/logica.test.ts).
// Cada item tem dose, unidade, intervalo em dias, a data da próxima vez e uma ou mais "vezes" no dia
// (num horário, antes do treino ou depois do treino). Quando todas as vezes do dia são marcadas como
// feitas, a próxima passa a ser o dia + intervalo.

export type Forma = 'injetavel' | 'oral' | 'topico' | 'outro'
export type Unidade = 'mg' | 'ml' | 'g' | 'mcg' | 'UI' | 'unid'
export type Momento = 'horario' | 'antes' | 'depois'

export interface Vez { tipo: Momento; horario: string }

export interface ItemRotina {
  id: string
  nome: string
  forma: Forma
  dose: number
  unidade: Unidade
  /** A cada quantos dias (1 = todo dia, 7 = uma vez por semana) */
  intervaloDias: number
  /** Vezes no dia em que é usado (1 a 6) */
  vezes: Vez[]
  /** Próxima vez (AAAA-MM-DD) */
  proxima: string
  lembrete: boolean
  obs?: string
  /** Vezes feitas, mais recentes primeiro: "AAAA-MM-DD#índice da vez" */
  historico: string[]
}

export interface Rotina {
  itens: ItemRotina[]
  /** Modo discreto: Início, treino e avisos sem o nome do item */
  discreto: boolean
}

export const FORMAS: Record<Forma, string> = { injetavel: 'Injetável', oral: 'Oral (comprimido, cápsula)', topico: 'Tópico (gel, creme)', outro: 'Outro' }
export const UNIDADES: Unidade[] = ['mg', 'ml', 'g', 'mcg', 'UI', 'unid']
export const MOMENTOS: Record<Momento, string> = { horario: 'Horário', antes: 'Antes do treino', depois: 'Depois do treino' }
export const MAX_ITENS = 20
export const MAX_VEZES = 6
const MAX_HISTORICO = 60

export const rotinaVazia = (): Rotina => ({ itens: [], discreto: true })

/** Data local AAAA-MM-DD */
export function diaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const paraData = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
export function somarDias(iso: string, n: number): string { const d = paraData(iso); d.setDate(d.getDate() + n); return diaLocal(d) }
/** Dias de `a` até `b` (positivo se b é depois) */
export function diasEntre(a: string, b: string): number { return Math.round((paraData(b).getTime() - paraData(a).getTime()) / 86400000) }

/** Situação do item em relação a hoje: atrasado, hoje ou daqui a N dias. */
export function situacao(item: ItemRotina, hoje = diaLocal()): { tipo: 'atrasado' | 'hoje' | 'futuro'; dias: number; texto: string } {
  const d = diasEntre(hoje, item.proxima)
  if (d < 0) return { tipo: 'atrasado', dias: -d, texto: -d === 1 ? 'atrasado 1 dia' : `atrasado ${-d} dias` }
  if (d === 0) return { tipo: 'hoje', dias: 0, texto: 'hoje' }
  return { tipo: 'futuro', dias: d, texto: d === 1 ? 'amanhã' : `em ${d} dias` }
}

const chave = (dia: string, i: number) => `${dia}#${i}`
/** A vez `i` do item já foi feita no dia? */
export const vezFeita = (item: ItemRotina, i: number, dia = diaLocal()) => item.historico.includes(chave(dia, i))
/** Todas as vezes do dia feitas? */
export const diaCompleto = (item: ItemRotina, dia = diaLocal()) => item.vezes.every((_, i) => vezFeita(item, i, dia))
/** Alguma vez feita hoje? */
export const feitoHoje = (item: ItemRotina, hoje = diaLocal()) => item.historico.some(h => h.startsWith(hoje + '#'))

/** O item é para hoje (inclui atrasados e o que já foi feito hoje)? */
export const ehDeHoje = (item: ItemRotina, hoje = diaLocal()) => situacao(item, hoje).tipo !== 'futuro' || feitoHoje(item, hoje)

/** Itens com alguma vez ainda por fazer hoje. */
export const pendentesHoje = (r: Rotina, hoje = diaLocal()) =>
  r.itens.filter(i => situacao(i, hoje).tipo !== 'futuro' && !diaCompleto(i, hoje))

/** Vezes pendentes hoje num momento do treino ("antes"/"depois"). */
export function pendentesDoTreino(r: Rotina, momento: 'antes' | 'depois', hoje = diaLocal()): { item: ItemRotina; vez: number }[] {
  const out: { item: ItemRotina; vez: number }[] = []
  for (const item of r.itens) {
    if (situacao(item, hoje).tipo === 'futuro') continue
    item.vezes.forEach((v, i) => { if (v.tipo === momento && !vezFeita(item, i, hoje)) out.push({ item, vez: i }) })
  }
  return out
}

/** Marca a vez `i` como feita hoje; com o dia completo, a próxima vira hoje + intervalo. */
export function marcarVez(item: ItemRotina, i: number, hoje = diaLocal()): ItemRotina {
  const historico = [chave(hoje, i), ...item.historico.filter(h => h !== chave(hoje, i))].slice(0, MAX_HISTORICO)
  const novo = { ...item, historico }
  return diaCompleto(novo, hoje) ? { ...novo, proxima: somarDias(hoje, Math.max(1, item.intervaloDias)) } : novo
}

/** Desfaz a vez `i` de hoje; se o dia estava completo, a próxima volta para hoje. */
export function desfazerVez(item: ItemRotina, i: number, hoje = diaLocal()): ItemRotina {
  const estavaCompleto = diaCompleto(item, hoje)
  const novo = { ...item, historico: item.historico.filter(h => h !== chave(hoje, i)) }
  return estavaCompleto ? { ...novo, proxima: hoje } : novo
}

/** Histórico agrupado por dia (mais recente primeiro): quantas vezes feitas e quais. */
export function historicoPorDia(item: ItemRotina): { dia: string; vezes: number[] }[] {
  const mapa = new Map<string, number[]>()
  for (const h of item.historico) {
    const [dia, i] = h.split('#')
    if (!mapa.has(dia)) mapa.set(dia, [])
    mapa.get(dia)!.push(Number(i) || 0)
  }
  return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dia, vezes]) => ({ dia, vezes: vezes.sort() }))
}

const UNIDADE_TEXTO: Record<Unidade, string> = { mg: 'mg', ml: 'ml', g: 'g', mcg: 'mcg', UI: 'UI', unid: 'unid.' }
export const textoDose = (i: Pick<ItemRotina, 'dose' | 'unidade'>) =>
  `${String(i.dose).replace('.', ',')} ${UNIDADE_TEXTO[i.unidade]}`
export const textoIntervalo = (dias: number) =>
  dias === 1 ? 'todo dia' : dias === 7 ? '1 vez por semana' : dias === 14 ? 'a cada 2 semanas' : `a cada ${dias} dias`
export const textoVez = (v: Vez) => (v.tipo === 'horario' ? `às ${v.horario}` : v.tipo === 'antes' ? 'antes do treino' : 'depois do treino')
export const textoVezes = (vezes: Vez[]) => (vezes.length === 1 ? textoVez(vezes[0]) : `${vezes.length}x no dia (${vezes.map(textoVez).join(', ')})`)
export const dataCurta = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

const ehHora = (h: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h))

/** Valida e normaliza um item vindo do formulário (ou do banco); null se inválido. */
export function normalizarItem(raw: Partial<ItemRotina> & { id: string; horario?: string }): ItemRotina | null {
  const nome = String(raw.nome ?? '').trim().slice(0, 60)
  const dose = Number(String(raw.dose ?? '').replace(',', '.'))
  const intervalo = Math.round(Number(raw.intervaloDias))
  const proxima = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.proxima)) ? String(raw.proxima) : diaLocal()
  if (!nome || !(dose > 0) || !(intervalo >= 1 && intervalo <= 365)) return null
  const vezesRaw = Array.isArray(raw.vezes) && raw.vezes.length ? raw.vezes : [{ tipo: 'horario', horario: ehHora(raw.horario) ? raw.horario : '08:00' }]
  const vezes: Vez[] = vezesRaw.slice(0, MAX_VEZES).map(v => ({
    tipo: (v?.tipo === 'antes' || v?.tipo === 'depois' ? v.tipo : 'horario') as Momento,
    horario: ehHora(v?.horario) ? String(v.horario) : '08:00',
  }))
  return {
    id: raw.id, nome, dose: Math.round(dose * 1000) / 1000,
    forma: (raw.forma && raw.forma in FORMAS ? raw.forma : 'outro') as Forma,
    unidade: (UNIDADES.includes(raw.unidade as Unidade) ? raw.unidade : 'mg') as Unidade,
    intervaloDias: intervalo, vezes, proxima,
    lembrete: raw.lembrete !== false,
    obs: raw.obs ? String(raw.obs).trim().slice(0, 200) : undefined,
    // Formato antigo (só a data) conta como a primeira vez do dia
    historico: Array.isArray(raw.historico)
      ? raw.historico.map(h => (/^\d{4}-\d{2}-\d{2}$/.test(h) ? `${h}#0` : h)).filter(h => /^\d{4}-\d{2}-\d{2}#\d$/.test(h)).slice(0, MAX_HISTORICO)
      : [],
  }
}

export function normalizarRotina(raw: unknown): Rotina {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Rotina>
  const itens = (Array.isArray(r.itens) ? r.itens : [])
    .map(i => (i && typeof i === 'object' && typeof (i as ItemRotina).id === 'string' ? normalizarItem(i as ItemRotina) : null))
    .filter((i): i is ItemRotina => !!i).slice(0, MAX_ITENS)
  return { itens, discreto: r.discreto !== false }
}

/** Texto do aviso no celular: no modo discreto, sem o nome do item. */
export function textoAviso(item: ItemRotina, discreto: boolean, momento?: 'antes' | 'depois'): { titulo: string; corpo: string } {
  const quando = momento === 'antes' ? 'antes do treino' : momento === 'depois' ? 'depois do treino' : 'para hoje'
  return discreto
    ? { titulo: 'Lembrete da sua rotina ⏰', corpo: `Você tem um item ${quando}. Toque para ver.` }
    : { titulo: momento ? `${momento === 'antes' ? 'Antes' : 'Depois'} do treino: ${item.nome}` : `Hoje: ${item.nome}`, corpo: `${textoDose(item)} · toque para marcar como feito.` }
}
