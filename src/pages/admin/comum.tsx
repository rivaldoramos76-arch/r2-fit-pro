import type { ReactNode } from 'react'

export function Tabela({ cabecalho, children, vazio }: { cabecalho: string[]; children: ReactNode; vazio?: boolean }) {
  return (
    <div className="overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-2xl">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-zinc-400 border-b border-zinc-800">{cabecalho.map(c => <th key={c} className="px-3 py-2.5 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-zinc-800">{children}</tbody>
      </table>
      {vazio && <p className="text-center text-zinc-500 text-sm py-8">Nenhum registro.</p>}
    </div>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>
}

export function Erro({ texto }: { texto: string }) {
  return texto ? <p role="alert" className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{texto}</p> : null
}

export const msgErro = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: string }).message) : 'Erro inesperado')
