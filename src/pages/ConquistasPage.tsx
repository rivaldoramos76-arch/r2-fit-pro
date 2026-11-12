import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSequencia } from '../lib/sequencia'
import { Spinner } from '../components/UI'

export default function ConquistasPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const s = useSequencia(user?.id)
  if (!s) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Conquistas</h1>
          <p className="text-sm text-zinc-500">Meta: {s.metaSemanal} treinos por semana (a do seu plano).</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['🔥', s.semanasSeguidas, 'semanas seguidas'], ['🏁', s.melhorSequencia, 'melhor sequência'], ['💪', s.total, 'treinos']].map(([e, v, r]) => (
          <div key={String(r)} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
            <p className="text-xl" aria-hidden>{e}</p>
            <p className="text-2xl font-bold text-zinc-50 tabular-nums">{v}</p>
            <p className="text-[11px] text-zinc-500">{r}</p>
          </div>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2" aria-label="Lista de conquistas">
        {s.conquistas.map(c => (
          <li key={c.id} className={`rounded-2xl border p-3 ${c.obtida ? 'bg-green-500/5 border-green-500/30' : 'bg-zinc-900 border-zinc-800 opacity-60'}`}>
            <p className={`text-2xl ${c.obtida ? '' : 'grayscale'}`} aria-hidden>{c.emoji}</p>
            <p className="text-sm font-semibold text-zinc-100 mt-1">{c.titulo}</p>
            <p className="text-[11px] text-zinc-500 leading-snug">{c.descricao}</p>
            {!c.obtida && c.progresso && <p className="text-[11px] font-semibold text-zinc-400 mt-1 tabular-nums">{c.progresso}</p>}
            <span className="sr-only">{c.obtida ? 'obtida' : 'ainda não'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
