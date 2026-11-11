import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Check } from 'lucide-react'
import { carregarRotina, salvarRotina } from '../lib/rotina'
import { desfazerVez, marcarVez, pendentesDoTreino, textoDose, vezFeita, type Rotina } from '../lib/rotinaBase'

/**
 * Rotina de ergogênicos ligada ao treino: "antes" na tela do treino e "depois" ao terminar o contador.
 * No modo discreto só diz quantos itens há e leva para a aba Ergo; fora dele, marca como feito ali mesmo.
 */
export default function CartaoRotinaTreino({ userId, momento, escuro = false }: { userId: string; momento: 'antes' | 'depois'; escuro?: boolean }) {
  const [rotina, setRotina] = useState<Rotina | null>(null)
  // Vezes mostradas: as pendentes ao abrir (continuam na lista depois de marcadas, para poder desfazer)
  const [vezes, setVezes] = useState<{ id: string; vez: number }[]>([])
  useEffect(() => {
    carregarRotina(userId).then(r => { setRotina(r); setVezes(pendentesDoTreino(r, momento).map(p => ({ id: p.item.id, vez: p.vez }))) }).catch(() => {})
  }, [userId, momento])
  if (!rotina || !vezes.length) return null

  const quando = momento === 'antes' ? 'antes do treino' : 'depois do treino'
  const caixa = escuro ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-800 bg-zinc-900'
  if (rotina.discreto) {
    return (
      <Link to="/ergogenicos" aria-label={`Rotina ${quando}`} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${caixa}`}>
        <CalendarClock className="w-5 h-5 text-green-400 shrink-0" />
        <span className="flex-1 text-sm text-zinc-200">{vezes.length} {vezes.length === 1 ? 'item' : 'itens'} da sua rotina {quando}</span>
        <span className="text-xs font-semibold text-green-400">Ver</span>
      </Link>
    )
  }
  const trocar = (id: string, k: number) => {
    const nova = { ...rotina, itens: rotina.itens.map(x => (x.id === id ? (vezFeita(x, k) ? desfazerVez(x, k) : marcarVez(x, k)) : x)) }
    setRotina(nova)
    salvarRotina(userId, nova).catch(() => setRotina(rotina))
  }
  return (
    <section aria-label={`Rotina ${quando}`} className={`rounded-2xl border px-4 py-3 text-left ${caixa}`}>
      <p className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 mb-1"><CalendarClock className="w-4 h-4 text-green-400" />Rotina {quando}</p>
      <ul className="flex flex-col divide-y divide-zinc-800/70">
        {vezes.map(({ id, vez }) => {
          const item = rotina.itens.find(x => x.id === id)
          if (!item) return null
          const feito = vezFeita(item, vez)
          return (
            <li key={`${id}-${vez}`} className="flex items-center gap-3 py-2">
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-semibold truncate ${feito ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{item.nome}</span>
                <span className="block text-xs text-zinc-500">{textoDose(item)}</span>
              </span>
              <button type="button" onClick={() => trocar(id, vez)} aria-pressed={feito} aria-label={feito ? `Desfazer ${item.nome}` : `Marcar ${item.nome} como feito`}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${feito ? 'bg-zinc-800 text-zinc-400' : 'bg-green-500 text-zinc-950'}`}>
                <Check className="w-3.5 h-3.5" />{feito ? 'Feito' : 'Marcar'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
