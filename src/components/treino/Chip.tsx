import type { ReactNode } from 'react'

export function Chip({ ativo, onClick, children, pequeno = false }: {
  ativo: boolean
  onClick: () => void
  children: ReactNode
  pequeno?: boolean
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`rounded-xl border font-medium transition active:scale-95 ${pequeno ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'} ${
        ativo
          ? 'bg-green-500/15 border-green-500/60 text-green-300'
          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}>
      {ativo && !pequeno && <span className="mr-1">✓</span>}
      {children}
    </button>
  )
}

export function Rotulo({ children, extra }: { children: ReactNode; extra?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{children}</p>
      {extra && <span className="text-[11px] text-zinc-600">{extra}</span>}
    </div>
  )
}
