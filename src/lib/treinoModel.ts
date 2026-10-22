// Modelo de dados único para planos criados com IA ou montados manualmente.
// O plano é salvo na coluna JSONB `treinos.plano`. Planos antigos (sem `versao`)
// são convertidos em tempo de leitura por `normalizarPlano`, sem perda de dados.
import type { Equipamento, GrupoMuscular } from '../data/exercicios'
import { GRUPOS } from '../data/exercicios'

export const OBJETIVOS = ['Hipertrofia', 'Força', 'Resistência muscular', 'Condicionamento físico', 'Emagrecimento'] as const
export const NIVEIS = ['Iniciante', 'Intermediário', 'Avançado'] as const
export const LOCAIS = ['Academia completa', 'Academia básica', 'Treino em casa'] as const

export interface OpcaoEquipamento { id: string; label: string; cobre: Equipamento[] }
export const OPCOES_EQUIPAMENTO: OpcaoEquipamento[] = [
  { id: 'pesos_livres', label: 'Pesos livres', cobre: ['barra', 'barra_w', 'halteres', 'anilha', 'kettlebell'] },
  { id: 'halteres', label: 'Halteres', cobre: ['halteres'] },
  { id: 'barras', label: 'Barras', cobre: ['barra', 'barra_w'] },
  { id: 'maquinas', label: 'Máquinas', cobre: ['maquina'] },
  { id: 'smith', label: 'Smith', cobre: ['smith'] },
  { id: 'cabos', label: 'Cabos e polias', cobre: ['cabo'] },
  { id: 'elasticos', label: 'Elásticos', cobre: ['elastico'] },
  { id: 'peso_corporal', label: 'Peso corporal', cobre: ['peso_corporal'] },
  { id: 'kettlebell', label: 'Kettlebell', cobre: ['kettlebell'] },
  { id: 'anilhas', label: 'Anilhas', cobre: ['anilha'] },
  { id: 'barra_fixa', label: 'Barra fixa e paralelas', cobre: ['barra_fixa'] },
]

export const EQUIP_POR_LOCAL: Record<string, string[]> = {
  'Academia completa': OPCOES_EQUIPAMENTO.map(o => o.id),
  'Academia básica': ['pesos_livres', 'halteres', 'barras', 'maquinas', 'cabos', 'peso_corporal', 'anilhas', 'barra_fixa'],
  'Treino em casa': ['halteres', 'elasticos', 'peso_corporal'],
}

export function equipamentosCobertos(ids: string[]): Equipamento[] {
  const s = new Set<Equipamento>()
  for (const id of ids) OPCOES_EQUIPAMENTO.find(o => o.id === id)?.cobre.forEach(e => s.add(e))
  return [...s]
}

export interface ConfigTreino {
  objetivo: string
  frequencia: number
  duracao: number
  nivel: string
  local: string
  equipamentos: string[]
  grupos: GrupoMuscular[]
  restricoes: string
}

export const CONFIG_PADRAO: ConfigTreino = {
  objetivo: 'Hipertrofia', frequencia: 4, duracao: 60, nivel: 'Intermediário',
  local: 'Academia completa', equipamentos: EQUIP_POR_LOCAL['Academia completa'], grupos: [], restricoes: '',
}

export interface ExercicioPlano {
  id: string
  catalogo_id?: string
  nome: string
  grupos_musculares: string[]
  equipamento?: string
  series: number
  repeticoes: string
  carga?: string
  tempo_execucao_segundos: number
  tempo_descanso_segundos: number
  instrucoes?: string
  dica?: string
}

export interface DiaTreino {
  id: string
  letra: string
  dia: string // título exibido, ex.: "Treino A"
  foco: string
  grupos: GrupoMuscular[]
  duracao_estimada_min: number
  exercicios: ExercicioPlano[]
}

export interface SlotAgenda { letra: string; diaSemana?: string }

export interface PlanoTreino {
  versao: 2
  nome: string
  objetivo: string
  nivel: string
  frequencia_semanal: number
  origem: 'ia' | 'manual'
  divisao: string
  agenda: SlotAgenda[]
  config: ConfigTreino
  dias: DiaTreino[]
  observacoes: string[]
}

export const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
export const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

export function uid(prefixo = ''): string {
  return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// --- Divisões ---

export interface TreinoDivisao { foco: string; grupos: GrupoMuscular[] }

const MODELOS: Record<number, TreinoDivisao[]> = {
  1: [{ foco: 'Corpo inteiro', grupos: ['peito', 'costas', 'ombros', 'quadriceps', 'posteriores', 'gluteos', 'abdomen'] }],
  2: [
    { foco: 'Superiores', grupos: ['peito', 'costas', 'ombros', 'biceps', 'triceps'] },
    { foco: 'Inferiores e abdômen', grupos: ['quadriceps', 'posteriores', 'gluteos', 'panturrilhas', 'abdomen'] },
  ],
  3: [
    { foco: 'Peito, ombros e tríceps', grupos: ['peito', 'ombros', 'triceps'] },
    { foco: 'Costas e bíceps', grupos: ['costas', 'biceps', 'trapezio', 'antebracos'] },
    { foco: 'Pernas e abdômen', grupos: ['quadriceps', 'posteriores', 'gluteos', 'panturrilhas', 'abdomen'] },
  ],
  4: [
    { foco: 'Peito e tríceps', grupos: ['peito', 'triceps'] },
    { foco: 'Costas e bíceps', grupos: ['costas', 'biceps', 'antebracos'] },
    { foco: 'Pernas completas', grupos: ['quadriceps', 'posteriores', 'gluteos', 'panturrilhas'] },
    { foco: 'Ombros, trapézio e abdômen', grupos: ['ombros', 'trapezio', 'abdomen'] },
  ],
  5: [
    { foco: 'Peito', grupos: ['peito'] },
    { foco: 'Costas', grupos: ['costas', 'trapezio'] },
    { foco: 'Ombros e abdômen', grupos: ['ombros', 'abdomen'] },
    { foco: 'Braços', grupos: ['biceps', 'triceps', 'antebracos'] },
    { foco: 'Pernas', grupos: ['quadriceps', 'posteriores', 'gluteos', 'panturrilhas'] },
  ],
  6: [
    { foco: 'Peito', grupos: ['peito'] },
    { foco: 'Costas', grupos: ['costas', 'trapezio'] },
    { foco: 'Quadríceps e panturrilhas', grupos: ['quadriceps', 'panturrilhas'] },
    { foco: 'Ombros e abdômen', grupos: ['ombros', 'abdomen'] },
    { foco: 'Braços', grupos: ['biceps', 'triceps', 'antebracos'] },
    { foco: 'Posteriores e glúteos', grupos: ['posteriores', 'gluteos', 'adutores'] },
  ],
}

export function modeloDivisao(n: number): TreinoDivisao[] {
  return (MODELOS[n] ?? MODELOS[6]).map(t => ({ ...t, grupos: [...t.grupos] }))
}

export function nomeDivisao(n: number): string {
  return LETRAS.slice(0, n).join('')
}

export function divisaoSugerida(frequencia: number): number {
  return ({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 3, 7: 4 } as Record<number, number>)[frequencia] ?? 3
}

export interface OpcaoDivisao { n: number; nome: string; descricao: string; sugerida: boolean }

export function opcoesDivisao(frequencia: number): OpcaoDivisao[] {
  const max = Math.min(Math.max(frequencia, 1), 6)
  const sug = divisaoSugerida(frequencia)
  return Array.from({ length: max }, (_, i) => {
    const n = i + 1
    const seq = agendaPadrao(frequencia, n).map(s => s.letra).join(' ')
    return {
      n,
      nome: `Treino ${nomeDivisao(n)}`,
      descricao: n === 1
        ? `Um treino de corpo inteiro${frequencia > 1 ? `, repetido ${frequencia}x na semana` : ''}`
        : `${n} treinos diferentes · semana: ${seq}`,
      sugerida: n === sug,
    }
  })
}

export function agendaPadrao(frequencia: number, n: number): SlotAgenda[] {
  return Array.from({ length: frequencia }, (_, i) => ({ letra: LETRAS[i % n] }))
}

export function descreverGrupos(grupos: GrupoMuscular[]): string {
  return grupos.map(g => GRUPOS[g]).join(', ')
}

// --- Normalização ---

function num(v: unknown, padrao: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) && n > 0 ? n : padrao
}

function str(v: unknown, padrao = ''): string {
  return typeof v === 'string' ? v : v == null ? padrao : String(v)
}

const GRUPO_IDS = Object.keys(GRUPOS) as GrupoMuscular[]

export function normalizarExercicio(raw: Record<string, unknown>, idPadrao: string): ExercicioPlano {
  return {
    id: str(raw.id) || idPadrao,
    catalogo_id: raw.catalogo_id ? str(raw.catalogo_id) : undefined,
    nome: str(raw.nome, 'Exercício'),
    grupos_musculares: Array.isArray(raw.grupos_musculares) ? raw.grupos_musculares.map(g => str(g)) : [],
    equipamento: raw.equipamento ? str(raw.equipamento) : undefined,
    series: Math.round(num(raw.series, 3)),
    repeticoes: str(raw.repeticoes, '10-12') || '10-12',
    carga: raw.carga ? str(raw.carga) : undefined,
    tempo_execucao_segundos: Math.round(num(raw.tempo_execucao_segundos, 40)),
    tempo_descanso_segundos: Math.round(num(raw.tempo_descanso_segundos, 60)),
    instrucoes: raw.instrucoes ? str(raw.instrucoes) : undefined,
    dica: raw.dica ? str(raw.dica) : undefined,
  }
}

export function normalizarPlano(raw: unknown, fallback?: { objetivo?: string; nivel?: string; frequencia_semanal?: number; nome?: string }): PlanoTreino {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const diasRaw = Array.isArray(p.dias) ? (p.dias as Record<string, unknown>[]) : []
  const legado = p.versao !== 2

  const dias: DiaTreino[] = diasRaw.map((d, i) => {
    const id = str(d.id) || `d${i}`
    const letra = str(d.letra) || LETRAS[i] || String(i + 1)
    const exs = Array.isArray(d.exercicios) ? (d.exercicios as Record<string, unknown>[]) : []
    const grupos = Array.isArray(d.grupos) ? (d.grupos as string[]).filter((g): g is GrupoMuscular => GRUPO_IDS.includes(g as GrupoMuscular)) : []
    const foco = str(d.foco)
    return {
      id,
      letra,
      // planos antigos usavam "dia" com o dia da semana; o título passa a ser "Treino X"
      dia: legado ? `Treino ${letra}` : str(d.dia) || `Treino ${letra}`,
      foco: legado && str(d.dia) ? `${foco}${foco ? ' · ' : ''}${str(d.dia)}` : foco,
      grupos,
      duracao_estimada_min: Math.round(num(d.duracao_estimada_min, 60)),
      exercicios: exs.map((e, j) => normalizarExercicio(e, `${id}-e${j}`)),
    }
  })

  const cfgRaw = (p.config && typeof p.config === 'object' ? p.config : {}) as Partial<ConfigTreino>
  const frequencia = Math.round(num(p.frequencia_semanal ?? fallback?.frequencia_semanal, Math.max(dias.length, 1)))
  const config: ConfigTreino = {
    ...CONFIG_PADRAO,
    ...cfgRaw,
    objetivo: str(cfgRaw.objetivo ?? p.objetivo ?? fallback?.objetivo, CONFIG_PADRAO.objetivo),
    nivel: str(cfgRaw.nivel ?? p.nivel ?? fallback?.nivel, CONFIG_PADRAO.nivel),
    frequencia,
    equipamentos: Array.isArray(cfgRaw.equipamentos) ? cfgRaw.equipamentos : CONFIG_PADRAO.equipamentos,
    grupos: Array.isArray(cfgRaw.grupos) ? cfgRaw.grupos : [],
  }

  const agendaRaw = Array.isArray(p.agenda) ? (p.agenda as SlotAgenda[]) : []
  const letrasValidas = new Set(dias.map(d => d.letra))
  const agenda = agendaRaw.filter(s => s && letrasValidas.has(s.letra))

  return {
    versao: 2,
    nome: str(p.nome ?? fallback?.nome, 'Meu treino'),
    objetivo: config.objetivo,
    nivel: config.nivel,
    frequencia_semanal: frequencia,
    origem: p.origem === 'manual' ? 'manual' : 'ia',
    divisao: str(p.divisao) || dias.map(d => d.letra).join(''),
    agenda: agenda.length ? agenda : agendaPadrao(frequencia, Math.max(dias.length, 1)).filter(s => letrasValidas.has(s.letra)),
    config,
    dias,
    observacoes: Array.isArray(p.observacoes) ? (p.observacoes as unknown[]).map(o => str(o)) : [],
  }
}

/**
 * Reestrutura a divisão do plano preservando os exercícios dos treinos que
 * continuam existindo (casamento pela letra).
 */
export function aplicarDivisao(
  dias: DiaTreino[],
  treinos: TreinoDivisao[],
  duracao: number,
): DiaTreino[] {
  return treinos.map((t, i) => {
    const letra = LETRAS[i]
    const existente = dias.find(d => d.letra === letra)
    return {
      id: existente?.id ?? uid('d'),
      letra,
      dia: `Treino ${letra}`,
      foco: t.foco,
      grupos: t.grupos,
      duracao_estimada_min: existente?.duracao_estimada_min ?? duracao,
      exercicios: existente?.exercicios ?? [],
    }
  })
}

export function proximoTreino(plano: PlanoTreino, ultimoDiaConcluido: number | null): number {
  if (!plano.dias.length) return 0
  if (ultimoDiaConcluido == null) return 0
  const letraUlt = plano.dias[ultimoDiaConcluido]?.letra
  const seq = plano.agenda.length ? plano.agenda.map(s => s.letra) : plano.dias.map(d => d.letra)
  const pos = seq.indexOf(letraUlt ?? '')
  const prox = seq[(pos + 1) % seq.length]
  const idx = plano.dias.findIndex(d => d.letra === prox)
  return idx >= 0 ? idx : 0
}
