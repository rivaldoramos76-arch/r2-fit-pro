import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Home, Dumbbell, Salad, Flame, Menu as MenuIcon } from 'lucide-react'
import { useAcesso } from '../context/AcessoContext'
import { diasRestantes } from '../lib/formatos'
import { Logo } from './Logo'
import AvisosGlobais from './AvisosGlobais'

const navItems = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/treino', label: 'Treinos', icon: Dumbbell },
  { href: '/dieta', label: 'Dieta', icon: Salad },
  { href: '/calorias', label: 'Calorias', icon: Flame },
  { href: '/menu', label: 'Menu', icon: MenuIcon },
]

/** Aviso fixo quando a assinatura exige atenção do usuário. */
function AvisoAssinatura() {
  const { estado, testeAte } = useAcesso()
  if (estado === 'teste') {
    const dias = diasRestantes(testeAte)
    return (
      <Link to="/assinatura" className="block bg-green-500/10 border-b border-green-500/20 text-green-300 text-xs sm:text-sm">
        <div className="max-w-lg mx-auto px-4 py-2">
          Teste grátis: {dias <= 1 ? 'termina hoje' : `faltam ${dias} dias`}. <span className="underline font-semibold">Assinar agora</span>
        </div>
      </Link>
    )
  }
  const avisos: Partial<Record<typeof estado, string>> = {
    tolerancia: 'Não conseguimos renovar sua assinatura. Regularize para não perder o acesso.',
    pagamento_pendente: 'Seu pagamento está pendente. Os recursos Premium serão liberados após a confirmação.',
    expirada: 'Sua assinatura expirou. Assine novamente para voltar a usar os recursos Premium.',
  }
  const texto = avisos[estado]
  if (!texto) return null
  return (
    <Link to="/assinatura" className="block bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-300 text-xs sm:text-sm">
      <div className="max-w-lg mx-auto px-4 py-2">{texto} <span className="underline font-semibold">Ver assinatura</span></div>
    </Link>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-20 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/60">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <Logo tamanho="sm" />
            <span className="font-bold text-zinc-100 tracking-tight group-hover:text-green-400 transition">R2 Fit Pro</span>
          </Link>
          <Link to="/menu" aria-label="Abrir menu" className="text-zinc-400 hover:text-zinc-200 p-2 -mr-2 rounded-lg hover:bg-zinc-800 transition">
            <MenuIcon className="w-5 h-5" />
          </Link>
        </div>
        <AvisoAssinatura />
        <AvisosGlobais />
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-5 pb-28">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/60" aria-label="Navegação principal">
        <div className="max-w-lg mx-auto px-1 py-1.5 flex items-center justify-around" style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location.pathname === href || location.pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                to={href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition active:scale-95 ${
                  active ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.8} />
                <span className="text-[11px] font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
