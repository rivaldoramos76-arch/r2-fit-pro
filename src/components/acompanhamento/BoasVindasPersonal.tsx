import { useEffect, useRef } from 'react'
import { Share2, ShieldCheck, Users, Send, MessageCircle, BadgePercent, X } from 'lucide-react'
import { Button } from '../UI'
import { brl } from '../../lib/formatos'

const PASSOS = [
  { icone: Share2, titulo: 'Convide seus alunos', texto: 'Mande o link ou o código de convite pelo WhatsApp. O aluno cria a conta (com 7 dias grátis) e aceita.' },
  { icone: ShieldCheck, titulo: 'O aluno escolhe o que compartilhar', texto: 'Treinos, diário alimentar, peso e se você pode enviar treinos e dietas. Ele muda isso quando quiser.' },
  { icone: Users, titulo: 'Acompanhe em "Meus alunos"', texto: 'Quem precisa de atenção aparece primeiro: sem treinar, diário parado, acima da meta. Veja a semana, o diário e o peso de cada um.' },
  { icone: Send, titulo: 'Envie treinos, dietas e metas', texto: 'Mande um treino ou dieta da sua conta, edite o treino do aluno ou ajuste a meta de calorias e macros. Ele recebe na hora.' },
  { icone: MessageCircle, titulo: 'Converse pelo app', texto: 'Mensagens com notificação no celular, junto do histórico do que você enviou.' },
]

/** Explica o modo personal: descontos por aluno pagante e o que dá para fazer. */
export default function BoasVindasPersonal({ precoCentavos, aoFechar, aoConvidar }: { precoCentavos: number | null; aoFechar: () => void; aoConvidar: () => void }) {
  const fechar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    fechar.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aoFechar])
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 animate-fade-up">
        <div className="flex items-start justify-between gap-3">
          <h2 id="bv-titulo" className="text-xl font-bold text-zinc-50">Modo personal ativado 🎉</h2>
          <button ref={fechar} onClick={aoFechar} aria-label="Fechar" className="p-1.5 -m-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="mt-4 rounded-2xl bg-green-500/10 border border-green-500/25 p-4">
          <p className="font-semibold text-green-200 flex items-center gap-2"><BadgePercent className="w-5 h-5" />Seus alunos pagam a sua mensalidade</p>
          <p className="text-sm text-zinc-300 mt-1.5">Cada aluno que assina o Premium tira <b>20%</b> da sua mensalidade{precoCentavos ? <> de {brl(precoCentavos)}</> : null}. Com <b>5 alunos assinando, você não paga nada</b>.</p>
          <div className="mt-3 grid grid-cols-5 gap-1 text-center" aria-hidden>
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className="rounded-lg bg-zinc-950/60 py-1.5">
                <p className="text-[10px] text-zinc-500">{n} aluno{n > 1 ? 's' : ''}</p>
                <p className={`text-xs font-bold ${n === 5 ? 'text-green-400' : 'text-zinc-200'}`}>{n === 5 ? 'grátis' : `-${n * 20}%`}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">Só contam alunos com o Premium pago em dia. A conta é refeita todo mês, antes da cobrança.</p>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          {PASSOS.map(({ icone: Icone, titulo, texto }, i) => (
            <li key={titulo} className="flex gap-3">
              <span className="w-9 h-9 rounded-xl bg-zinc-800 text-green-400 flex items-center justify-center shrink-0"><Icone className="w-5 h-5" /></span>
              <span>
                <span className="block text-sm font-semibold text-zinc-100">{i + 1}. {titulo}</span>
                <span className="block text-xs text-zinc-400 mt-0.5">{texto}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={aoFechar}>Entendi</Button>
          <Button onClick={aoConvidar}><Share2 className="w-4 h-4" />Convidar aluno</Button>
        </div>
      </div>
    </div>
  )
}
