export function Logo({ tamanho = 'md' }: { tamanho?: 'sm' | 'md' | 'lg' }) {
  const caixa = { sm: 'w-8 h-8 rounded-xl', md: 'w-10 h-10 rounded-xl', lg: 'w-14 h-14 rounded-2xl' }[tamanho]
  return (
    <div className={`${caixa} bg-zinc-950 border border-zinc-800 flex items-center justify-center shadow-lg shadow-green-500/10 overflow-hidden`}>
      <svg className="w-full h-full" viewBox="0 0 512 512" aria-hidden="true">
        <defs><linearGradient id="r2-logo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bef264" /><stop offset="1" stopColor="#16a34a" /></linearGradient></defs>
        <circle cx="256" cy="256" r="168" fill="none" stroke="url(#r2-logo-g)" strokeWidth="30" />
        <path transform="translate(186 118) scale(6.4)" d="M13 10V3L4 14h7v7l9-11h-7z" fill="url(#r2-logo-g)" />
        <text x="256" y="356" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="92" fill="url(#r2-logo-g)" letterSpacing="-2">R2</text>
      </svg>
    </div>
  )
}
