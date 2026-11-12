import { Repeat, X } from 'lucide-react'
import { EQUIPAMENTOS, type Equipamento } from '../../data/exercicios'
import type { ExercicioPlano } from '../../lib/treinoModel'
import { alternativas } from '../../lib/trocaBase'
import type { ExercicioCatalogo } from '../../data/exercicios'

/** Alternativas para o mesmo músculo; escolher troca o exercício no plano (séries, repetições e tempos ficam). */
export default function TrocarExercicio({ ex, equipamentos, onTrocar, onFechar }: {
  ex: ExercicioPlano; equipamentos: Equipamento[]; onTrocar: (c: ExercicioCatalogo) => void; onFechar: () => void
}) {
  const opcoes = alternativas(ex, equipamentos)
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onFechar}>
      <div role="dialog" aria-label={`Trocar ${ex.nome}`} onClick={e => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-3 mb-1">
          <Repeat className="w-5 h-5 text-green-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-zinc-50">Trocar {ex.nome}</h2>
            <p className="text-xs text-zinc-500">Mesmo músculo. Séries, repetições e tempos continuam; a carga você ajusta.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1 text-zinc-400"><X className="w-5 h-5" /></button>
        </div>
        {opcoes.length === 0 ? <p className="text-sm text-zinc-500 mt-3">Não achei alternativas no catálogo para este exercício.</p> : (
          <ul className="mt-3 flex flex-col gap-2">
            {opcoes.map(c => (
              <li key={c.id}>
                <button type="button" onClick={() => onTrocar(c)} className="w-full text-left px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 active:scale-[0.99] transition">
                  <span className="block text-sm font-semibold text-zinc-100">{c.nome}</span>
                  <span className="block text-xs text-zinc-500">{EQUIPAMENTOS[c.equipamento]} · {c.tipo === 'composto' ? 'composto' : 'isolado'}{equipamentos.length && !equipamentos.includes(c.equipamento) ? ' · fora do seu equipamento' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
