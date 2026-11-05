import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { chamarApi, ErroApi } from '../lib/api'
import { diasAvisoRenovacao, textoVencimento } from '../lib/renovacao'
import { Button } from './UI'

/** Aviso alguns dias antes do vencimento para quem pagou no débito (a renovação não é automática). */
export default function AvisoRenovacao({ userId }: { userId: string }) {
  const [dias, setDias] = useState<number | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: sub } = await supabase.from('subscriptions').select('id, status, periodo_atual_fim')
        .eq('user_id', userId).eq('provider', 'asaas').eq('modalidade', 'recorrente').in('status', ['ativa', 'inadimplente'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!sub) return
      const { data: pag } = await supabase.from('payments').select('metodo')
        .eq('subscription_id', sub.id).eq('status', 'aprovado').order('pago_em', { ascending: false }).limit(1).maybeSingle()
      if (vivo) setDias(diasAvisoRenovacao({ metodo: pag?.metodo ?? null, status: sub.status, fim: sub.periodo_atual_fim }))
    })().catch(() => {})
    return () => { vivo = false }
  }, [userId])

  if (dias === null) return null
  const pagar = async () => {
    setAbrindo(true); setMsg('')
    try {
      const r = await chamarApi<{ url: string | null }>('billing', { acao: 'asaas_fatura' })
      if (r.url) { window.location.href = r.url; return }
      setMsg('A fatura deste mês ainda não está disponível. Ela aparece aqui perto do vencimento; se precisar, fale com o suporte.')
    } catch (e) { setMsg(e instanceof ErroApi ? e.message : 'Não foi possível abrir a fatura. Tente de novo.') }
    setAbrindo(false)
  }
  return (
    <section aria-label="Renovação da assinatura" className={`rounded-2xl border p-4 flex flex-col gap-3 ${dias < 0 ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
      <div className="flex items-start gap-3">
        <CalendarClock className={`w-6 h-6 shrink-0 ${dias < 0 ? 'text-red-300' : 'text-amber-300'}`} />
        <div>
          <p className="font-semibold text-zinc-50">{textoVencimento(dias)}</p>
          <p className="text-sm text-zinc-300 mt-0.5">Como o último pagamento não foi no cartão de crédito, a renovação não é automática. Pague a fatura do mês com Pix, boleto ou cartão para não perder o acesso.</p>
        </div>
      </div>
      <Button loading={abrindo} onClick={pagar}>Pagar a fatura</Button>
      {msg && <p className="text-xs text-zinc-300">{msg}</p>}
    </section>
  )
}
