import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { ehAppNativo, versaoDoApp } from '../lib/nativo'
import { Card } from './UI'

// "Agora não" vale até fechar o app; na próxima abertura o aviso volta
const CHAVE = 'r2-atualizacao-dispensada'
// Endereço fora do app: o app abre esse link no navegador do celular, que baixa e oferece instalar
const BASE_DOWNLOAD = 'https://r2-fit-pro.vercel.app/baixar/'

export interface InfoVersao {
  instalada: { codigo: number; nome: string } | null
  publicada: { codigo: number; nome: string; novidades?: string; link: string } | null
  /** Por que não deu para comparar (mostrado em Configurações) */
  problema?: string
}

/** Compara a versão do app instalado com a publicada em /baixar/versao.json. */
export async function verificarVersaoApp(): Promise<InfoVersao> {
  let instalada: InfoVersao['instalada'] = null
  let problema: string | undefined
  try { instalada = await versaoDoApp() } catch (e) { problema = `versão instalada: ${String(e).slice(0, 80)}` }
  if (!instalada && !problema) problema = 'o app não informou a versão instalada'
  let publicada: InfoVersao['publicada'] = null
  try {
    const r = await fetch(`/baixar/versao.json?t=${Date.now()}`, { cache: 'no-store' })
    const v = r.ok ? await r.json() : null
    if (v?.versionCode) {
      publicada = {
        codigo: Number(v.versionCode), nome: String(v.versionName ?? ''), novidades: v.novidades,
        link: BASE_DOWNLOAD + (typeof v.arquivo === 'string' && /^[\w.-]+\.apk$/.test(v.arquivo) ? v.arquivo : 'r2-fit-pro.apk'),
      }
    } else problema ??= `versão publicada indisponível (${r.status})`
  } catch (e) { problema ??= `versão publicada: ${String(e).slice(0, 80)}` }
  return { instalada, publicada, problema }
}

/** App Android: avisa quando há versão nova do app (a parte nativa só muda instalando o APK novo). */
export default function AvisoAtualizacaoApp() {
  const [nova, setNova] = useState<InfoVersao['publicada']>(null)

  useEffect(() => {
    if (!ehAppNativo()) return
    let vivo = true
    verificarVersaoApp().then(({ instalada, publicada }) => {
      if (!vivo || !instalada || !publicada || !(publicada.codigo > instalada.codigo)) return
      try { if (sessionStorage.getItem(CHAVE) === String(publicada.codigo)) return } catch { /* sem armazenamento */ }
      setNova(publicada)
    }).catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!nova) return null
  const dispensar = () => { try { sessionStorage.setItem(CHAVE, String(nova.codigo)) } catch { /* sem armazenamento */ } setNova(null) }
  return (
    <div role="status" aria-label="Nova versão do app" className="fixed left-3 right-3 z-[80] max-w-lg mx-auto rounded-2xl border border-green-500/30 bg-zinc-900/95 backdrop-blur p-3 shadow-xl shadow-black/50 flex items-start gap-3"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
      <Download className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-100">Nova versão do R2 Fit Pro{nova.nome ? ` (${nova.nome})` : ''}</p>
        {nova.novidades && <p className="text-xs text-zinc-400 mt-0.5">{nova.novidades}</p>}
        <a href={nova.link} className="inline-flex mt-2 px-3 py-1.5 rounded-lg bg-green-500 text-zinc-950 text-xs font-bold">Atualizar agora</a>
        <p className="text-[11px] text-zinc-500 mt-1.5">Baixa pelo navegador; abra o arquivo baixado e toque em Instalar. Seus dados continuam.</p>
      </div>
      <button onClick={dispensar} aria-label="Agora não" className="p-1 -m-1 text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
    </div>
  )
}

/** Configurações (só no app): versão instalada, a mais nova e o botão de atualizar. */
export function CartaoVersaoApp() {
  const [info, setInfo] = useState<InfoVersao | null>(null)
  useEffect(() => { if (ehAppNativo()) verificarVersaoApp().then(setInfo).catch(() => {}) }, [])
  if (!ehAppNativo()) return null
  const desatualizado = !!(info?.instalada && info.publicada && info.publicada.codigo > info.instalada.codigo)
  return (
    <Card>
      <h2 className="font-semibold">App instalado</h2>
      {!info ? <p className="text-sm text-zinc-500 mt-1">Verificando…</p> : (
        <>
          <p className="text-sm text-zinc-300 mt-1">
            Versão instalada: <b>{info.instalada ? `${info.instalada.nome} (${info.instalada.codigo})` : 'não identificada'}</b>
            {info.publicada && <> · mais nova: <b>{info.publicada.nome}</b></>}
          </p>
          {info.instalada && info.publicada && !desatualizado && <p className="text-xs text-green-400 mt-1">✓ Você está na versão mais nova.</p>}
          {info.problema && <p className="text-xs text-zinc-500 mt-1">Detalhe: {info.problema}</p>}
          {(desatualizado || !info.instalada) && info.publicada && (
            <a href={info.publicada.link} className="inline-flex mt-3 px-4 py-2 rounded-xl bg-green-500 text-zinc-950 text-sm font-bold">Baixar a versão {info.publicada.nome}</a>
          )}
        </>
      )}
    </Card>
  )
}
