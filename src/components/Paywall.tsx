import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAcesso } from '../context/AcessoContext'
import { useConfig } from '../lib/config'
import { brl } from '../lib/formatos'

/** Exibido no lugar de um recurso Premium quando o usuário não tem acesso. */
export default function Paywall({ recurso }: { recurso: string }) {
  const { estado } = useAcesso()
  const { config } = useConfig()
  const titulo = estado === 'pagamento_pendente'
    ? 'Pagamento pendente'
    : estado === 'expirada' ? 'Sua assinatura expirou' : 'Recurso Premium'
  const texto = estado === 'pagamento_pendente'
    ? 'Assim que o Mercado Pago confirmar o pagamento, o acesso é liberado automaticamente.'
    : `${recurso} faz parte do ${config?.plano.nome ?? 'plano Premium'}. Seus treinos, dietas e registros continuam salvos e podem ser exportados em Configurações.`
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-green-400" />
      </div>
      <h1 className="text-xl font-bold">{titulo}</h1>
      <p className="text-zinc-400 text-sm mt-2 max-w-sm">{texto}</p>
      {config && (
        <>
          <p className="mt-4 text-2xl font-bold">{brl(config.plano.preco_centavos)}<span className="text-sm text-zinc-500 font-normal">/mês</span></p>
          <p className="text-xs text-zinc-500 mt-1">Cartão, Pix, boleto ou débito{config.plano.preco_anual_centavos ? ` · anual por ${brl(config.plano.preco_anual_centavos)}` : ''}</p>
        </>
      )}
      <Link to="/assinatura" className="mt-6 bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold px-6 py-3 rounded-xl">
        {estado === 'pagamento_pendente' ? 'Ver status do pagamento' : estado === 'expirada' ? 'Assinar novamente' : 'Assinar agora'}
      </Link>
    </div>
  )
}
