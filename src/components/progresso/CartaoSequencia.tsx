import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useSequencia } from '../../lib/sequencia'

/** Início: semanas seguidas treinando, treinos desta semana e conquistas. */
export default function CartaoSequencia({ userId }: { userId: string }) {
  const s = useSequencia(userId)
  if (!s) return null
  const obtidas = s.conquistas.filter(c => c.obtida).length
  return (
    <Link to="/conquistas" aria-label="Sequência e conquistas" className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-3xl p-4 animate-fade-up transition">
      <span className="text-3xl leading-none" aria-hidden>{s.semanasSeguidas > 0 ? '🔥' : '🎯'}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-zinc-50">
          {s.semanasSeguidas > 0 ? `${s.semanasSeguidas} ${s.semanasSeguidas === 1 ? 'semana seguida' : 'semanas seguidas'}` : s.total ? 'Comece uma sequência' : 'Faça seu primeiro treino'}
        </span>
        <span className="flex items-center gap-1.5 mt-1" aria-label={`Esta semana: ${s.estaSemana} de ${s.metaSemanal} treinos`}>
          {Array.from({ length: s.metaSemanal }, (_, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < s.estaSemana ? 'bg-green-500' : 'bg-zinc-700'}`} />
          ))}
          <span className="text-xs text-zinc-400 ml-1">{Math.min(s.estaSemana, 99)}/{s.metaSemanal} esta semana · {obtidas} {obtidas === 1 ? 'conquista' : 'conquistas'}</span>
        </span>
      </span>
      <ChevronRight className="w-5 h-5 text-zinc-600" />
    </Link>
  )
}
