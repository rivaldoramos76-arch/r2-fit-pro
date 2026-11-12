// Treino perdido: lógica pura da semana (testada em tests/logica.test.ts).
// Com os dias da semana de cada sessão do plano (agenda[].diaSemana), descobre os treinos que ficaram
// para trás nesta semana e monta os ajustes temporários (só até domingo; o plano em si não muda):
//  - dividir: o treino perdido é separado por músculo e vai para os próximos treinos (desta semana ou desta e da
//    próxima), sem mudar o volume, sem pesar nenhum dia e sem pôr o mesmo grupamento em dias seguidos (plano.extras);
//  - encaixar: o treino perdido inteiro vai para um dia livre (plano.encaixes).
import { DIAS_SEMANA, aplicarExtras, uid, type DiaTreino, type ExercicioPlano, type Extra, type PlanoTreino } from './treinoModel'
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

/** Sessões do plano nas `semanas` semanas a partir da semana da data (as que têm dia da semana), em ordem de data. */
export function agendaDasSemanas(p: PlanoTreino, hoje: string, semanas = 1): Agendado[] {
  const seg = inicioSemana(hoje)
  return Array.from({ length: semanas }, (_, w) => p.agenda.flatMap(s => {
    const i = s.diaSemana ? DIAS_SEMANA.indexOf(s.diaSemana) : -1
    const diaIdx = p.dias.findIndex(d => d.letra === s.letra)
    return i >= 0 && diaIdx >= 0 ? [{ data: somar(seg, 7 * w + i), letra: s.letra, diaIdx }] : []
  })).flat().sort((a, b) => a.data.localeCompare(b.data))
}
/** Sessões do plano nesta semana. */
export const agendaDaSemana = (p: PlanoTreino, hoje: string) => agendaDasSemanas(p, hoje, 1)

/** Grupos maiores primeiro (perna, costas, peito...) quando falta mais de um treino. */
const PRIORIDADE = ['quadriceps', 'posteriores', 'gluteos', 'costas', 'peito', 'ombros', 'trapezio', 'biceps', 'triceps', 'panturrilhas', 'abdomen', 'antebracos', 'lombar', 'adutores']
const pesoDia = (p: PlanoTreino, diaIdx: number) =>
  Math.min(99, ...(p.dias[diaIdx]?.grupos ?? []).map(g => { const k = PRIORIDADE.indexOf(g); return k < 0 ? 99 : k }))

/** Datas de treinos perdidos já ajustados nesta semana (divididos ou encaixados). */
export function origensAjustadas(p: PlanoTreino): Set<string> {
  return new Set([
    ...p.dias.flatMap(d => d.exercicios.map(e => e.origemTemp).filter((x): x is string => !!x)),
    ...(p.encaixes ?? []).map(e => e.origem),
    ...(p.extras ?? []).map(e => e.origem),
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

/** Grupamentos de cada data (sessões do plano e encaixes) desta semana e das 2 seguintes, sem a data de um treino perdido. */
function mapaDaSemana(p: PlanoTreino, hoje: string, semData?: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  const somarDia = (data: string, fams: Iterable<string>) => { if (data !== semData) m.set(data, new Set([...(m.get(data) ?? []), ...fams])) }
  agendaDasSemanas(p, hoje, 3).forEach(a => somarDia(a.data, familiasDoDia(p.dias[a.diaIdx])))
  ;(p.encaixes ?? []).forEach(e => somarDia(e.data, familiasDoDia(p.dias.find(d => d.letra === e.letra))))
  return m
}
const vizinhoCom = (m: Map<string, Set<string>>, data: string, f: string) => !!(m.get(somar(data, -1))?.has(f) || m.get(somar(data, 1))?.has(f))

// --- Dividir o treino perdido ---

/** Parte do músculo para separar o treino: bíceps de tríceps, quadríceps de posterior, ombro da frente do de trás... */
export function parteDoExercicio(e: ExercicioPlano): string {
  if (e.tipo === 'cardio') return 'Cardio'
  const c = (e.catalogo_id ? CATALOGO.find(x => x.id === e.catalogo_id) : undefined) ?? encontrarPorNome(e.nome)
  if (c) {
    if (c.grupo === 'ombros') {
      if (c.secundarios.includes('costas')) return 'Ombro (trás)' // crucifixo invertido, face pull
      if (/^(elevação lateral|remada alta)/i.test(c.nome)) return 'Ombro (lateral)'
      return 'Ombro (frente)' // desenvolvimento, elevação frontal
    }
    return GRUPOS[c.grupo]
  }
  const g = GRUPO_POR_NOME.get(normalizar(e.grupos_musculares?.[0] ?? '')) ?? GRUPO_POR_NOME.get(normalizar(e.grupos_musculares?.[0] ?? '').split(' ')[0])
  return g ? GRUPOS[g] : (e.grupos_musculares?.[0] || e.nome)
}

/** Séries a mais que um treino aguenta sem ficar pesado (≈ 2 a 3 exercícios). */
export const LIMITE_EXTRA = 8
const seriesDe = (exs: ExercicioPlano[]) => exs.reduce((t, e) => t + Math.max(1, e.series), 0)

export interface Destino { data: string; letra: string; diaIdx: number; exercicios: ExercicioPlano[]; series: number }
export interface Divisao {
  semanas: 1 | 2; destinos: Destino[]; alertas: string[]; plano: PlanoTreino; ate: string
  /** quem planejou: a IA (analisando o treino todo) ou as regras do app */
  fonte: 'ia' | 'regras'; explicacao?: string
}

/** Treinos que podem receber parte do treino perdido: de hoje (se ainda não treinou) até o fim do período, menos o próprio treino perdido. */
export function vagas(p: PlanoTreino, perdido: Agendado, hoje: string, hojeFeito: boolean, semanas: 1 | 2): Agendado[] {
  return agendaDasSemanas(p, hoje, semanas).filter(a => (a.data > hoje || (a.data === hoje && !hojeFeito)) && a.diaIdx !== perdido.diaIdx)
}

/** Dá para dividir? (há outro treino no período) */
export const podeDividir = (p: PlanoTreino, perdido: Agendado, hoje: string, hojeFeito: boolean, semanas: 1 | 2 = 1) =>
  vagas(p, perdido, hoje, hojeFeito, semanas).length > 0

/**
 * Planeja a divisão do treino perdido (só monta; quem confirma grava).
 *  1. Separa o treino por parte do músculo (bíceps, tríceps, quadríceps, posterior, ombro da frente...), na ordem dele.
 *  2. Coloca as partes maiores primeiro, cada uma no treino que menos atrapalha:
 *     - nunca colado (dia antes ou depois) num treino do mesmo grupamento, se der;
 *     - de preferência num treino que não seja do mesmo grupamento (não dobra o volume do músculo no dia);
 *     - sem passar de 8 séries a mais por treino e equilibrando as séries entre os dias;
 *     - nesta semana antes da próxima.
 *  3. Parte que não cabe inteira num treino sem pesar é quebrada em exercícios (uma parte das costas num dia, outra em outro).
 *  Séries, repetições, carga e tempos ficam iguais. Cada exercício entra só na sessão escolhida daquele treino
 *  (do dia seguinte ao treino anterior de mesma letra até a véspera do próximo) e some sozinho depois.
 */
export function planejarDivisao(p: PlanoTreino, perdido: Agendado, hoje: string, hojeFeito: boolean, semanas: 1 | 2): Divisao | null {
  const slots = vagas(p, perdido, hoje, hojeFeito, semanas)
  const exs = p.dias[perdido.diaIdx]?.exercicios.filter(e => !e.temporarioAte) ?? []
  if (!slots.length || !exs.length) return null
  const mapa = mapaDaSemana(p, hoje, perdido.data)
  const carga = new Map<string, ExercicioPlano[]>(slots.map(s => [s.data, []]))

  // 1. partes, na ordem do treino
  const partes: ExercicioPlano[][] = []
  const porParte = new Map<string, ExercicioPlano[]>()
  exs.forEach(e => { const k = parteDoExercicio(e); if (!porParte.has(k)) { porParte.set(k, []); partes.push(porParte.get(k)!) } porParte.get(k)!.push(e) })
  // parte grande demais para um dia já vai quebrada
  let fila = partes.flatMap(pt => (seriesDe(pt) > LIMITE_EXTRA ? pt.map(e => [e]) : [pt]))
  const ordenar = () => { fila = [...fila].sort((a, b) => seriesDe(b) - seriesDe(a)) }
  ordenar()

  const custo = (s: Agendado, bloco: ExercicioPlano[]) => {
    const fams = new Set(bloco.map(familiaDoExercicio).filter((x): x is string => !!x))
    const base = familiasDoDia(p.dias[s.diaIdx])
    const atual = seriesDe(carga.get(s.data)!)
    const depois = atual + seriesDe(bloco)
    const colado = [...fams].some(f => vizinhoCom(mapa, s.data, f))
    const mesmo = [...fams].some(f => base.has(f))
    return { colado, mesmo, passa: Math.max(0, depois - LIMITE_EXTRA), valor: (colado ? 1000 : 0) + (mesmo ? 150 : 0) + Math.max(0, depois - LIMITE_EXTRA) * 40 + atual * 3 + diasEntre(hoje, s.data) * 0.5 }
  }
  while (fila.length) {
    const bloco = fila.shift()!
    const opcoes = slots.map(s => ({ s, c: custo(s, bloco) })).sort((a, b) => a.c.valor - b.c.valor)
    const melhor = opcoes[0]
    if (bloco.length > 1 && (melhor.c.colado || melhor.c.passa > 0)) { fila.push(...bloco.map(e => [e])); ordenar(); continue }
    carga.get(melhor.s.data)!.push(...bloco)
    bloco.forEach(e => { const f = familiaDoExercicio(e); if (f) mapa.set(melhor.s.data, new Set([...(mapa.get(melhor.s.data) ?? []), f])) })
  }

  return montarDivisao(p, perdido, hoje, semanas, slots, carga, 'regras')
}

/** Monta a divisão a partir de quais exercícios vão em cada sessão (das regras ou da IA): avisos, janelas e o plano novo. */
function montarDivisao(p: PlanoTreino, perdido: Agendado, hoje: string, semanas: 1 | 2, slots: Agendado[], carga: Map<string, ExercicioPlano[]>,
  fonte: 'ia' | 'regras', explicacao?: string): Divisao {
  const destinos: Destino[] = slots.filter(s => carga.get(s.data)?.length)
    .map(s => ({ ...s, exercicios: carga.get(s.data)!, series: seriesDe(carga.get(s.data)!) }))
  // avisos: dia que passou do limite e músculo colado num treino do mesmo grupamento (contando o que foi dividido)
  const mapa = mapaDaSemana(p, hoje, perdido.data)
  destinos.forEach(d => d.exercicios.forEach(e => { const f = familiaDoExercicio(e); if (f) mapa.set(d.data, new Set([...(mapa.get(d.data) ?? []), f])) }))
  const alertas: string[] = []
  destinos.forEach(d => {
    const colados = [...new Set(d.exercicios.map(familiaDoExercicio).filter((f): f is string => !!f && vizinhoCom(mapa, d.data, f)))]
    colados.forEach(f => alertas.push(`${f} em dias seguidos (${dataComDia(d.data).split(',')[0]}).`))
  })
  destinos.filter(d => d.series > LIMITE_EXTRA).forEach(d => alertas.push(`Fica puxado: +${d.series} séries em ${dataComDia(d.data)}.`))

  // janela de cada sessão: do dia seguinte à sessão anterior da mesma letra até a véspera da próxima (no máximo o domingo)
  const todas = agendaDasSemanas(p, hoje, 3)
  const extras: Extra[] = destinos.flatMap(d => {
    const mesmas = todas.filter(a => a.letra === d.letra).map(a => a.data)
    const antes = mesmas.filter(x => x < d.data).pop()
    const depois = mesmas.find(x => x > d.data)
    const validoDe = antes && somar(antes, 1) > hoje ? somar(antes, 1) : hoje
    const ate = depois && somar(depois, -1) < fimSemana(d.data) ? somar(depois, -1) : fimSemana(d.data)
    return d.exercicios.map(e => ({ letra: d.letra, validoDe, ate, origem: perdido.data, letraOrigem: perdido.letra, exercicio: { ...e, id: uid('e') } }))
  })
  const todosExtras = [...(p.extras ?? []), ...extras]
  const plano = { ...p, extras: todosExtras, dias: aplicarExtras(p.dias, todosExtras, hoje) }
  return { semanas, destinos, alertas, plano, ate: extras.reduce((m, x) => (x.ate > m ? x.ate : m), hoje), fonte, explicacao }
}

/** Exercícios do treino perdido que entram na divisão (sem os temporários). */
export const exerciciosDoPerdido = (p: PlanoTreino, perdido: Agendado) => p.dias[perdido.diaIdx]?.exercicios.filter(e => !e.temporarioAte) ?? []

/**
 * Divisão a partir de uma resposta da IA: { data da sessão: [ids dos exercícios] }. Só vale se cada exercício do treino
 * perdido aparece exatamente uma vez e só em sessões que podem receber; senão null (o app usa as regras).
 */
export function divisaoPorAtribuicao(p: PlanoTreino, perdido: Agendado, hoje: string, hojeFeito: boolean, semanas: 1 | 2,
  porData: Record<string, string[]>, explicacao?: string): Divisao | null {
  const slots = vagas(p, perdido, hoje, hojeFeito, semanas)
  const exs = exerciciosDoPerdido(p, perdido)
  if (!slots.length || !exs.length) return null
  const carga = new Map<string, ExercicioPlano[]>(slots.map(s => [s.data, []]))
  const usados = new Set<string>()
  for (const [data, ids] of Object.entries(porData)) {
    if (!carga.has(data) || !Array.isArray(ids)) return null
    for (const id of ids) {
      const e = exs.find(x => x.id === id)
      if (!e || usados.has(id)) return null
      usados.add(id); carga.get(data)!.push(e)
    }
  }
  if (usados.size !== exs.length) return null
  // mantém a ordem original do treino dentro de cada sessão
  carga.forEach((l, k) => carga.set(k, [...l].sort((a, b) => exs.indexOf(a) - exs.indexOf(b))))
  return montarDivisao(p, perdido, hoje, semanas, slots, carga, 'ia', explicacao)
}

/** Dias entre duas datas AAAA-MM-DD. */
const diasEntre = (a: string, b: string) => Math.round((paraData(b).getTime() - paraData(a).getTime()) / 86_400_000)

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

/** Encaixa o treino perdido inteiro num dia livre desta semana. */
export const encaixar = (p: PlanoTreino, perdido: Agendado, data: string, hoje: string): PlanoTreino =>
  ({ ...p, encaixes: [...(p.encaixes ?? []), { data, letra: perdido.letra, origem: perdido.data, ate: fimSemana(hoje) }] })

/** Desfaz o ajuste de um treino perdido (tira os exercícios divididos e o encaixe). */
export const desfazerAjuste = (p: PlanoTreino, origem: string): PlanoTreino => ({
  ...p,
  dias: p.dias.map(d => ({ ...d, exercicios: d.exercicios.filter(e => e.origemTemp !== origem) })),
  encaixes: (p.encaixes ?? []).filter(e => e.origem !== origem),
  extras: (p.extras ?? []).filter(e => e.origem !== origem),
})

export interface Ajuste { origem: string; letra: string; tipo: 'dividido' | 'encaixado'; data?: string; ate: string; diaIdx: number }

/** Ajustes ainda valendo (desta semana ou da próxima), para mostrar "Semana ajustada · desfazer". */
export function ajustesDaSemana(p: PlanoTreino, hoje: string): Ajuste[] {
  const letraDa = (origem: string) => agendaDasSemanas(p, somar(hoje, -7), 2).find(a => a.data === origem)?.letra ?? ''
  const div = new Map<string, Ajuste>()
  const somarDiv = (origem: string, letra: string, ate: string) => {
    const a = div.get(origem)
    div.set(origem, { origem, letra: a?.letra || letra, tipo: 'dividido', ate: a && a.ate > ate ? a.ate : ate, diaIdx: p.dias.findIndex(d => d.letra === (a?.letra || letra)) })
  }
  p.dias.forEach(d => d.exercicios.forEach(e => { if (e.origemTemp && e.temporarioAte && e.temporarioAte >= hoje) somarDiv(e.origemTemp, letraDa(e.origemTemp), e.temporarioAte) }))
  ;(p.extras ?? []).forEach(x => { if (x.ate >= hoje) somarDiv(x.origem, x.letraOrigem || letraDa(x.origem), x.ate) })
  const encaixados = (p.encaixes ?? []).filter(e => e.ate >= hoje)
    .map(e => ({ origem: e.origem, letra: e.letra, tipo: 'encaixado' as const, data: e.data, ate: e.ate, diaIdx: p.dias.findIndex(d => d.letra === e.letra) }))
  return [...div.values(), ...encaixados].sort((a, b) => a.origem.localeCompare(b.origem))
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
