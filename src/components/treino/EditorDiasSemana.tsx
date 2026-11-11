import { useState } from 'react'
import { DIAS_SEMANA, type PlanoTreino } from '../../lib/treinoModel'
import { semanaDoPlano } from '../../lib/semanaBase'

/** Dias da semana de treino: cada dia com o treino (A, B...) ou descanso. Usado na primeira vez e para editar. */
export default function EditorDiasSemana({ plano, salvando, textoSalvar = 'Salvar dias', onSalvar, onCancelar, textoCancelar = 'Cancelar' }: {
  plano: PlanoTreino
  salvando?: boolean
  textoSalvar?: string
  onSalvar: (semana: (string | null)[]) => void
  onCancelar?: () => void
  textoCancelar?: string
}) {
  const [semana, setSemana] = useState(() => semanaDoPlano(plano))
  const letras = plano.dias.map(d => d.letra)
  const total = semana.filter(Boolean).length
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {DIAS_SEMANA.map((dia, i) => (
          <li key={dia} className="flex items-center gap-2">
            <span className="text-sm text-zinc-300 w-20 shrink-0">{dia}</span>
            <select aria-label={`Treino de ${dia}`} value={semana[i] ?? ''} onChange={e => setSemana(s => s.map((x, j) => (j === i ? e.target.value || null : x)))}
              className={`flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${semana[i] ? 'text-green-400 font-semibold' : 'text-zinc-500'}`}>
              <option value="">Descanso</option>
              {letras.map(l => { const foco = plano.dias.find(d => d.letra === l)?.foco; return <option key={l} value={l}>Treino {l}{foco ? ` · ${foco}` : ''}</option> })}
            </select>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">{total} {total === 1 ? 'dia' : 'dias'} de treino por semana. Dá para mudar depois na tela do treino.</p>
      <div className="flex gap-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">{textoCancelar}</button>
        )}
        <button type="button" disabled={!total || salvando} onClick={() => onSalvar(semana)}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-green-500 text-zinc-950 disabled:opacity-50">{salvando ? 'Salvando…' : textoSalvar}</button>
      </div>
    </div>
  )
}
