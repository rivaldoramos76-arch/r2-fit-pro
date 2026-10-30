// Lógica pura do acompanhamento com personal (testada em tests/metas.test.ts).

export interface AlunoResumo {
  id: string
  aluno_id: string
  nome: string
  desde: string
  ver_treinos: boolean
  ver_diario: boolean
  ver_peso: boolean
  editar_planos: boolean
  ultimo_treino: string | null
  treinos_7d: number | null
  dias_diario_7d: number | null
  kcal_hoje: number | null
  meta_kcal: number | null
  peso: { data: string; peso_kg: number } | null
  nao_lidas: number
}

export interface Alerta { tipo: 'treino' | 'diario' | 'meta'; texto: string; grave: boolean }

const DIA = 86400000

/** Dias inteiros desde uma data (ISO), ou null se nunca. */
export function diasDesde(iso: string | null | undefined, agora = new Date()): number | null {
  if (!iso) return null
  return Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / DIA))
}

/** Alertas do aluno para a lista do personal: sem treinar, sem registrar o diário, passando da meta. */
export function alertasAluno(a: AlunoResumo, agora = new Date()): Alerta[] {
  const r: Alerta[] = []
  // Aluno novo (menos de 3 dias) ainda não recebe alerta de inatividade
  const novo = (diasDesde(a.desde, agora) ?? 0) < 3
  if (a.ver_treinos && !novo) {
    const d = diasDesde(a.ultimo_treino, agora)
    if (d === null) r.push({ tipo: 'treino', texto: 'Ainda não concluiu nenhum treino', grave: true })
    else if (d >= 4) r.push({ tipo: 'treino', texto: `Não treina há ${d} dias`, grave: d >= 7 })
  }
  if (a.ver_diario && !novo && (a.dias_diario_7d ?? 0) <= 2) {
    r.push({ tipo: 'diario', texto: a.dias_diario_7d ? `Registrou o diário só ${a.dias_diario_7d} dia(s) na semana` : 'Não registra o diário há uma semana', grave: !a.dias_diario_7d })
  }
  if (a.ver_diario && a.meta_kcal && (a.kcal_hoje ?? 0) > a.meta_kcal * 1.15) {
    r.push({ tipo: 'meta', texto: `Passou ${Math.round((a.kcal_hoje ?? 0) - a.meta_kcal)} kcal da meta hoje`, grave: false })
  }
  return r
}

/** Ordem da lista: mensagens novas primeiro, depois quem tem alerta grave, depois o resto por nome. */
export function ordenarAlunos(lista: AlunoResumo[], agora = new Date()): AlunoResumo[] {
  const peso = (a: AlunoResumo) => (a.nao_lidas > 0 ? 0 : alertasAluno(a, agora).some(x => x.grave) ? 1 : alertasAluno(a, agora).length ? 2 : 3)
  return [...lista].sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Normaliza o código digitado: maiúsculas, sem espaços e sem caracteres que não existem nos códigos. */
export function normalizarCodigo(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

/** Link de convite que o personal compartilha. */
export const linkConvite = (site: string, codigo: string) => `${site.replace(/\/$/, '')}/convite/${codigo}`

/** Hora curta de uma mensagem: "14:05" hoje, "ontem 14:05" ou "12/10 14:05". */
export function horaMensagem(iso: string, agora = new Date()): string {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const mesmoDia = (x: Date, y: Date) => x.toDateString() === y.toDateString()
  if (mesmoDia(d, agora)) return hora
  if (mesmoDia(d, new Date(agora.getTime() - DIA))) return `ontem ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}
