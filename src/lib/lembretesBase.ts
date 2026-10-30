// Lembretes: tipos, horários sugeridos e regras da tela. Sem dependências de runtime; testado em tests/metas.test.ts.

export type TipoLembrete = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'agua' | 'treino' | 'peso'

export interface Lembrete {
  id?: string
  tipo: TipoLembrete
  /** HH:MM */
  horario: string
  /** 0 = domingo … 6 = sábado */
  dias: number[]
  ativo: boolean
}

export const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6]
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const REFEICOES: { tipo: TipoLembrete; nome: string }[] = [
  { tipo: 'cafe', nome: 'Café da manhã' }, { tipo: 'almoco', nome: 'Almoço' },
  { tipo: 'lanche', nome: 'Lanche' }, { tipo: 'jantar', nome: 'Jantar' },
]
export const MAX_AGUA = 8

const PADROES: Lembrete[] = [
  { tipo: 'cafe', horario: '07:30', dias: TODOS_OS_DIAS, ativo: false },
  { tipo: 'almoco', horario: '12:00', dias: TODOS_OS_DIAS, ativo: false },
  { tipo: 'lanche', horario: '16:00', dias: TODOS_OS_DIAS, ativo: false },
  { tipo: 'jantar', horario: '19:30', dias: TODOS_OS_DIAS, ativo: false },
  { tipo: 'agua', horario: '10:00', dias: TODOS_OS_DIAS, ativo: false },
  { tipo: 'agua', horario: '14:00', dias: TODOS_OS_DIAS, ativo: false },
  { tipo: 'agua', horario: '17:00', dias: TODOS_OS_DIAS, ativo: false },
  { tipo: 'treino', horario: '18:00', dias: [1, 2, 3, 4, 5], ativo: false },
  { tipo: 'peso', horario: '07:00', dias: [1], ativo: false },
]

/** Lembretes salvos + os sugeridos (desligados) para os tipos que a pessoa ainda não configurou. */
export function comPadroes(salvos: Lembrete[]): Lembrete[] {
  const tem = new Set(salvos.map(l => l.tipo))
  const faltando = PADROES.filter(p => !tem.has(p.tipo)).map(p => ({ ...p, dias: [...p.dias] }))
  return [...salvos, ...faltando].sort((a, b) => ordem(a) - ordem(b) || a.horario.localeCompare(b.horario))
}

const ORDEM: TipoLembrete[] = ['cafe', 'almoco', 'lanche', 'jantar', 'agua', 'treino', 'peso']
const ordem = (l: Lembrete) => ORDEM.indexOf(l.tipo)

/** Próximo horário de água sugerido: 2 h depois do último (ou 10:00). */
export function proximoHorarioAgua(lista: Lembrete[]): string {
  const ultimos = lista.filter(l => l.tipo === 'agua').map(l => l.horario).sort()
  const ultimo = ultimos[ultimos.length - 1]
  if (!ultimo) return '10:00'
  const [h, m] = ultimo.split(':').map(Number)
  return `${String(Math.min(h + 2, 22)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Texto curto dos dias: "todos os dias", "seg a sex", "seg, qua, sex". */
export function resumoDias(dias: number[]): string {
  const d = [...new Set(dias)].sort()
  if (d.length === 7) return 'todos os dias'
  if (d.join() === '1,2,3,4,5') return 'seg a sex'
  if (d.join() === '0,6') return 'fins de semana'
  return d.map(i => DIAS_CURTOS[i]).join(', ')
}

/** Lembrete pronto para gravar (horário HH:MM válido, dias únicos e ordenados). */
export function normalizarLembrete(l: Lembrete): Lembrete | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(l.horario)) return null
  const dias = [...new Set(l.dias)].filter(d => d >= 0 && d <= 6).sort()
  if (!dias.length) return null
  return { ...l, dias }
}
