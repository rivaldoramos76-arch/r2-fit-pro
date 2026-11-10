// Cardio e HIIT para o treino: entram com séries (rounds), tempo de execução e descanso, e usam o mesmo contador
// da musculação. `met` (Compendium of Physical Activities) estima o gasto quando o treino vai para o diário.

export interface Cardio {
  id: string
  nome: string
  sinonimos: string
  met: number
  icone: string
  /** Rounds, segundos de execução e de descanso sugeridos */
  series: number
  exec: number
  desc: number
  dica: string
}

export const CARDIO: Cardio[] = [
  { id: 'cardio-boxe', nome: 'Boxe no saco', sinonimos: 'boxe|boxing|saco de pancada|luta', met: 8.5, icone: '🥊', series: 10, exec: 30, desc: 30, dica: 'Socos fortes e contínuos no tempo de execução; no descanso, solte os braços e respire.' },
  { id: 'cardio-sombra', nome: 'Boxe sombra (shadow boxing)', sinonimos: 'shadow|sombra|boxe sem saco', met: 6.0, icone: '🥊', series: 8, exec: 60, desc: 30, dica: 'Combinações no ar com base firme e guarda alta, girando o quadril em cada soco.' },
  { id: 'cardio-muay-thai', nome: 'Muay thai / kickboxing', sinonimos: 'muay thai|kickboxing|chute|luta', met: 10.0, icone: '🦵', series: 8, exec: 60, desc: 30, dica: 'Alterne socos, chutes e joelhadas mantendo a guarda.' },
  { id: 'cardio-hiit', nome: 'HIIT livre', sinonimos: 'hiit|intervalado|funcional', met: 8.0, icone: '🔥', series: 10, exec: 30, desc: 30, dica: 'Escolha um movimento e vá no máximo durante a execução; descanse de verdade no intervalo.' },
  { id: 'cardio-tabata', nome: 'Tabata', sinonimos: 'tabata|20 10|hiit', met: 8.0, icone: '🔥', series: 8, exec: 20, desc: 10, dica: '8 rounds de 20 s no máximo com 10 s de descanso (4 minutos).' },
  { id: 'cardio-burpee', nome: 'Burpee', sinonimos: 'burpee|hiit', met: 8.0, icone: '🔥', series: 8, exec: 30, desc: 30, dica: 'Agacha, mãos no chão, pés para trás, volta e salta. Mantenha o ritmo sem perder a forma.' },
  { id: 'cardio-polichinelo', nome: 'Polichinelo', sinonimos: 'polichinelo|jumping jack', met: 7.7, icone: '🤸', series: 6, exec: 45, desc: 15, dica: 'Abra e feche pernas e braços no mesmo ritmo, aterrissando na ponta dos pés.' },
  { id: 'cardio-escalador', nome: 'Escalador (mountain climber)', sinonimos: 'mountain climber|escalador|hiit', met: 8.0, icone: '🧗', series: 8, exec: 30, desc: 30, dica: 'Em prancha alta, traga os joelhos ao peito alternando, quadril estável.' },
  { id: 'cardio-corda', nome: 'Pular corda', sinonimos: 'corda|pular corda|jump rope', met: 10.0, icone: '🪢', series: 10, exec: 60, desc: 30, dica: 'Saltos baixos na ponta dos pés, girando a corda com os punhos.' },
  { id: 'cardio-corrida-tiro', nome: 'Corrida intervalada (tiros)', sinonimos: 'corrida|tiro|sprint|intervalado|esteira', met: 10.0, icone: '🏃', series: 8, exec: 60, desc: 60, dica: 'Corra forte na execução e caminhe ou trote leve no descanso.' },
  { id: 'cardio-corrida', nome: 'Corrida contínua', sinonimos: 'corrida|correr|esteira|rua', met: 9.8, icone: '🏃', series: 1, exec: 1200, desc: 0, dica: 'Ritmo em que dá para falar frases curtas.' },
  { id: 'cardio-caminhada', nome: 'Caminhada', sinonimos: 'caminhada|andar|esteira', met: 4.3, icone: '🚶', series: 1, exec: 1800, desc: 0, dica: 'Passo firme, braços acompanhando o movimento.' },
  { id: 'cardio-bike-hiit', nome: 'Bike intervalada', sinonimos: 'bike|bicicleta|spinning|ergométrica|intervalado', met: 8.5, icone: '🚴', series: 10, exec: 30, desc: 30, dica: 'Carga alta e giro rápido na execução; giro leve no descanso.' },
  { id: 'cardio-bike', nome: 'Bike / spinning contínuo', sinonimos: 'bike|bicicleta|spinning|ergométrica|pedal', met: 7.0, icone: '🚴', series: 1, exec: 1200, desc: 0, dica: 'Giro constante com carga moderada.' },
  { id: 'cardio-remo', nome: 'Remo ergômetro', sinonimos: 'remo|remada ergômetro|rowing', met: 7.0, icone: '🚣', series: 6, exec: 60, desc: 30, dica: 'Empurre com as pernas, depois puxe com as costas e os braços.' },
  { id: 'cardio-eliptico', nome: 'Elíptico', sinonimos: 'elíptico|transport', met: 5.0, icone: '⚙️', series: 1, exec: 1200, desc: 0, dica: 'Ritmo contínuo, use os braços junto.' },
  { id: 'cardio-escada', nome: 'Escada / simulador', sinonimos: 'escada|simulador de escada|stairs', met: 9.0, icone: '🪜', series: 1, exec: 900, desc: 0, dica: 'Tronco ereto, sem se apoiar no corrimão.' },
]

/** Busca simples por nome e sinônimos (sem acento, sem maiúsculas). */
export function buscarCardio(q: string): Cardio[] {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const termos = n(q).split(/\s+/).filter(Boolean)
  if (!termos.length) return CARDIO
  return CARDIO.filter(c => { const alvo = n(`${c.nome} ${c.sinonimos}`); return termos.every(t => alvo.includes(t)) })
}
