import { useEffect, useState } from 'react'
import { Dumbbell, Flame, Salad } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const STORAGE_KEY = 'r2fit:welcome-visto'
const AUTO_FECHAR_MS = 3800
const SAIDA_MS = 450

function jaVisto() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function marcarVisto() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // sem storage (aba privada): apenas não lembra
  }
}

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Tela de boas-vindas exibida uma vez por sessão ao abrir o app. */
export default function WelcomeSplash() {
  const { user, loading } = useAuth()
  const [visivel, setVisivel] = useState(() => !jaVisto())
  const [saindo, setSaindo] = useState(false)

  const fechar = () => {
    if (saindo) return
    marcarVisto()
    setSaindo(true)
    setTimeout(() => setVisivel(false), SAIDA_MS)
  }

  useEffect(() => {
    if (!visivel || saindo) return
    const t = setTimeout(fechar, AUTO_FECHAR_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, saindo])

  if (!visivel) return null

  const nome = user?.user_metadata?.nome ?? user?.email?.split('@')[0]
  const recursos = [
    { icon: Salad, label: 'Dieta' },
    { icon: Dumbbell, label: 'Treino' },
    { icon: Flame, label: 'Calorias' },
  ]

  return (
    <div
      role="dialog"
      aria-label="Boas-vindas ao R2 Fit Pro"
      onClick={fechar}
      className={`welcome-root fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950 px-6 select-none ${saindo ? 'welcome-out' : ''}`}
    >
      {/* Brilho de fundo */}
      <div className="welcome-glow pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500/15 blur-3xl" />

      <div className="relative flex flex-col items-center text-center">
        {/* Logo */}
        <div className="welcome-logo relative mb-6">
          <span className="welcome-ring absolute inset-0 rounded-3xl border border-green-500/40" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500 shadow-xl shadow-green-500/25">
            <svg className="h-11 w-11 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
        </div>

        <p className="welcome-fade text-sm text-zinc-500" style={{ animationDelay: '0.35s' }}>
          {saudacao()}{!loading && nome ? <>, <span className="capitalize text-zinc-300">{nome}</span></> : ''}
        </p>
        <h1 className="welcome-fade mt-1 text-3xl font-bold tracking-tight text-zinc-100" style={{ animationDelay: '0.5s' }}>
          Bem-vindo ao <span className="text-green-500">R2 Fit Pro</span>
        </h1>
        <p className="welcome-fade mt-2 max-w-xs text-sm text-zinc-400" style={{ animationDelay: '0.65s' }}>
          Dieta e treino personalizados com IA
        </p>

        <div className="mt-8 flex gap-3">
          {recursos.map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className="welcome-fade flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
              style={{ animationDelay: `${0.85 + i * 0.12}s` }}
            >
              <Icon className="h-5 w-5 text-green-400" strokeWidth={1.8} />
              <span className="text-xs font-medium text-zinc-300">{label}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fechar() }}
          className="welcome-fade mt-10 rounded-xl bg-green-500 px-8 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-green-500/20 transition-transform active:scale-95"
          style={{ animationDelay: '1.3s' }}
        >
          Começar
        </button>
      </div>

      {/* Barra de progresso do auto-fechamento */}
      <div className="absolute bottom-10 h-0.5 w-24 overflow-hidden rounded-full bg-zinc-800">
        <div className="welcome-progress h-full bg-green-500/70" style={{ animationDuration: `${AUTO_FECHAR_MS}ms` }} />
      </div>
    </div>
  )
}
