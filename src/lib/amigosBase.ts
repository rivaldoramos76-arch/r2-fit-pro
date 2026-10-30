// Lógica pura dos amigos (testada em tests/metas.test.ts).

export interface LinhaRanking { user_id: string; nome: string; eu: boolean; treinos: number; dias_diario: number }

/** Posições do ranking com empate (mesmos treinos e dias = mesma posição) e medalha dos 3 primeiros. */
export function posicoesRanking(linhas: LinhaRanking[]): (LinhaRanking & { posicao: number; medalha: string | null })[] {
  const ord = [...linhas].sort((a, b) => b.treinos - a.treinos || b.dias_diario - a.dias_diario || a.nome.localeCompare(b.nome, 'pt-BR'))
  let pos = 0
  return ord.map((l, i) => {
    const ant = ord[i - 1]
    if (!ant || ant.treinos !== l.treinos || ant.dias_diario !== l.dias_diario) pos = i + 1
    const zerado = l.treinos === 0 && l.dias_diario === 0
    return { ...l, posicao: pos, medalha: zerado ? null : pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null }
  })
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias". */
export function tempoRelativo(iso: string, agora = new Date()): string {
  const min = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ontem' : `há ${d} dias`
}

/** Texto de quem curtiu: "Bia", "Bia e Caio", "Bia, Caio e mais 3". */
export function textoCurtidas(nomes: string[] | null, total: number): string {
  const n = nomes ?? []
  if (!total) return ''
  if (total === 1) return n[0] ?? '1 pessoa'
  if (total === 2 && n.length >= 2) return `${n[0]} e ${n[1]}`
  return n.length >= 2 ? `${n[0]}, ${n[1]} e mais ${total - 2}` : `${total} pessoas`
}
