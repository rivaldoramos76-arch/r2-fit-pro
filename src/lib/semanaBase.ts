// Treino perdido: lógica pura da semana (testada em tests/logica.test.ts).
// Com os dias da semana de cada sessão do plano (agenda[].diaSemana), descobre os treinos que ficaram
// para trás nesta semana e monta os ajustes temporários (só até domingo; o plano em si não muda):
//  - dividir: os exercícios do treino perdido vão para os próximos dias de treino da semana, sem mudar o volume;
//  - encaixar: o treino perdido inteiro vai para um dia livre (plano.encaixes).
import { DIAS_SEMANA, uid, type DiaTreino, type ExercicioPlano, type PlanoTreino } from './treinoModel'
import { CATALOGO, GRUPOS, type GrupoMuscular } from '../data/exercicios'
import { encontrarPorNome, normalizar } from './busca'

const paraData = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const hojeIso = () => iso(new Date())
export const dataLocal = (ts: string) => iso(new Date(ts))
export function somar(isoData: string, n: number) { const d = paraData(isoData); d.setDate(d.getDate() + n); return iso(d) }

/** Segunda-feira da semana da data. */
export function inicioSemana(isoData: string): string {
  const d = paraData(isoData)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}
export const fimSemana = (isoData: string) => somar(inicioSemana(isoData), 6)
/** Nome do dia ("Segunda"...) de uma data. */
export const nomeDoDia = (isoData: string) => DIAS_SEMANA[(paraData(isoData).getDay() + 6) % 7]
/** "segunda, 11/11" */
export function dataComDia(isoData: string): string {
  const [, m, d] = isoData.split('-')
  return `${nomeDoDia(isoData).toLowerCase()}, ${d}/${m}`
}

export interface Agendado { data: string; letra: string; diaIdx: number }

/** O plano tem os dias da semana definidos? */
export const temDiasDaSemana = (p: PlanoTreino) => p.agenda.some(s => !!s.diaSemana && DIAS_SEMANA.includes(s.diaSemana))

/** Sessões do plano nesta semana (as que têm dia da semana), em ordem de data. */
export function agendaDaSemana(p: PlanoTreino, hoje: string): Agendado[] {
  const seg = inicioSemana(hoje)
  return p.agenda.flatMap(s => {
    const i = s.diaSemana ? DIAS_SEMANA.indexOf(s.diaSemana) : -1
    const diaIdx = p.dias.findIndex(d => d.letra === s.letra)
    return i >= 0 && diaIdx >= 0 ? [{ data: somar(seg, i), letra: s.letra, diaIdx }] : []
  }).sort((a, b) => a.data.localeCompare(b.data))
}

/** Grupos maiores primeiro (perna, costas, peito...) quando falta mais de um treino. */
const PRIORIDADE = ['quadriceps', 'posteriores', 'gluteos', 'costas', 'peito', 'ombros', 'trapezio', 'biceps', 'triceps', 'panturrilhas', 'abdomen', 'antebracos', 'lombar', 'adutores']
const pesoDia = (p: PlanoTreino, diaIdx: number) =>
  Math.min(99, ...(p.dias[diaIdx]?.grupos ?? []).map(g => { const k = PRIORIDADE.indexOf(g); return k < 0 ? 99 : k }))

/** Datas de treinos perdidos já ajustados nesta semana (divididos ou encaixados). */
export function origensAjustadas(p: PlanoTreino): Set<string> {
  return new Set([
    ...p.dias.flatMap(d => d.exercicios.map(e => e.origemTemp).filter((x): x is string => !!x)),
    ...(p.encaixes ?? []).map(e => e.origem),
  ])
}

/**
 * Sessões da semana sem treino feito, até `limite` (exclusivo; inclusivo com `incluirLimite`).
 * `feitos` = índice do treino (dia_index) de cada treino feito nesta semana, em qualquer dia:
 * quem fez o treino de segunda na terça não perdeu nada. Tira os já ajustados e põe os grupos maiores primeiro.
 */
export function pendentes(p: PlanoTreino, hoje: string, feitos: number[], limite = hoje, incluirLimite = false): Agendado[] {
  const resta = new Map<number, number>()
  feitos.forEach(i => resta.set(i, (resta.get(i) ?? 0) + 1))
  const ajustados = origensAjustadas(p)
  return agendaDaSemana(p, hoje)
    .filter(a => (incluirLimite ? a.data <= limite : a.data < limite))
    .filter(a => {
      const n = resta.get(a.diaIdx) ?? 0
      if (n > 0) { resta.set(a.diaIdx, n - 1); return false }
      return true
    })
    .filter(a => !ajustados.has(a.data))
    .sort((a, b) => pesoDia(p, a.diaIdx) - pesoDia(p, b.diaIdx) || a.data.localeCompare(b.data))
}

/** Treinos que ficaram para trás nesta semana (dias que já passaram). */
export const treinosPerdidos = (p: PlanoTreino, hoje: string, feitos: number[]) => pendentes(p, hoje, feitos)

/** Próximos dias de treino da semana; hoje entra se o treino de hoje ainda não foi feito. */
export const diasDeTreinoRestantes = (p: PlanoTreino, hoje: string, hojeFeito: boolean) =>
  agendaDaSemana(p, hoje).filter(a => a.data > hoje || (a.data === hoje && !hojeFeito))

/** Dias livres de hoje até domingo (sem sessão do plano e sem treino encaixado). */
export function diasLivres(p: PlanoTreino, hoje: string): string[] {
  const ocupados = new Set([...agendaDaSemana(p, hoje).map(a => a.data), ...(p.encaixes ?? []).map(e => e.data)])
  const out: string[] = []
  for (let d = hoje; d <= fimSemana(hoje); d = somar(d, 1)) if (!ocupados.has(d)) out.push(d)
  return out
}

// --- Grupamentos: evitar o mesmo grupamento em dias seguidos ---

/** Grupamento de cada grupo (perna junta quadríceps, posteriores, glúteos e adutores). Abdômen, panturrilha e antebraço podem seguidos. */
const FAMILIA: Partial<Record<GrupoMuscular, string>> = {
  quadriceps: 'Pernas', posteriores: 'Pernas', gluteos: 'Pernas', adutores: 'Pernas',
  peito: 'Peito', costas: 'Costas', lombar: 'Costas', ombros: 'Ombros', trapezio: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps',
}
const GRUPO_POR_NOME = new Map((Object.keys(GRUPOS) as GrupoMuscular[]).map(g => [normalizar(GRUPOS[g]), g]))

/** Grupamento principal de um exercício (pelo catálogo, pelo nome ou pelo grupo escrito). */
export function familiaDoExercicio(e: Pick<ExercicioPlano, 'catalogo_id' | 'nome' | 'grupos_musculares' | 'tipo'>): string | undefined {
  if (e.tipo === 'cardio') return undefined
  const c = (e.catalogo_id ? CATALOGO.find(x => x.id === e.catalogo_id) : undefined) ?? encontrarPorNome(e.nome)
  if (c) return FAMILIA[c.grupo]
  const g = GRUPO_POR_NOME.get(normalizar(e.grupos_musculares?.[0] ?? '')) ?? GRUPO_POR_NOME.get(normalizar(e.grupos_musculares?.[0] ?? '').split(' ')[0])
  return g ? FAMILIA[g] : undefined
}

/** Grupamentos de um treino (os grupos marcados e os dos exercícios). */
export function familiasDoDia(d: DiaTreino | undefined): Set<string> {
  if (!d) return new Set()
  return new Set([
    ...d.grupos.map(g => FAMILIA[g]),
    ...d.exercicios.map(familiaDoExercicio),
  ].filter((x): x is string => !!x))
}

/** Grupamentos de cada data da semana (sessões do plano e encaixes), sem a data de um treino perdido. */
function mapaDaSemana(p: PlanoTreino, hoje: string, semData?: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  const somarDia = (data: string, d: DiaTreino | undefined) => { if (data !== semData) m.set(data, new Set([...(m.get(data) ?? []), ...familiasDoDia(d)])) }
  agendaDaSemana(p, hoje).forEach(a => somarDia(a.data, p.dias[a.diaIdx]))
  ;(p.encaixes ?? []).forEach(e => somarDia(e.data, p.dias.find(d => d.letra === e.letra)))
  return m
}
const vizinhoCom = (m: Map<string, Set<string>>, data: string, f: string) => !!(m.get(somar(data, -1))?.has(f) || m.get(somar(data, 1))?.has(f))

/**
 * Divide o treino perdido nos próximos dias de treino da semana, com as mesmas séries, repetições, carga e tempos.
 * Cada exercício vai para o dia com menos exercícios extras que não fique colado (dia antes ou depois) num treino
 * do mesmo grupamento; só se não houver jeito vai para um dia colado. Fica até domingo e some sozinho.
 */
export function dividirNaSemana(p: PlanoTreino, perdido: Agendado, hoje: string, hojeFeito: boolean): PlanoTreino {
  const restantes = diasDeTreinoRestantes(p, hoje, hojeFeito).filter(a => a.diaIdx !== perdido.diaIdx)
  const destinos = [...new Set(restantes.map(a => a.diaIdx))]
  const exs = p.dias[perdido.diaIdx]?.exercicios.filter(e => !e.temporarioAte) ?? []
  if (!destinos.length || !exs.length) return p
  const ate = fimSemana(hoje)
  const mapa = mapaDaSemana(p, hoje, perdido.data)
  const datasDe = (i: number) => restantes.filter(a => a.diaIdx === i).map(a => a.data)
  const extra = new Map<number, ExercicioPlano[]>()
  exs.forEach(e => {
    const f = familiaDoExercicio(e)
    const colado = (i: number) => (f && datasDe(i).some(d => vizinhoCom(mapa, d, f)) ? 1 : 0)
    const alvo = [...destinos].sort((a, b) => colado(a) - colado(b) || (extra.get(a)?.length ?? 0) - (extra.get(b)?.length ?? 0) || destinos.indexOf(a) - destinos.indexOf(b))[0]
    extra.set(alvo, [...(extra.get(alvo) ?? []), { ...e, id: uid('e'), temporarioAte: ate, origemTemp: perdido.data }])
    if (f) datasDe(alvo).forEach(d => mapa.set(d, new Set([...(mapa.get(d) ?? []), f])))
  })
  return { ...p, dias: p.dias.map((d, i) => (extra.has(i) ? { ...d, exercicios: [...d.exercicios, ...extra.get(i)!] } : d)) }
}

/** Dia livre para encaixar: se fica colado num treino do mesmo grupamento e se tira o último descanso até domingo. */
export interface DiaLivre { data: string; colado: string[]; semDescanso: boolean }
export function opcoesEncaixe(p: PlanoTreino, perdido: Agendado, hoje: string): DiaLivre[] {
  const mapa = mapaDaSemana(p, hoje, perdido.data)
  const fams = [...familiasDoDia(p.dias[perdido.diaIdx])]
  const livres = diasLivres(p, hoje)
  return livres
    .map(data => ({ data, colado: fams.filter(f => vizinhoCom(mapa, data, f)), semDescanso: livres.length === 1 }))
    .sort((a, b) => Number(a.colado.length > 0) - Number(b.colado.length > 0) || a.data.localeCompare(b.data))
}

/** Dá para dividir? (há outro dia de treino até domingo) */
export const podeDividir = (p: PlanoTreino, perdido: Agendado, hoje: string, hojeFeito: boolean) =>
  diasDeTreinoRestantes(p, hoje, hojeFeito).some(a => a.diaIdx !== perdido.diaIdx)

/** Encaixa o treino perdido inteiro num dia livre desta semana. */
export const encaixar = (p: PlanoTreino, perdido: Agendado, data: string, hoje: string): PlanoTreino =>
  ({ ...p, encaixes: [...(p.encaixes ?? []), { data, letra: perdido.letra, origem: perdido.data, ate: fimSemana(hoje) }] })

/** Desfaz o ajuste de um treino perdido (tira os exercícios divididos e o encaixe). */
export const desfazerAjuste = (p: PlanoTreino, origem: string): PlanoTreino => ({
  ...p,
  dias: p.dias.map(d => ({ ...d, exercicios: d.exercicios.filter(e => e.origemTemp !== origem) })),
  encaixes: (p.encaixes ?? []).filter(e => e.origem !== origem),
})

export interface Ajuste { origem: string; letra: string; tipo: 'dividido' | 'encaixado'; data?: string; diaIdx: number }

/** Ajustes desta semana, para mostrar "Semana ajustada · desfazer". */
export function ajustesDaSemana(p: PlanoTreino, hoje: string): Ajuste[] {
  const seg = inicioSemana(hoje)
  const letraDa = (origem: string) => agendaDaSemana(p, hoje).find(a => a.data === origem)?.letra ?? ''
  const divididos = [...new Set(p.dias.flatMap(d => d.exercicios.filter(e => e.origemTemp && e.origemTemp >= seg).map(e => e.origemTemp!)))]
    .map(origem => { const letra = letraDa(origem); return { origem, letra, tipo: 'dividido' as const, diaIdx: p.dias.findIndex(d => d.letra === letra) } })
  const encaixados = (p.encaixes ?? []).filter(e => e.origem >= seg)
    .map(e => ({ origem: e.origem, letra: e.letra, tipo: 'encaixado' as const, data: e.data, diaIdx: p.dias.findIndex(d => d.letra === e.letra) }))
  return [...divididos, ...encaixados].sort((a, b) => a.origem.localeCompare(b.origem))
}

/** Treino encaixado para hoje (se houver e ainda não foi feito). */
export const encaixeDeHoje = (p: PlanoTreino, hoje: string) => (p.encaixes ?? []).find(e => e.data === hoje)

/**
 * Avisos de manhã no app Android: para cada dia de treino de hoje até sábado ainda sem treino,
 * um aviso no dia seguinte (o app refaz a lista quando um treino é feito, então só sobra o que faltou).
 */
export function avisosDaSemana(p: PlanoTreino, hoje: string, feitos: number[]): Agendado[] {
  const abertos = new Set(pendentes(p, hoje, feitos, hoje, true).map(a => a.data))
  return agendaDaSemana(p, hoje).filter(a => a.data >= hoje && a.data < fimSemana(hoje) && (a.data > hoje || abertos.has(a.data)))
}

// --- Dias de treino (pergunta na primeira vez e editor) ---

/** Dias padrão para N sessões, quando o plano ainda não tem dia da semana (0 = segunda). */
const PADRAO: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] }

/** Semana de segunda a domingo com a letra do treino de cada dia (null = descanso), a partir do plano. */
export function semanaDoPlano(p: PlanoTreino): (string | null)[] {
  const semana: (string | null)[] = Array(7).fill(null)
  if (temDiasDaSemana(p)) {
    p.agenda.forEach(s => { const i = s.diaSemana ? DIAS_SEMANA.indexOf(s.diaSemana) : -1; if (i >= 0 && !semana[i]) semana[i] = s.letra })
    return semana
  }
  const slots = p.agenda.slice(0, 7)
  ;(PADRAO[slots.length] ?? []).forEach((d, k) => { semana[d] = slots[k].letra })
  return semana
}

/** Grava a semana escolhida no plano (a ordem da semana vira a sequência dos treinos). */
export function aplicarSemana(p: PlanoTreino, semana: (string | null)[]): PlanoTreino {
  const agenda = semana.flatMap((letra, i) => (letra && p.dias.some(d => d.letra === letra) ? [{ letra, diaSemana: DIAS_SEMANA[i] }] : []))
  return agenda.length ? { ...p, agenda, frequencia_semanal: agenda.length, config: { ...p.config, frequencia: agenda.length } } : p
}

/** Avisos do editor de dias: sem descanso na semana e o mesmo grupamento em dias seguidos (domingo encosta na segunda). */
export function alertasSemana(p: PlanoTreino, semana: (string | null)[]): string[] {
  const out: string[] = []
  if (semana.every(Boolean)) out.push('Sem nenhum dia de descanso na semana.')
  const fam = semana.map(l => (l ? familiasDoDia(p.dias.find(d => d.letra === l)) : new Set<string>()))
  for (let i = 0; i < 7; i++) {
    const j = (i + 1) % 7
    const iguais = [...fam[i]].filter(f => fam[j].has(f))
    if (iguais.length) out.push(`${iguais.join(' e ')} em dias seguidos (${DIAS_SEMANA[i]} e ${DIAS_SEMANA[j]}).`)
  }
  return out
}
