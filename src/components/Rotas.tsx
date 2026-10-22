import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAcesso } from '../context/AcessoContext'
import Layout from './Layout'
import Paywall from './Paywall'
import { Button, Spinner } from './UI'

const Carregando = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Spinner size="lg" /></div>
)

function useExigeLogin() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Carregando />
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return null
}

/** Exige login; usa o layout do app. */
export function RotaPrivada({ children, semLayout = false }: { children: ReactNode; semLayout?: boolean }) {
  const bloqueio = useExigeLogin()
  if (bloqueio) return bloqueio
  return semLayout ? <>{children}</> : <Layout>{children}</Layout>
}

/** Exige login e acesso Premium (verificado no servidor por meu_acesso; o banco aplica RLS). */
export function RotaPremium({ children, recurso, semLayout = false }: { children: ReactNode; recurso: string; semLayout?: boolean }) {
  const bloqueio = useExigeLogin()
  const { premium, carregando, erro, recarregar } = useAcesso()
  if (bloqueio) return bloqueio
  const envolver = (n: ReactNode) => (semLayout ? <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6">{n}</div> : <Layout>{n}</Layout>)
  if (carregando) return envolver(<div className="flex justify-center py-16"><Spinner size="lg" /></div>)
  if (erro) return envolver(
    <div className="text-center py-12">
      <p className="text-zinc-300">Não foi possível verificar seu acesso. Verifique sua conexão.</p>
      <Button className="mt-4" onClick={() => recarregar()}>Tentar novamente</Button>
    </div>,
  )
  if (!premium) return envolver(<Paywall recurso={recurso} />)
  return semLayout ? <>{children}</> : <Layout>{children}</Layout>
}

/** Painel administrativo: exige admin (o servidor também valida cada operação). */
export function RotaAdmin({ children }: { children: ReactNode }) {
  const bloqueio = useExigeLogin()
  const { admin, carregando } = useAcesso()
  if (bloqueio) return bloqueio
  if (carregando) return <Carregando />
  if (!admin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
