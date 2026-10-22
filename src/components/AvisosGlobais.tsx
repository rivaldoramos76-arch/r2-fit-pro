import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { carregarConfig } from '../lib/config'
import { Button } from './UI'

/** Aviso global definido no painel e pedido de aceite quando os Termos mudam de versão. */
export default function AvisosGlobais() {
  const { user } = useAuth()
  const [aviso, setAviso] = useState<string | null>(null)
  const [versaoPendente, setVersaoPendente] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!user) return
    let vivo = true
    ;(async () => {
      const cfg = await carregarConfig().catch(() => null)
      if (!cfg || !vivo) return
      setAviso(cfg.textos.aviso_global)
      const { data } = await supabase.from('profiles').select('versao_termos').eq('id', user.id).single()
      if (vivo && data && data.versao_termos !== cfg.textos.versao_termos) setVersaoPendente(cfg.textos.versao_termos)
    })()
    return () => { vivo = false }
  }, [user])

  const aceitar = async () => {
    setSalvando(true)
    const { error } = await supabase.from('profiles').update({ versao_termos: versaoPendente }).eq('id', user!.id)
    setSalvando(false)
    if (!error) setVersaoPendente(null)
  }

  return (
    <>
      {aviso && <div className="bg-blue-500/10 border-b border-blue-500/20 text-blue-200 text-xs sm:text-sm"><div className="max-w-lg mx-auto px-4 py-2">{aviso}</div></div>}
      {versaoPendente && (
        <div className="bg-zinc-900 border-b border-zinc-800 text-sm">
          <div className="max-w-lg mx-auto px-4 py-3 flex flex-col gap-2">
            <p className="text-zinc-300">Atualizamos nossos <Link to="/termos" className="text-green-400 underline">Termos de Uso</Link> e a <Link to="/privacidade" className="text-green-400 underline">Política de Privacidade</Link>. Leia e confirme para continuar usando o app.</p>
            <Button size="sm" onClick={aceitar} loading={salvando} className="self-start">Li e aceito</Button>
          </div>
        </div>
      )}
    </>
  )
}
