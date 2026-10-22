import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { EstadoAcesso } from '../lib/formatos'

// Estado de acesso calculado no servidor (função meu_acesso). O frontend usa
// apenas para exibição e navegação; o bloqueio real acontece no banco (RLS) e nas APIs.
interface Acesso {
  estado: EstadoAcesso
  premium: boolean
  admin: boolean
  carregando: boolean
  erro: boolean
  recarregar: () => Promise<void>
}

const AcessoContext = createContext<Acesso | null>(null)

export function AcessoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [estado, setEstado] = useState<EstadoAcesso>('visitante')
  const [premium, setPremium] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  // Usuário para o qual o estado atual foi calculado (evita usar dados de outra sessão)
  const [carregadoPara, setCarregadoPara] = useState<string | null | undefined>(undefined)

  const recarregar = useCallback(async () => {
    if (!user) {
      setEstado('visitante'); setPremium(false); setAdmin(false); setCarregando(false); setErro(false)
      setCarregadoPara(null)
      return
    }
    const { data, error } = await supabase.rpc('meu_acesso')
    if (error || !data) {
      setErro(true)
    } else {
      const d = data as { estado: EstadoAcesso; premium: boolean; admin: boolean }
      setEstado(d.estado); setPremium(d.premium); setAdmin(d.admin); setErro(false)
    }
    setCarregadoPara(user.id)
    setCarregando(false)
  }, [user])

  useEffect(() => {
    setCarregando(true)
    recarregar()
  }, [recarregar])

  return (
    <AcessoContext.Provider value={{
      estado, premium, admin, erro, recarregar,
      carregando: carregando || carregadoPara !== (user?.id ?? null),
    }}>
      {children}
    </AcessoContext.Provider>
  )
}

export function useAcesso() {
  const ctx = useContext(AcessoContext)
  if (!ctx) throw new Error('useAcesso deve ser usado dentro de AcessoProvider')
  return ctx
}
