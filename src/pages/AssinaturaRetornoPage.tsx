import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useAcesso } from '../context/AcessoContext'
import { chamarApi } from '../lib/api'
import { Spinner } from '../components/UI'
import type { EstadoAcesso } from '../lib/formatos'

// Página de retorno do checkout. O acesso só é considerado liberado quando o
// servidor confirma o pagamento junto à plataforma de pagamento — nunca pelo simples retorno.
export default function AssinaturaRetornoPage() {
  const [params] = useSearchParams()
  const { recarregar } = useAcesso()
  const [resultado, setResultado] = useState<'verificando' | 'aprovado' | 'pendente' | 'falha'>('verificando')
  const tentativas = useRef(0)
  const statusMp = (params.get('status') ?? params.get('collection_status') ?? '').toLowerCase()

  useEffect(() => {
    let vivo = true
    // Checkout Pro devolve o id do pagamento (Pix, boleto, cartão): o servidor confere se é deste usuário
    const pagamentoId = params.get('payment_id') ?? params.get('collection_id') ?? undefined
    const verificar = async () => {
      tentativas.current++
      try {
        const r = await chamarApi<{ estado: EstadoAcesso }>('billing', { acao: 'sincronizar', payment_id: pagamentoId })
        if (!vivo) return
        if (['ativa', 'tolerancia', 'admin'].includes(r.estado)) {
          await recarregar(); setResultado('aprovado'); return
        }
      } catch { /* tenta de novo */ }
      if (!vivo) return
      if (['rejected', 'failure', 'cancelled', 'null'].includes(statusMp)) { setResultado('falha'); return }
      if (tentativas.current < 8) setTimeout(verificar, 5000)
      else setResultado('pendente')
    }
    verificar()
    return () => { vivo = false }
  }, [params, recarregar, statusMp])

  const telas = {
    verificando: { icon: <Spinner size="lg" />, titulo: 'Confirmando seu pagamento…', texto: 'Estamos consultando a plataforma de pagamento. Isso leva poucos segundos.' },
    aprovado: { icon: <CheckCircle2 className="w-14 h-14 text-green-400" />, titulo: 'Acesso Premium liberado!', texto: 'Pagamento confirmado. Todos os recursos Premium já estão liberados.' },
    pendente: { icon: <Clock className="w-14 h-14 text-yellow-400" />, titulo: 'Pagamento em processamento', texto: statusMp === 'pending' || statusMp === 'in_process' ? 'Se você pagou com boleto, a compensação leva até 3 dias úteis. Pix costuma ser aprovado em instantes. Assim que o pagamento for confirmado, o acesso é liberado automaticamente e você recebe um e-mail.' : 'Ainda não recebemos a confirmação do pagamento. Assim que for aprovado, o acesso é liberado automaticamente e você recebe um e-mail.' },
    falha: { icon: <XCircle className="w-14 h-14 text-red-400" />, titulo: 'Pagamento não concluído', texto: 'O pagamento foi recusado ou cancelado. Nenhuma cobrança foi confirmada. Você pode tentar de novo com outro cartão, Pix ou boleto.' },
  }
  const t = telas[resultado]
  return (
    <div className="flex flex-col items-center text-center py-12 gap-4">
      {t.icon}
      <h1 className="text-xl font-bold">{t.titulo}</h1>
      <p className="text-sm text-zinc-400 max-w-sm">{t.texto}</p>
      {resultado !== 'verificando' && (
        <div className="flex flex-col gap-2 mt-4 w-full max-w-xs">
          <Link to={resultado === 'aprovado' ? '/dashboard' : '/assinatura'} className="bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold px-6 py-3 rounded-xl">
            {resultado === 'aprovado' ? 'Começar a usar' : resultado === 'falha' ? 'Tentar novamente' : 'Ver minha assinatura'}
          </Link>
          {resultado !== 'aprovado' && <Link to="/suporte" className="text-sm text-zinc-400 underline">Precisa de ajuda?</Link>}
        </div>
      )}
    </div>
  )
}
