import { useEffect, useState } from 'react'

const semAnimacao = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Número que sobe até o valor (efeito de contagem). */
export function useContagem(valor: number, duracao = 900) {
  const [atual, setAtual] = useState(semAnimacao() ? valor : 0)
  useEffect(() => {
    if (semAnimacao()) { setAtual(valor); return }
    let raf = 0
    const inicio = performance.now()
    const de = 0
    const passo = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracao)
      const suave = 1 - Math.pow(1 - p, 3)
      setAtual(Math.round(de + (valor - de) * suave))
      if (p < 1) raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [valor, duracao])
  return atual
}

/** Liga a animação depois da primeira pintura (para as transições CSS partirem do zero). */
function useMontado() {
  const [m, setM] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(r) }, [])
  return m
}

export const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR')

/** Anel de calorias: preenche conforme o consumido; mostra o restante no centro. */
export function AnelCalorias({ meta, consumido, tamanho = 168 }: { meta: number; consumido: number; tamanho?: number }) {
  const montado = useMontado()
  const restante = meta - consumido
  const passou = restante < 0
  const exibido = useContagem(Math.abs(restante))
  const traco = 12
  const r = (tamanho - traco) / 2
  const circ = 2 * Math.PI * r
  const prog = meta > 0 ? Math.min(1, consumido / meta) : 0
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}
      role="img" aria-label={passou ? `${fmt(-restante)} kcal acima da meta` : `${fmt(restante)} kcal restantes`}>
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="currentColor" strokeWidth={traco} className="text-zinc-800" />
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={traco} strokeLinecap="round"
          stroke={passou ? '#f59e0b' : 'url(#anel-verde)'} strokeDasharray={circ}
          strokeDashoffset={montado ? circ * (1 - prog) : circ} className="anel-progresso" />
        <defs>
          <linearGradient id="anel-verde" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4ade80" /><stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`text-3xl font-bold tabular-nums tracking-tight ${passou ? 'text-amber-400' : 'text-zinc-50'}`}>{fmt(exibido)}</span>
        <span className="text-xs text-zinc-400 mt-0.5">{passou ? 'acima da meta' : 'Restante'}</span>
      </div>
    </div>
  )
}

export const CORES_MACRO = {
  carboidrato: { barra: 'bg-lime-400', texto: 'text-lime-400' },
  proteina: { barra: 'bg-emerald-400', texto: 'text-emerald-400' },
  gordura: { barra: 'bg-amber-400', texto: 'text-amber-400' },
}

/** Barra de um macronutriente (atual / meta em gramas). */
export function BarraMacro({ rotulo, atual, meta, cor }: { rotulo: string; atual: number; meta: number; cor: keyof typeof CORES_MACRO }) {
  const montado = useMontado()
  const prog = meta > 0 ? Math.min(1, atual / meta) : 0
  return (
    <div className="flex-1 min-w-0">
      <p className={`text-xs font-semibold ${CORES_MACRO[cor].texto}`}>{rotulo}</p>
      <div className="h-1.5 rounded-full bg-zinc-800 mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full barra-progresso ${CORES_MACRO[cor].barra}`} style={{ width: `${montado ? prog * 100 : 0}%` }} />
      </div>
      <p className="text-xs text-zinc-400 mt-1.5 tabular-nums"><span className="text-zinc-200 font-semibold">{fmt(atual)}</span> / {fmt(meta)} g</p>
    </div>
  )
}
