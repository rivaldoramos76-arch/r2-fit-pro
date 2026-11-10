import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { ehAppNativo, LINK_APK, versaoDoApp } from '../lib/nativo'

// "Agora não" vale até fechar o app; na próxima abertura o aviso volta
const CHAVE = 'r2-atualizacao-dispensada'

/** App Android: avisa quando há versão nova do app (a parte nativa só muda instalando o APK novo). */
export default function AvisoAtualizacaoApp() {
  const [nova, setNova] = useState<{ codigo: number; nome: string; novidades?: string } | null>(null)

  useEffect(() => {
    if (!ehAppNativo()) return
    let vivo = true
    ;(async () => {
      const atual = await versaoDoApp()
      if (!atual) return
      const r = await fetch(`/baixar/versao.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null)
      const v = r?.ok ? await r.json().catch(() => null) : null
      if (!vivo || !v || !(Number(v.versionCode) > atual.codigo)) return
      try { if (sessionStorage.getItem(CHAVE) === String(v.versionCode)) return } catch { /* sem armazenamento */ }
      setNova({ codigo: Number(v.versionCode), nome: String(v.versionName ?? ''), novidades: v.novidades })
    })().catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!nova) return null
  const dispensar = () => { try { sessionStorage.setItem(CHAVE, String(nova.codigo)) } catch { /* sem armazenamento */ } setNova(null) }
  return (
    <div role="status" aria-label="Nova versão do app" className="fixed left-3 right-3 z-[60] max-w-lg mx-auto rounded-2xl border border-green-500/30 bg-zinc-900/95 backdrop-blur p-3 shadow-xl shadow-black/50 flex items-start gap-3"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
      <Download className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-100">Nova versão do R2 Fit Pro{nova.nome ? ` (${nova.nome})` : ''}</p>
        {nova.novidades && <p className="text-xs text-zinc-400 mt-0.5">{nova.novidades}</p>}
        <a href={LINK_APK}
          className="inline-flex mt-2 px-3 py-1.5 rounded-lg bg-green-500 text-zinc-950 text-xs font-bold">Atualizar agora</a>
        <p className="text-[11px] text-zinc-500 mt-1.5">Baixa pelo navegador; toque no arquivo e em Instalar. Seus dados continuam.</p>
      </div>
      <button onClick={dispensar} aria-label="Agora não" className="p-1 -m-1 text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
    </div>
  )
}
