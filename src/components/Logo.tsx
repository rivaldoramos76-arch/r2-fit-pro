export function Logo({ tamanho = 'md' }: { tamanho?: 'sm' | 'md' | 'lg' }) {
  const caixa = { sm: 'w-8 h-8 rounded-xl', md: 'w-10 h-10 rounded-xl', lg: 'w-14 h-14 rounded-2xl' }[tamanho]
  const icone = { sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-8 h-8' }[tamanho]
  return (
    <div className={`${caixa} bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/20`}>
      <svg className={`${icone} text-zinc-950`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
  )
}
