import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ANILHAS_PADRAO, FAIXAS, anilhasPorLado, cargaDaFaixa, umRM } from '../lib/calculadoras'

const n = (s: string) => Number(s.replace(',', '.'))
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const CAMPO = 'bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 w-full'

export default function CalculadorasPage() {
  const navigate = useNavigate()
  const [kg, setKg] = useState('')
  const [reps, setReps] = useState('')
  const [total, setTotal] = useState('')
  const [barra, setBarra] = useState('20')
  const [tem, setTem] = useState<number[]>(ANILHAS_PADRAO)
  const rm = umRM(n(kg), Math.round(n(reps)))
  const lado = anilhasPorLado(n(total), n(barra), tem)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Calculadoras</h1>
          <p className="text-sm text-zinc-500">Carga máxima e anilhas na barra.</p>
        </div>
      </div>

      <section aria-label="Carga máxima" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="font-bold text-zinc-50">Carga máxima (1RM)</h2>
        <p className="text-xs text-zinc-500">Quanto você levantou e quantas repetições fez (até 12 é mais preciso).</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Carga (kg)<input inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} className={CAMPO} aria-label="Carga em kg" /></label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Repetições<input inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} className={CAMPO} aria-label="Repetições" /></label>
        </div>
        {rm != null && (
          <>
            <p role="status" className="text-sm text-zinc-300">Carga máxima estimada: <b className="text-2xl text-green-400 tabular-nums">{fmt(rm)} kg</b></p>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-zinc-500"><th className="text-left font-normal py-1">% do máximo</th><th className="text-left font-normal">Carga</th><th className="text-left font-normal">Repetições</th></tr></thead>
              <tbody>{FAIXAS.map(([p, r]) => <tr key={p} className="border-t border-zinc-800"><td className="py-1.5 text-zinc-400">{p}%</td><td className="text-zinc-100 tabular-nums">{fmt(cargaDaFaixa(rm, p))} kg</td><td className="text-zinc-400">{r}</td></tr>)}</tbody>
            </table>
          </>
        )}
        {kg && reps && rm == null && <p className="text-sm text-amber-400">Use carga maior que zero e de 1 a 20 repetições.</p>}
      </section>

      <section aria-label="Anilhas na barra" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="font-bold text-zinc-50">Anilhas na barra</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Peso total (kg)<input inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} className={CAMPO} aria-label="Peso total em kg" /></label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Barra
            <select value={barra} onChange={e => setBarra(e.target.value)} className={CAMPO} aria-label="Peso da barra">
              {['20', '15', '10', '8', '0'].map(b => <option key={b} value={b}>{b === '0' ? 'Sem barra' : `${b} kg`}</option>)}
            </select>
          </label>
        </div>
        <div role="group" aria-label="Anilhas disponíveis" className="flex flex-wrap gap-1.5">
          {ANILHAS_PADRAO.map(a => (
            <button key={a} type="button" aria-pressed={tem.includes(a)} onClick={() => setTem(t => (t.includes(a) ? t.filter(x => x !== a) : [...t, a]))}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${tem.includes(a) ? 'bg-green-500/10 border-green-500/40 text-green-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500 line-through'}`}>{fmt(a)}</button>
          ))}
        </div>
        {lado && (
          <div role="status">
            <p className="text-sm text-zinc-300">Em <b>cada lado</b>: {lado.anilhas.length ? <b className="text-green-400">{lado.anilhas.map(fmt).join(' + ')} kg</b> : 'nenhuma anilha'}</p>
            {lado.sobra > 0 && <p className="text-xs text-amber-400 mt-1">Com essas anilhas fecha em {fmt(lado.real)} kg (faltam {fmt(lado.sobra)} kg).</p>}
          </div>
        )}
        {total && !lado && <p className="text-sm text-amber-400">O peso total precisa ser maior que o da barra.</p>}
      </section>
    </div>
  )
}
