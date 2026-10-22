import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { Logo } from './Logo'

export function RodapeLegal() {
  return (
    <footer className="border-t border-zinc-800/60 mt-12">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-sm text-zinc-500">
        <p>© {new Date().getFullYear()} R2 Fit Pro</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Links legais">
          <Link to="/termos" className="hover:text-zinc-300">Termos de Uso</Link>
          <Link to="/privacidade" className="hover:text-zinc-300">Privacidade</Link>
          <Link to="/sobre" className="hover:text-zinc-300">Sobre</Link>
          <Link to="/suporte" className="hover:text-zinc-300">Ajuda</Link>
        </nav>
      </div>
    </footer>
  )
}

export default function PublicLayout({ children, largura = 'max-w-5xl' }: { children: ReactNode; largura?: string }) {
  const { user } = useAuth()
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-20 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/60">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2">
            <Logo tamanho="sm" />
            <span className="font-bold tracking-tight">R2 Fit Pro</span>
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link to="/dashboard" className="bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl">Abrir o app</Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm text-zinc-300 hover:text-white px-3 py-2">Entrar</Link>
                <Link to="/auth?modo=cadastro" className="bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl">Criar conta</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className={`flex-1 w-full ${largura} mx-auto px-4 py-6`}>{children}</main>
      <RodapeLegal />
    </div>
  )
}
