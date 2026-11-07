// Bonequinho de traço mostrando a execução do exercício (vista de lado), animado em loop.
// Cada movimento é um conjunto de poses (posição das articulações); a animação vai e volta entre elas.
// Desenhado no próprio app (SVG): nítido em qualquer tela, leve e funciona sem internet.

type P = [number, number]
interface Pose {
  cabeca: P; pescoco: P; quadril: P
  ombro: P; cotovelo: P; mao: P
  joelho: P; pe: P
  /** peso (anilha/halter) — opcional, segue a mão por padrão */
  peso?: P
}
interface Movimento {
  rotulo: string
  poses: Pose[] // ida (a volta é o caminho de volta)
  segundos: number
  peso?: 'barra' | 'halter'
  cenario?: 'banco'
}

const SUPINO: Movimento = {
  rotulo: 'Supino', segundos: 2.6, peso: 'barra', cenario: 'banco',
  poses: [
    { cabeca: [24, 55], pescoco: [31, 58], quadril: [74, 58], ombro: [35, 58], cotovelo: [36, 43], mao: [36, 28], joelho: [90, 64], pe: [92, 90] },
    { cabeca: [24, 55], pescoco: [31, 58], quadril: [74, 58], ombro: [35, 58], cotovelo: [46, 64], mao: [39, 50], joelho: [90, 64], pe: [92, 90] },
  ],
}
const AGACHAMENTO: Movimento = {
  rotulo: 'Agachamento', segundos: 2.8, peso: 'barra',
  poses: [
    { cabeca: [61, 12], pescoco: [60, 20], quadril: [58, 52], ombro: [60, 24], cotovelo: [50, 31], mao: [53, 24], joelho: [60, 72], pe: [58, 91], peso: [53, 25] },
    { cabeca: [72, 33], pescoco: [68, 40], quadril: [42, 63], ombro: [66, 43], cotovelo: [56, 50], mao: [59, 43], joelho: [68, 70], pe: [58, 91], peso: [59, 44] },
  ],
}
const ROSCA: Movimento = {
  rotulo: 'Rosca', segundos: 2.4, peso: 'barra',
  poses: [
    { cabeca: [60, 12], pescoco: [60, 20], quadril: [59, 52], ombro: [61, 24], cotovelo: [63, 39], mao: [67, 53], joelho: [60, 72], pe: [59, 91] },
    { cabeca: [60, 12], pescoco: [60, 20], quadril: [59, 52], ombro: [61, 24], cotovelo: [63, 39], mao: [74, 28], joelho: [60, 72], pe: [59, 91] },
  ],
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Qual movimento mostrar para um exercício (protótipo: supino reto, agachamento e rosca direta). */
export function movimentoDe(nome: string): Movimento | null {
  const n = sem(nome)
  if (/supino reto/.test(n)) return SUPINO
  if (/^agachamento (livre|com barra)|^agachamento$/.test(n)) return AGACHAMENTO
  if (/^rosca direta/.test(n)) return ROSCA
  return null
}

/** Valores do <animate>: ida e volta pelas poses, com uma pausa curta em cada ponta. */
function valores(ps: number[]): { values: string; keyTimes: string } {
  const ida = ps, volta = [...ps].reverse().slice(1)
  const seq = [...ida, ida[ida.length - 1], ...volta, volta.length ? volta[volta.length - 1] : ida[0]]
  const n = seq.length - 1
  return { values: seq.join(';'), keyTimes: seq.map((_, i) => (i / n).toFixed(3)).join(';') }
}

export default function AnimacaoExercicio({ nome, className = '' }: { nome: string; className?: string }) {
  const m = movimentoDe(nome)
  if (!m) return null
  const dur = `${m.segundos}s`
  const a = (get: (p: Pose) => number) => {
    const { values, keyTimes } = valores(m.poses.map(get))
    return { values, keyTimes, dur, repeatCount: 'indefinite', calcMode: 'linear' as const }
  }
  const p0 = m.poses[0]
  const linha = (de: keyof Pose, ate: keyof Pose, extra = '') => (
    <line x1={(p0[de] as P)[0]} y1={(p0[de] as P)[1]} x2={(p0[ate] as P)[0]} y2={(p0[ate] as P)[1]} className={extra}>
      <animate attributeName="x1" {...a(p => (p[de] as P)[0])} />
      <animate attributeName="y1" {...a(p => (p[de] as P)[1])} />
      <animate attributeName="x2" {...a(p => (p[ate] as P)[0])} />
      <animate attributeName="y2" {...a(p => (p[ate] as P)[1])} />
    </line>
  )
  const pesoDe = (p: Pose) => p.peso ?? p.mao
  // Enquadra o movimento (todas as poses + banco + chão) para o bonequinho ocupar o quadro
  const xs = m.poses.flatMap(p => [p.cabeca[0] - 7, p.cabeca[0] + 7, p.quadril[0], p.joelho[0], p.pe[0] + 8, p.mao[0], p.cotovelo[0], pesoDe(p)[0] - 8, pesoDe(p)[0] + 8])
  if (m.cenario === 'banco') xs.push(18, 82)
  const ys = m.poses.flatMap(p => [p.cabeca[1] - 7, pesoDe(p)[1] - 8, p.mao[1]])
  const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, y0 = Math.min(...ys) - 4, y1 = 95
  const larg = Math.max(x1 - x0, (y1 - y0) * 1.4) // proporção do quadro (mais largo que alto)
  const cx = (x0 + x1) / 2
  const vb = `${(cx - larg / 2).toFixed(1)} ${y0.toFixed(1)} ${larg.toFixed(1)} ${(y1 - y0).toFixed(1)}`
  return (
    <svg viewBox={vb} role="img" aria-label={`Execução: ${m.rotulo}`} className={className}>
      {/* chão e banco */}
      <line x1="-40" y1="92.5" x2="160" y2="92.5" className="stroke-zinc-700" strokeWidth="1.5" />
      {m.cenario === 'banco' && (
        <g className="stroke-zinc-600" strokeWidth="2.5" strokeLinecap="round">
          <line x1="20" y1="64" x2="80" y2="64" />
          <line x1="28" y1="64" x2="28" y2="92" />
          <line x1="72" y1="64" x2="72" y2="92" />
        </g>
      )}
      <g className="stroke-zinc-200" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {linha('pescoco', 'quadril')}
        {linha('quadril', 'joelho')}
        {linha('joelho', 'pe')}
        <line x1={p0.pe[0]} y1={p0.pe[1]} x2={p0.pe[0] + 7} y2={p0.pe[1]}>
          <animate attributeName="x1" {...a(p => p.pe[0])} />
          <animate attributeName="x2" {...a(p => p.pe[0] + 7)} />
        </line>
        {linha('ombro', 'cotovelo')}
        {linha('cotovelo', 'mao')}
        <circle r="6" cx={p0.cabeca[0]} cy={p0.cabeca[1]} className="fill-zinc-950">
          <animate attributeName="cx" {...a(p => p.cabeca[0])} />
          <animate attributeName="cy" {...a(p => p.cabeca[1])} />
        </circle>
      </g>
      {m.peso && (
        <circle r={m.peso === 'barra' ? 6.5 : 4} cx={pesoDe(p0)[0]} cy={pesoDe(p0)[1]} className="fill-green-500/25 stroke-green-400" strokeWidth="2">
          <animate attributeName="cx" {...a(p => pesoDe(p)[0])} />
          <animate attributeName="cy" {...a(p => pesoDe(p)[1])} />
        </circle>
      )}
    </svg>
  )
}
