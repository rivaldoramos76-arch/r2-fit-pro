// Lógica pura dos lembretes por notificação (sem dependências de runtime; testada em tests/comercial.test.ts).

export type TipoLembrete = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'agua' | 'treino' | 'peso'

export interface MensagemPush { titulo: string; corpo: string; url: string; tag: string }

const MENSAGENS: Record<TipoLembrete, Omit<MensagemPush, 'tag'>> = {
  cafe: { titulo: 'Bom dia! ☀️', corpo: 'Já tomou café? Registre no diário para manter a meta em dia.', url: '/calorias' },
  almoco: { titulo: 'Hora do almoço 🍽️', corpo: 'Registre o que você vai comer e veja quanto falta para a meta.', url: '/calorias' },
  lanche: { titulo: 'Hora do lanche 🍎', corpo: 'Não esqueça de registrar o lanche no diário.', url: '/calorias' },
  jantar: { titulo: 'Hora do jantar 🌙', corpo: 'Registre o jantar e feche o dia dentro da meta.', url: '/calorias' },
  agua: { titulo: 'Beba água 💧', corpo: 'Um copo agora ajuda a bater a meta de hoje.', url: '/calorias' },
  treino: { titulo: 'Hora do treino 💪', corpo: 'Seu treino de hoje está esperando. Bora?', url: '/treino' },
  peso: { titulo: 'Dia de pesar ⚖️', corpo: 'Registre seu peso para acompanhar a evolução no gráfico.', url: '/peso' },
}

export function mensagemLembrete(tipo: string): MensagemPush | null {
  const m = MENSAGENS[tipo as TipoLembrete]
  return m ? { ...m, tag: `r2-${tipo}` } : null
}

/** Valida a inscrição enviada pelo navegador (PushSubscription.toJSON()). */
export function lerInscricao(corpo: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  // deno-lint-ignore no-explicit-any
  const c = corpo as any
  const endpoint = typeof c?.endpoint === 'string' ? c.endpoint : ''
  const p256dh = typeof c?.keys?.p256dh === 'string' ? c.keys.p256dh : ''
  const auth = typeof c?.keys?.auth === 'string' ? c.keys.auth : ''
  if (!/^https:\/\/[^\s]{8,990}$/.test(endpoint)) return null
  if (!/^[\w-]{20,200}$/.test(p256dh) || !/^[\w-]{8,100}$/.test(auth)) return null
  return { endpoint, p256dh, auth }
}
