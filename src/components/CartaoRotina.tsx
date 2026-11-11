import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { carregarRotina } from '../lib/rotina'
import { pendentesHoje, situacao, type Rotina } from '../lib/rotinaBase'

/** Início: o que da rotina de ergogênicos é para hoje. No modo discreto, sem os nomes. */
export default function CartaoRotina({ userId }: { userId: string }) {
  const [rotina, setRotina] = useState<Rotina | null>(null)
  useEffect(() => { carregarRotina(userId).then(setRotina).catch(() => {}) }, [userId])
  if (!rotina) return null
  const hoje = pendentesHoje(rotina)
  if (!hoje.length) return null
  const atrasados = hoje.filter(i => situacao(i).tipo === 'atrasado').length
  const texto = rotina.discreto
    ? `${hoje.length} ${hoje.length === 1 ? 'item' : 'itens'} da sua rotina para hoje`
    : hoje.map(i => i.nome).join(', ')
  return (
    <Link to="/ergogenicos" aria-label="Rotina de hoje" className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 animate-fade-up">
      <CalendarClock className="w-5 h-5 text-green-400 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-zinc-100 truncate">{texto}</span>
        <span className="block text-xs text-zinc-500">{atrasados ? `${atrasados} atrasado${atrasados > 1 ? 's' : ''} · ` : ''}toque para marcar como feito</span>
      </span>
      <ChevronRight className="w-4 h-4 text-zinc-600" />
    </Link>
  )
}
