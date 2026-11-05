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

export interface CobrancaPendente { id: string; dueDate: string; value: number }

/** O que fazer com a assinatura Asaas do personal: ajustar o valor ao desconto atual
 *  ou, se ele está grátis, apagar as cobranças que vencem nos próximos 2 dias. */
export function acaoDescontoPersonal(o: { gratis: boolean; precoCentavos: number; valorAtual: number; pendentes: CobrancaPendente[]; hoje: string }) {
  if (o.gratis) {
    const limite = new Date(Date.parse(`${o.hoje}T12:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10)
    return { novoValor: null as number | null, apagar: o.pendentes.filter(p => p.dueDate <= limite).map(p => p.id) }
  }
  const alvo = Math.round(o.precoCentavos) / 100
  const pendenteDiferente = o.pendentes.some(p => Math.abs(p.value - alvo) >= 0.01)
  return { novoValor: Math.abs(alvo - o.valorAtual) >= 0.01 || pendenteDiferente ? alvo : null, apagar: [] as string[] }
}
