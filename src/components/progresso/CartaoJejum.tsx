import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Timer } from 'lucide-react'
import { carregarJejum } from '../../lib/jejum'
import { duracao, situacaoJejum, type JejumAtivo } from '../../lib/jejumBase'

/** Início: jejum em andamento (só aparece quando há um). */
export default function CartaoJejum({ userId }: { userId: string }) {
  const [ativo, setAtivo] = useState<JejumAtivo | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => { carregarJejum(userId).then(d => setAtivo(d.ativo)).catch(() => {}) }, [userId])
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60_000); return () => clearInterval(t) }, [])
  if (!ativo) return null
  const s = situacaoJejum(ativo)
  return (
    <Link to="/jejum" aria-label="Jejum em andamento" className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 animate-fade-up">
      <Timer className="w-5 h-5 text-green-400 shrink-0" />
      <span className="flex-1 text-sm text-zinc-200">Jejum: <b>{duracao(s.horas * 3_600_000)}</b> de {ativo.horas}h</span>
      <span className="text-xs text-zinc-400">{s.concluido ? 'concluído 🎉' : `até ${s.fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span>
    </Link>
  )
}
