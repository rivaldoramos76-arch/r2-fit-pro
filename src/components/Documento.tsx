import type { ReactNode } from 'react'

export function Documento({ titulo, versao, children }: { titulo: string; versao?: string; children: ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold">{titulo}</h1>
      {versao && <p className="text-xs text-zinc-500 mt-2">Versão vigente: {versao}</p>}
      <div className="mt-6 flex flex-col gap-6 text-sm sm:text-[15px] leading-relaxed text-zinc-300">{children}</div>
    </article>
  )
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base sm:text-lg font-semibold text-zinc-100 mb-2">{titulo}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}
