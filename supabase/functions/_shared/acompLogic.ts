// Lógica pura dos avisos do acompanhamento com personal (testada em tests/comercial.test.ts).
import type { MensagemPush } from './lembretesLogic.ts'

const TITULOS: Record<string, string> = {
  treino: 'Novo treino do seu personal 💪',
  dieta: 'Nova dieta do seu personal 🥗',
  meta: 'Sua meta diária foi ajustada 🎯',
}

/** Notificação de uma mensagem do acompanhamento para quem a recebe. */
export function mensagemAcomp(m: {
  id: string; tipo: string; texto: string; autorNome: string; paraPersonal: boolean; alunoId: string; refId?: string | null
}): MensagemPush {
  const corpo = m.texto.length > 140 ? `${m.texto.slice(0, 139)}…` : m.texto
  if (m.paraPersonal) {
    return { titulo: m.autorNome, corpo, url: `/alunos/${m.alunoId}`, tag: `r2-acomp-${m.alunoId}` }
  }
  const url = m.tipo === 'treino' && m.refId ? `/treino/${m.refId}` : m.tipo === 'dieta' && m.refId ? `/dieta/${m.refId}` : m.tipo === 'meta' ? '/meta' : '/personal'
  return { titulo: TITULOS[m.tipo] ?? `${m.autorNome} (seu personal)`, corpo, url, tag: `r2-acomp-${m.id}` }
}
