import { useEffect, useRef, useState } from 'react'
import { X, Keyboard } from 'lucide-react'
import { Button } from '../UI'

// Leitor de código de barras pela câmera. Usa o leitor nativo do navegador (Chrome/Android);
// no iPhone, carrega sob demanda o leitor ZXing (barcode-detector, versão fixa).
const POLYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/es/ponyfill.js'
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

interface Detector { detect: (fonte: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type CtorDetector = new (o: { formats: string[] }) => Detector

async function criarDetector(): Promise<Detector> {
  const Nativo = (window as unknown as { BarcodeDetector?: CtorDetector & { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
  if (Nativo?.getSupportedFormats) {
    const suportados = await Nativo.getSupportedFormats().catch(() => [] as string[])
    if (FORMATOS.some(f => suportados.includes(f))) return new Nativo({ formats: FORMATOS.filter(f => suportados.includes(f)) })
  }
  const mod = await import(/* @vite-ignore */ POLYFILL) as { BarcodeDetector: CtorDetector }
  return new mod.BarcodeDetector({ formats: FORMATOS })
}

/** Código EAN/UPC válido (dígito verificador). */
export function codigoValido(c: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false
  const d = c.split('').map(Number)
  const verif = d.pop()!
  const soma = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === verif
}

export default function LeitorCodigo({ onCodigo, onClose }: { onCodigo: (codigo: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')
  const [digitar, setDigitar] = useState(false)
  const [manual, setManual] = useState('')
  // Callback atual sem reiniciar a câmera a cada renderização
  const aoLer = useRef(onCodigo)
  aoLer.current = onCodigo

  useEffect(() => {
    let vivo = true
    let stream: MediaStream | null = null
    let timer = 0
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
        if (!vivo) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const detector = await criarDetector()
        const ler = async () => {
          if (!vivo) return
          try {
            if (v.readyState >= 2) {
              const r = await detector.detect(v)
              const c = r.map(x => x.rawValue).find(codigoValido)
              if (c) { navigator.vibrate?.(60); aoLer.current(c); return }
            }
          } catch { /* quadro ilegível: tenta o próximo */ }
          timer = window.setTimeout(ler, 180)
        }
        ler()
      } catch (e) {
        const nome = (e as { name?: string })?.name
        setErro(nome === 'NotAllowedError' ? 'Permita o uso da câmera para ler o código de barras.' : 'Não foi possível abrir a câmera neste aparelho.')
        setDigitar(true)
      }
    })()
    return () => { vivo = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Ler código de barras">
      <div className="flex items-center justify-between p-4 text-white" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <p className="font-semibold">Aponte para o código de barras</p>
        <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-lg bg-white/10"><X className="w-5 h-5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {!erro && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 max-w-[80vw] h-40 rounded-2xl border-2 border-green-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] relative overflow-hidden">
              <span className="absolute left-0 right-0 h-0.5 bg-green-400/80 animate-pulse top-1/2" />
            </div>
          </div>
        )}
      </div>
      <div className="p-4 bg-zinc-950" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {erro && <p className="text-sm text-amber-300 mb-3">{erro}</p>}
        {digitar ? (
          <form onSubmit={e => { e.preventDefault(); if (codigoValido(manual)) onCodigo(manual) }} className="flex gap-2">
            <input value={manual} onChange={e => setManual(e.target.value.replace(/\D/g, '').slice(0, 14))} inputMode="numeric" placeholder="Números do código de barras" autoFocus
              aria-label="Código de barras" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <Button type="submit" disabled={!codigoValido(manual)}>Buscar</Button>
          </form>
        ) : (
          <button onClick={() => setDigitar(true)} className="w-full flex items-center justify-center gap-2 text-sm text-zinc-300 py-2"><Keyboard className="w-4 h-4" />Digitar o código</button>
        )}
      </div>
    </div>
  )
}
