import { useState } from 'react'
import { TrendingUp, Trophy, X } from 'lucide-react'
import type { ExercicioPlano } from '../../lib/treinoModel'
import { resumoCarga, textoKg, type PontoCarga } from '../../lib/cargasBase'
import GraficoPeso from '../progresso/GraficoPeso'

const dataCurta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

/** Linha do card: última vez, recorde e sugestão de carga (tocar aplica). */
export function LinhaCarga({ ex, pontos, hoje, onAplicar, onAbrir }: {
  ex: ExercicioPlano; pontos: PontoCarga[] | undefined; hoje: string
  onAplicar: (carga: string) => void; onAbrir: () => void
}) {
  const r = resumoCarga(pontos, ex.series, hoje)
  if (!r.ultima) return null
  const u = r.ultima
  const jaAplicada = r.sugestao && ex.carga && ex.carga.replace(/\s/g, '') === r.sugestao.carga.replace(/\s/g, '')
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px]">
      <button type="button" onClick={onAbrir} aria-label={`Evolução de carga de ${ex.nome}`} className="flex items-center gap-1 text-zinc-400">
        <TrendingUp className="w-3.5 h-3.5 text-green-400" />
        Última ({dataCurta(u.data)}): <b className="text-zinc-200">{u.carga || 'sem carga'}</b>{u.reps ? ` · ${u.reps}` : ''} · {u.series} {u.series === 1 ? 'série' : 'séries'}
      </button>
      {r.recorde && <span className="flex items-center gap-1 text-amber-400/90"><Trophy className="w-3 h-3" />{textoKg(r.recorde.kg)}</span>}
      {r.sugestao && !jaAplicada && (
        <button type="button" onClick={() => onAplicar(r.sugestao!.carga)} title={r.sugestao.texto}
          className="px-2 py-0.5 rounded-md bg-green-500/15 text-green-400 font-semibold">Tentar {r.sugestao.carga}</button>
      )}
    </div>
  )
}

/** Janela com o gráfico e a lista das vezes que o exercício foi feito. */
export function JanelaEvolucao({ ex, pontos, onFechar }: { ex: ExercicioPlano; pontos: PontoCarga[]; onFechar: () => void }) {
  const [todas, setTodas] = useState(false)
  const comKg = pontos.filter(p => p.kg != null).map(p => ({ data: p.data, peso_kg: p.kg! }))
  const lista = [...pontos].reverse()
  const recorde = comKg.reduce((m, p) => Math.max(m, p.peso_kg), 0)
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onFechar}>
      <div role="dialog" aria-label={`Evolução de ${ex.nome}`} onClick={e => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-zinc-50">{ex.nome}</h2>
            <p className="text-xs text-zinc-500">{pontos.length} {pontos.length === 1 ? 'vez' : 'vezes'}{recorde ? ` · recorde ${textoKg(recorde)}` : ''}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1 text-zinc-400"><X className="w-5 h-5" /></button>
        </div>
        {comKg.length > 1 ? <GraficoPeso pontos={comKg} /> : <p className="text-sm text-zinc-500">O gráfico aparece a partir de 2 treinos com carga.</p>}
        <ul className="mt-3 divide-y divide-zinc-800/70">
          {(todas ? lista : lista.slice(0, 8)).map(p => (
            <li key={p.data} className="flex items-center justify-between py-2 text-sm">
              <span className="text-zinc-400">{dataCurta(p.data)}</span>
              <span className="text-zinc-200">{p.carga || 'sem carga'}{p.reps ? ` · ${p.reps}` : ''} · {p.series} {p.series === 1 ? 'série' : 'séries'}
                {p.kg != null && p.kg === recorde && <Trophy className="inline w-3.5 h-3.5 ml-1 -mt-0.5 text-amber-400" />}</span>
            </li>
          ))}
        </ul>
        {lista.length > 8 && !todas && <button type="button" onClick={() => setTodas(true)} className="text-xs font-semibold text-green-400 mt-2">Ver todas</button>}
      </div>
    </div>
  )
}
