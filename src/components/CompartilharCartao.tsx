import { useEffect, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import type { Cartao } from '../lib/cartoesBase'
import { baixarImagem, compartilharImagem, desenharCartao } from '../lib/cartaoImagem'
import { Button, Spinner } from './UI'

/** Botão que gera o cartão (imagem para stories/WhatsApp) e abre a prévia com compartilhar e baixar. */
export default function CompartilharCartao({ cartao, rotulo = 'Compartilhar', className = '' }: { cartao: Cartao; rotulo?: string; className?: string }) {
  const [aberto, setAberto] = useState<Cartao | null>(null)
  return (
    <>
      <button type="button" onClick={() => setAberto(cartao)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-300 hover:bg-green-500/20 transition ${className}`}>
        <Share2 className="w-4 h-4" />{rotulo}
      </button>
      {aberto && <Previa cartao={aberto} onFechar={() => setAberto(null)} />}
    </>
  )
}

function Previa({ cartao, onFechar }: { cartao: Cartao; onFechar: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    let vivo = true
    let u: string | null = null
    desenharCartao(cartao).then(b => { if (!vivo) return; u = URL.createObjectURL(b); setBlob(b); setUrl(u) })
      .catch(e => vivo && setErro(e instanceof Error ? e.message : 'Não foi possível gerar a imagem.'))
    return () => { vivo = false; if (u) URL.revokeObjectURL(u) }
  }, [cartao])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onFechar])

  const compartilhar = async () => {
    if (!blob) return
    const r = await compartilharImagem(blob, cartao.texto)
    if (r === 'baixado') setAviso('Imagem salva. É só postar nos stories ou mandar no WhatsApp.')
    if (r === 'compartilhado') onFechar()
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label="Compartilhar" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-4 flex flex-col gap-3 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-zinc-50">Compartilhar</h2>
          <button onClick={onFechar} aria-label="Fechar" className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="aspect-[9/16] max-h-[60vh] mx-auto w-full rounded-2xl overflow-hidden bg-zinc-950 flex items-center justify-center">
          {url ? <img src={url} alt="Prévia do cartão" className="h-full w-auto object-contain" /> : erro ? <p className="text-sm text-red-400 p-4">{erro}</p> : <Spinner />}
        </div>
        {aviso && <p className="text-sm text-green-400 text-center">{aviso}</p>}
        <div className="flex gap-2">
          <Button className="flex-[2]" disabled={!blob} onClick={compartilhar}><Share2 className="w-4 h-4" />Compartilhar</Button>
          <Button variant="secondary" className="flex-1" disabled={!blob} onClick={() => { if (blob) { baixarImagem(blob); setAviso('Imagem salva.') } }} aria-label="Baixar imagem"><Download className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  )
}
