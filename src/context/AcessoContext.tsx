import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { chamarApi } from '../lib/api'
import type { EstadoAcesso } from '../lib/formatos'

// Estado de acesso calculado no servidor (função meu_acesso). O frontend usa
// apenas para exibição e navegação; o bloqueio real acontece no banco (RLS) e nas APIs.
interface Acesso {
  estado: EstadoAcesso
  premium: boolean
  admin: boolean
  /** Fim do teste grátis, quando o estado é 'teste'. */
  testeAte: string | null
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
  const [testeAte, setTesteAte] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  // Usuário para o qual o estado atual foi calculado (evita usar dados de outra sessão)
  const [carregadoPara, setCarregadoPara] = useState<string | null | undefined>(undefined)

  const uid = user?.id ?? null
  const recarregar = useCallback(async () => {
    if (!uid) {
      setEstado('visitante'); setPremium(false); setAdmin(false); setTesteAte(null); setCarregando(false); setErro(false)
      setCarregadoPara(null)
      return
    }
    const { data, error } = await supabase.rpc('meu_acesso')
    if (error || !data) {
      setErro(true)
    } else {
      const d = data as { estado: EstadoAcesso; premium: boolean; admin: boolean; teste_ate?: string | null }
      setEstado(d.estado); setPremium(d.premium); setAdmin(d.admin); setTesteAte(d.teste_ate ?? null); setErro(false)
    }
    setCarregadoPara(uid)
    setCarregando(false)
  }, [uid])

  useEffect(() => {
    setCarregando(true)
    recarregar()
  }, [recarregar])

  // Rede de segurança da liberação automática: com pagamento pendente, o próprio app
  // reconsulta a plataforma de pagamento ao abrir e ao voltar para a aba (ex.: depois de pagar o Pix
  // no app do banco), caso a notificação do pagamento tenha atrasado ou se perdido.
  const ultimaConsulta = useRef(0)
  useEffect(() => {
    if (!uid || estado !== 'pagamento_pendente' || carregadoPara !== uid) return
    const consultar = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultimaConsulta.current < 30_000) return
      ultimaConsulta.current = Date.now()
      try {
        const r = await chamarApi<{ estado: EstadoAcesso }>('billing', { acao: 'sincronizar' })
        if (r.estado !== 'pagamento_pendente') await recarregar()
      } catch { /* tenta de novo na próxima volta à aba */ }
    }
    consultar()
    document.addEventListener('visibilitychange', consultar)
    return () => document.removeEventListener('visibilitychange', consultar)
  }, [uid, estado, carregadoPara, recarregar])

  return (
    <AcessoContext.Provider value={{
      estado, premium, admin, testeAte, erro, recarregar,
      carregando: carregando || carregadoPara !== uid,
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
