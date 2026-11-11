// Ergogênicos (rotina de uso): lógica pura, sem dependências de runtime (testada em tests/logica.test.ts).
// Cada item tem dose, unidade, intervalo em dias e a data da próxima vez; ao marcar "feito",
// a próxima passa a ser hoje + intervalo.

export type Forma = 'injetavel' | 'oral' | 'topico' | 'outro'
export type Unidade = 'mg' | 'ml' | 'g' | 'mcg' | 'UI' | 'unid'

export interface ItemRotina {
  id: string
  nome: string
  forma: Forma
  dose: number
  unidade: Unidade
  /** A cada quantos dias (1 = todo dia, 7 = uma vez por semana) */
  intervaloDias: number
  /** Hora do lembrete (HH:MM) */
  horario: string
  /** Próxima vez (AAAA-MM-DD) */
  proxima: string
  lembrete: boolean
  obs?: string
  /** Últimas vezes marcadas como feitas (AAAA-MM-DD), mais recente primeiro */
  historico: string[]
}

export interface Rotina {
  itens: ItemRotina[]
  /** Modo discreto: Início e avisos sem o nome do item */
  discreto: boolean
}

export const FORMAS: Record<Forma, string> = { injetavel: 'Injetável', oral: 'Oral (comprimido, cápsula)', topico: 'Tópico (gel, creme)', outro: 'Outro' }
export const UNIDADES: Unidade[] = ['mg', 'ml', 'g', 'mcg', 'UI', 'unid']
export const MAX_ITENS = 20
const MAX_HISTORICO = 20

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

/** Itens para fazer hoje (inclui atrasados). */
export const pendentesHoje = (r: Rotina, hoje = diaLocal()) => r.itens.filter(i => situacao(i, hoje).tipo !== 'futuro')

/** Marca como feito hoje: guarda no histórico e a próxima vira hoje + intervalo. */
export function marcarFeito(item: ItemRotina, hoje = diaLocal()): ItemRotina {
  return {
    ...item,
    historico: [hoje, ...item.historico.filter(h => h !== hoje)].slice(0, MAX_HISTORICO),
    proxima: somarDias(hoje, Math.max(1, item.intervaloDias)),
  }
}

/** Desfaz o "feito" de hoje (próxima volta para hoje). */
export function desfazerFeito(item: ItemRotina, hoje = diaLocal()): ItemRotina {
  return { ...item, historico: item.historico.filter(h => h !== hoje), proxima: hoje }
}

export const feitoHoje = (item: ItemRotina, hoje = diaLocal()) => item.historico[0] === hoje

const UNIDADE_TEXTO: Record<Unidade, string> = { mg: 'mg', ml: 'ml', g: 'g', mcg: 'mcg', UI: 'UI', unid: 'unid.' }
export const textoDose = (i: Pick<ItemRotina, 'dose' | 'unidade'>) =>
  `${String(i.dose).replace('.', ',')} ${UNIDADE_TEXTO[i.unidade]}`
export const textoIntervalo = (dias: number) =>
  dias === 1 ? 'todo dia' : dias === 7 ? '1 vez por semana' : dias === 14 ? 'a cada 2 semanas' : `a cada ${dias} dias`

/** Valida e normaliza um item vindo do formulário (ou do banco); null se inválido. */
export function normalizarItem(raw: Partial<ItemRotina> & { id: string }): ItemRotina | null {
  const nome = String(raw.nome ?? '').trim().slice(0, 60)
  const dose = Number(String(raw.dose ?? '').toString().replace(',', '.'))
  const intervalo = Math.round(Number(raw.intervaloDias))
  const horario = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.horario)) ? String(raw.horario) : '08:00'
  const proxima = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.proxima)) ? String(raw.proxima) : diaLocal()
  if (!nome || !(dose > 0) || !(intervalo >= 1 && intervalo <= 365)) return null
  return {
    id: raw.id, nome, dose: Math.round(dose * 1000) / 1000,
    forma: (raw.forma && raw.forma in FORMAS ? raw.forma : 'outro') as Forma,
    unidade: (UNIDADES.includes(raw.unidade as Unidade) ? raw.unidade : 'mg') as Unidade,
    intervaloDias: intervalo, horario, proxima,
    lembrete: raw.lembrete !== false,
    obs: raw.obs ? String(raw.obs).trim().slice(0, 200) : undefined,
    historico: Array.isArray(raw.historico) ? raw.historico.filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h)).slice(0, MAX_HISTORICO) : [],
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
export function textoAviso(item: ItemRotina, discreto: boolean): { titulo: string; corpo: string } {
  return discreto
    ? { titulo: 'Lembrete da sua rotina ⏰', corpo: 'Você tem um item para hoje. Toque para ver.' }
    : { titulo: `Hoje: ${item.nome}`, corpo: `${textoDose(item)} · toque para marcar como feito.` }
}
