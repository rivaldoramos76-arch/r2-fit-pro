import { useCallback, useEffect, useState } from 'react'
import { Droplet, Undo2, Pencil, Plus } from 'lucide-react'
import { aguaDoDia, adicionarAgua, removerAgua, salvarMetasExtras } from '../../lib/progresso'
import type { RegistroAgua } from '../../lib/progresso'
import { metaAguaSugerida } from '../../lib/exercicios'
import type { MetaSalva } from '../../lib/nutricao'
import { fmt } from '../nutricao/Graficos'

/** Copo que enche conforme a água do dia (animado). */
function Copo({ fracao }: { fracao: number }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setMontado(true)); return () => cancelAnimationFrame(r) }, [])
  const f = Math.min(1, Math.max(0, fracao))
  const altura = 74 * (montado ? f : 0)
  return (
    <svg viewBox="0 0 64 88" className="w-14 h-[76px] shrink-0" aria-hidden>
      <defs>
        <clipPath id="copo-clip"><path d="M8 6 h48 l-6 76 a4 4 0 0 1 -4 4 h-28 a4 4 0 0 1 -4 -4 z" /></clipPath>
        <linearGradient id="agua-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#0284c7" /></linearGradient>
      </defs>
      <g clipPath="url(#copo-clip)">
        <rect x="0" y="0" width="64" height="88" fill="#27272a" />
        <rect x="0" y={84 - altura} width="64" height={altura + 4} fill="url(#agua-grad)" style={{ transition: 'y 0.7s cubic-bezier(0.22,1,0.36,1), height 0.7s cubic-bezier(0.22,1,0.36,1)' }} />
        {f > 0 && <path d={`M0 ${84 - altura} q8 -3 16 0 t16 0 t16 0 t16 0 v4 h-64 z`} fill="#7dd3fc" opacity="0.6" style={{ transition: 'd 0.7s' }} />}
      </g>
      <path d="M8 6 h48 l-6 76 a4 4 0 0 1 -4 4 h-28 a4 4 0 0 1 -4 -4 z" fill="none" stroke="#52525b" strokeWidth="2.5" />
    </svg>
  )
}

/** Água do dia: copo animado, botões rápidos, desfazer e meta ajustável. */
export default function CartaoAgua({ userId, data, meta, onMetaMudou }: {
  userId: string; data: string; meta: MetaSalva | null; onMetaMudou?: () => void
}) {
  const [registros, setRegistros] = useState<RegistroAgua[]>([])
  const [outro, setOutro] = useState<string | null>(null)
  const [editarMeta, setEditarMeta] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [pulsar, setPulsar] = useState(0)

  const carregar = useCallback(() => { aguaDoDia(userId, data).then(setRegistros).catch(() => {}) }, [userId, data])
  useEffect(() => { carregar() }, [carregar])

  const metaMl = meta?.meta_agua_ml ?? metaAguaSugerida(meta?.peso_kg)
  const total = registros.reduce((s, r) => s + r.ml, 0)

  const somar = async (ml: number) => {
    if (!(ml > 0)) return
    setErro('')
    try {
      const novo = await adicionarAgua(userId, data, ml)
      setRegistros(r => [...r, novo]); setPulsar(p => p + 1); setOutro(null)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível registrar') }
  }
  const desfazer = async () => {
    const ultimo = registros[registros.length - 1]
    if (!ultimo) return
    setRegistros(r => r.slice(0, -1))
    await removerAgua(ultimo.id).catch(() => carregar())
  }
  const salvarMeta = async () => {
    const v = Math.round(Number((editarMeta ?? '').replace(/\D/g, '')))
    if (!(v >= 500 && v <= 8000)) { setErro('Meta entre 500 e 8.000 ml'); return }
    try { await salvarMetasExtras(userId, { meta_agua_ml: v }); setEditarMeta(null); onMetaMudou?.() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar') }
  }

  return (
    <section aria-label="Água" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-zinc-50 flex items-center gap-2"><Droplet className="w-4 h-4 text-sky-400" />Água</h2>
        {registros.length > 0 && <button onClick={desfazer} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 p-1"><Undo2 className="w-3.5 h-3.5" />Desfazer</button>}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <Copo fracao={total / metaMl} />
        <div className="flex-1 min-w-0">
          <p key={pulsar} className="text-2xl font-bold tabular-nums text-zinc-50 animate-pop">{fmt(total)} <span className="text-sm font-medium text-zinc-400">ml</span></p>
          {editarMeta === null ? (
            <button onClick={() => meta ? setEditarMeta(String(metaMl)) : setErro('Defina sua meta diária para personalizar a meta de água.')}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
              de {fmt(metaMl)} ml {total >= metaMl ? '· meta batida! 🎉' : `· faltam ${fmt(metaMl - total)} ml`}<Pencil className="w-3 h-3" />
            </button>
          ) : (
            <form onSubmit={e => { e.preventDefault(); salvarMeta() }} className="flex items-center gap-1.5 mt-1">
              <input value={editarMeta} onChange={e => setEditarMeta(e.target.value)} inputMode="numeric" aria-label="Meta de água (ml)" autoFocus
                className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
              <span className="text-xs text-zinc-500">ml</span>
              <button type="submit" className="text-xs font-semibold text-sky-400 px-2 py-1">Salvar</button>
            </form>
          )}
          <div className="h-1.5 rounded-full bg-zinc-800 mt-2 overflow-hidden">
            <div className="h-full rounded-full bg-sky-400 barra-progresso" style={{ width: `${Math.min(100, (total / metaMl) * 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button onClick={() => somar(250)} className="rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-300 py-2 text-sm font-semibold active:scale-95 transition">+ Copo<span className="block text-[11px] font-normal text-sky-400/80">250 ml</span></button>
        <button onClick={() => somar(500)} className="rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-300 py-2 text-sm font-semibold active:scale-95 transition">+ Garrafa<span className="block text-[11px] font-normal text-sky-400/80">500 ml</span></button>
        {outro === null
          ? <button onClick={() => setOutro('')} className="rounded-xl border border-zinc-700 text-zinc-300 py-2 text-sm font-semibold active:scale-95 transition">Outro<span className="block text-[11px] font-normal text-zinc-500">valor</span></button>
          : <form onSubmit={e => { e.preventDefault(); somar(Number(outro.replace(/\D/g, ''))) }} className="flex items-center rounded-xl border border-sky-500/40 bg-zinc-800 pl-2">
              <input value={outro} onChange={e => setOutro(e.target.value)} inputMode="numeric" placeholder="ml" aria-label="Quantidade de água (ml)" autoFocus
                className="w-full bg-transparent text-sm text-zinc-100 focus:outline-none py-2" />
              <button type="submit" aria-label="Adicionar água" className="p-2 text-sky-400"><Plus className="w-4 h-4" /></button>
            </form>}
      </div>
      {erro && <p className="mt-2 text-xs text-amber-300">{erro}</p>}
    </section>
  )
}
