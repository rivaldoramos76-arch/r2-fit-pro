import { useState } from 'react'
import { Smartphone, Share, MoreVertical, PlusSquare, Download, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { detectarSistema, useInstalacao } from '../lib/instalacao'
import type { Sistema } from '../lib/instalacao'

const PASSOS: Record<Exclude<Sistema, 'outro'>, { texto: ReactNode }[]> = {
  iphone: [
    { texto: <>Abra <b>r2fitpro.com.br</b> no <b>Safari</b>.</> },
    { texto: <>Toque em <b>Compartilhar</b> <Share className="inline w-4 h-4 -mt-0.5" /> (quadrado com seta, na barra de baixo).</> },
    { texto: <>Role a lista e toque em <b>Adicionar à Tela de Início</b> <PlusSquare className="inline w-4 h-4 -mt-0.5" />.</> },
    { texto: <>Toque em <b>Adicionar</b>. Pronto: o ícone verde do R2 Fit Pro aparece na sua tela inicial.</> },
  ],
  android: [
    { texto: <>Abra <b>r2fitpro.com.br</b> no <b>Chrome</b>.</> },
    { texto: <>Toque nos <b>três pontinhos</b> <MoreVertical className="inline w-4 h-4 -mt-0.5" /> no canto de cima.</> },
    { texto: <>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</> },
    { texto: <>Confirme em <b>Instalar</b>. O ícone do R2 Fit Pro aparece junto dos seus apps.</> },
  ],
}

/** Lembrete fixo no início enquanto o app não estiver instalado, com o passo a passo de cada sistema. */
export default function InstalarApp() {
  const { instalado, podeInstalarDireto, instalar } = useInstalacao()
  const detectado = detectarSistema()
  const [aberto, setAberto] = useState(false)
  const [sistema, setSistema] = useState<Exclude<Sistema, 'outro'>>(detectado === 'android' ? 'android' : 'iphone')
  if (instalado) return null

  return (
    <section aria-label="Instalar o app" className="rounded-3xl border border-green-500/25 bg-gradient-to-br from-green-500/10 via-zinc-900 to-zinc-900 overflow-hidden animate-fade-up">
      <div className="flex items-center gap-3 p-4">
        <span className="w-11 h-11 rounded-2xl bg-green-500/15 text-green-400 flex items-center justify-center shrink-0"><Smartphone className="w-6 h-6" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-50">Instale o app no celular</p>
          <p className="text-xs text-zinc-400">Abre em tela cheia, direto da tela inicial.</p>
        </div>
        {podeInstalarDireto
          ? <button onClick={() => instalar()} className="flex items-center gap-1.5 rounded-xl bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold text-sm px-3.5 py-2 active:scale-95 transition"><Download className="w-4 h-4" />Instalar</button>
          : <button onClick={() => setAberto(a => !a)} aria-expanded={aberto} className="flex items-center gap-1 rounded-xl border border-green-500/40 text-green-400 font-semibold text-sm px-3 py-2 active:scale-95 transition">
              Como instalar<ChevronDown className={`w-4 h-4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
            </button>}
      </div>
      {aberto && !podeInstalarDireto && (
        <div className="px-4 pb-4 animate-fade-up">
          <div className="grid grid-cols-2 gap-1 bg-zinc-800/60 rounded-xl p-1" role="tablist">
            {(['iphone', 'android'] as const).map(s => (
              <button key={s} role="tab" aria-selected={sistema === s} onClick={() => setSistema(s)}
                className={`py-1.5 rounded-lg text-sm font-semibold transition ${sistema === s ? 'bg-zinc-950 text-green-400' : 'text-zinc-400'}`}>{s === 'iphone' ? 'iPhone' : 'Android'}</button>
            ))}
          </div>
          <ol className="mt-3 flex flex-col gap-2.5">
            {PASSOS[sistema].map((p, i) => (
              <li key={i} className="flex gap-3 text-sm text-zinc-300 leading-snug">
                <span className="w-6 h-6 rounded-full bg-green-500 text-zinc-950 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="pt-0.5">{p.texto}</span>
              </li>
            ))}
          </ol>
          {sistema === 'iphone' && <p className="text-xs text-zinc-500 mt-3">No iPhone, a instalação é feita pelo Safari.</p>}
        </div>
      )}
    </section>
  )
}
