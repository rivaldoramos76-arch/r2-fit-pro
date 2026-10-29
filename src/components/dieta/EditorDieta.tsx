import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { recalcularDieta } from '../../lib/openai'
import type { PlanoAlimentar, Refeicao } from '../../lib/openai'
import { Input } from '../UI'

const campo = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
const inteiro = (s: string) => Number(s.replace(/\D/g, '')) || 0

/** Edição manual do plano alimentar: refeições, alimentos, quantidades, calorias e macros.
 *  As calorias de cada refeição e do dia são recalculadas pela soma dos alimentos. */
export default function EditorDieta({ plano, onChange, nome, onNome }: {
  plano: PlanoAlimentar; onChange: (p: PlanoAlimentar) => void; nome: string; onNome: (n: string) => void
}) {
  const [aberta, setAberta] = useState<number | null>(0)
  const mudar = (p: PlanoAlimentar) => onChange(recalcularDieta(p))
  const mudarRefeicao = (i: number, r: Partial<Refeicao>) => mudar({ ...plano, refeicoes: plano.refeicoes.map((x, j) => (j === i ? { ...x, ...r } : x)) })
  const mudarAlimento = (i: number, k: number, a: Partial<Refeicao['alimentos'][number]>) =>
    mudarRefeicao(i, { alimentos: plano.refeicoes[i].alimentos.map((x, j) => (j === k ? { ...x, ...a } : x)) })
  const mover = (i: number, dir: -1 | 1) => {
    const r = [...plano.refeicoes]; const j = i + dir
    if (j < 0 || j >= r.length) return
    ;[r[i], r[j]] = [r[j], r[i]]
    mudar({ ...plano, refeicoes: r }); setAberta(j)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <Input label="Nome do plano" value={nome} onChange={e => onNome(e.target.value)} maxLength={120} />
        <p className="text-sm font-medium text-zinc-300">Macros por dia</p>
        <div className="grid grid-cols-3 gap-2">
          {([['proteina_g', 'Proteína (g)'], ['carboidrato_g', 'Carbo (g)'], ['gordura_g', 'Gordura (g)']] as const).map(([k, r]) => (
            <Input key={k} label={r} inputMode="numeric" value={String(plano.macros?.[k] ?? 0)}
              onChange={e => mudar({ ...plano, macros: { ...{ proteina_g: 0, carboidrato_g: 0, gordura_g: 0 }, ...plano.macros, [k]: inteiro(e.target.value) } })} />
          ))}
        </div>
        <p className="text-xs text-zinc-500">Total do dia pela soma dos alimentos: <b className="text-green-400">{plano.calorias_dia} kcal</b></p>
      </div>

      {plano.refeicoes.map((r, i) => (
        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button type="button" onClick={() => setAberta(aberta === i ? null : i)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
            <span className="min-w-0"><span className="block font-semibold text-zinc-100 truncate">{r.nome || 'Refeição sem nome'}</span><span className="block text-xs text-zinc-500">{r.horario} · {r.alimentos.length} alimento(s)</span></span>
            <span className="text-sm font-semibold text-green-400 shrink-0">{r.calorias} kcal</span>
          </button>
          {aberta === i && (
            <div className="px-4 pb-4 flex flex-col gap-3 border-t border-zinc-800 pt-3 animate-fade-up">
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <input className={campo} value={r.nome} onChange={e => mudarRefeicao(i, { nome: e.target.value })} placeholder="Nome da refeição" aria-label="Nome da refeição" />
                <input className={campo} type="time" value={r.horario} onChange={e => mudarRefeicao(i, { horario: e.target.value })} aria-label="Horário" />
              </div>
              <div className="flex flex-col gap-2">
                {r.alimentos.map((a, k) => (
                  <div key={k} className="grid grid-cols-[1fr_auto] gap-2 bg-zinc-800/40 rounded-xl p-2">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <input className={campo} value={a.nome} onChange={e => mudarAlimento(i, k, { nome: e.target.value })} placeholder="Alimento" aria-label="Alimento" />
                      <div className="grid grid-cols-[1fr_88px] gap-1.5">
                        <input className={campo} value={a.quantidade} onChange={e => mudarAlimento(i, k, { quantidade: e.target.value })} placeholder="Quantidade" aria-label="Quantidade" />
                        <label className="relative">
                          <input className={`${campo} pr-9`} inputMode="numeric" value={String(a.calorias ?? 0)} onChange={e => mudarAlimento(i, k, { calorias: inteiro(e.target.value) })} aria-label="Calorias" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">kcal</span>
                        </label>
                      </div>
                    </div>
                    <button type="button" onClick={() => mudarRefeicao(i, { alimentos: r.alimentos.filter((_, j) => j !== k) })} aria-label={`Remover ${a.nome}`}
                      className="p-2 self-start rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => mudarRefeicao(i, { alimentos: [...r.alimentos, { nome: '', quantidade: '', calorias: 0 }] })}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 py-2.5 text-sm font-semibold text-green-400 hover:border-green-500/50"><Plus className="w-4 h-4" />Adicionar alimento</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-2 rounded-lg border border-zinc-800 text-zinc-400 disabled:opacity-30" aria-label="Mover para cima"><ChevronUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === plano.refeicoes.length - 1} className="p-2 rounded-lg border border-zinc-800 text-zinc-400 disabled:opacity-30" aria-label="Mover para baixo"><ChevronDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => { if (confirm(`Remover a refeição "${r.nome}"?`)) { mudar({ ...plano, refeicoes: plano.refeicoes.filter((_, j) => j !== i) }); setAberta(null) } }}
                  className="ml-auto flex items-center gap-1.5 px-3 rounded-lg border border-zinc-800 text-sm text-red-400"><Trash2 className="w-4 h-4" />Remover refeição</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => { mudar({ ...plano, refeicoes: [...plano.refeicoes, { nome: 'Nova refeição', horario: '12:00', calorias: 0, alimentos: [] }] }); setAberta(plano.refeicoes.length) }}
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 py-3 text-sm font-semibold text-green-400 hover:border-green-500/50"><Plus className="w-4 h-4" />Adicionar refeição</button>
    </div>
  )
}
