import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { brl, dataBR, ROTULO_PAGAMENTO } from '../lib/formatos'
import { Badge, Card, EmptyState, Spinner } from '../components/UI'

interface Pagamento {
  id: string
  status: string
  status_detalhe: string | null
  valor_centavos: number
  valor_estornado_centavos: number
  metodo: string | null
  pago_em: string | null
  comprovante_url: string | null
  provider_payment_id: string
  created_at: string
}

const metodoLegivel = (m: string | null) => {
  if (!m) return '—'
  const [tipo, bandeira] = m.split(':')
  const tipos: Record<string, string> = { credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', account_money: 'Saldo Mercado Pago', ticket: 'Boleto', bank_transfer: 'Pix/Transferência' }
  return [tipos[tipo] ?? tipo, bandeira?.toUpperCase()].filter(Boolean).join(' · ')
}

export default function PagamentosPage() {
  const { user } = useAuth()
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!user) return
    supabase.from('payments')
      .select('id, status, status_detalhe, valor_centavos, valor_estornado_centavos, metodo, pago_em, comprovante_url, provider_payment_id, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) setErro('Não foi possível carregar seus pagamentos. Verifique sua conexão.')
        setPagamentos((data ?? []) as Pagamento[])
        setCarregando(false)
      })
  }, [user])

  if (carregando) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Pagamentos e Faturas</h1>
      {erro && <p role="alert" className="text-red-400 text-sm">{erro}</p>}
      {pagamentos.length === 0 && !erro ? (
        <EmptyState icon="🧾" title="Nenhum pagamento ainda" description="Quando você assinar, as cobranças confirmadas pelo Mercado Pago aparecerão aqui." />
      ) : (
        <div className="flex flex-col gap-3">
          {pagamentos.map(p => {
            const r = ROTULO_PAGAMENTO[p.status] ?? { texto: p.status, cor: 'zinc' as const }
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{brl(p.valor_centavos)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{dataBR(p.pago_em ?? p.created_at)} · {metodoLegivel(p.metodo)}</p>
                    {p.valor_estornado_centavos > 0 && <p className="text-xs text-blue-300 mt-1">Estornado: {brl(p.valor_estornado_centavos)}</p>}
                    <p className="text-[11px] text-zinc-600 mt-1">Transação Mercado Pago nº {p.provider_payment_id}</p>
                  </div>
                  <Badge variant={r.cor}>{r.texto}</Badge>
                </div>
                {p.comprovante_url && (
                  <a href={p.comprovante_url} target="_blank" rel="noopener noreferrer" className="text-sm text-green-400 underline mt-2 inline-block">Ver comprovante</a>
                )}
              </Card>
            )
          })}
        </div>
      )}
      <Card>
        <p className="text-sm text-zinc-400">
          Os comprovantes das cobranças ficam disponíveis na sua conta do Mercado Pago, em <b>Atividade</b>. A nota fiscal de serviço é emitida pela empresa responsável conforme a legislação municipal.
        </p>
        <a href="https://www.mercadopago.com.br/activities" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-green-400 mt-2">
          <ExternalLink className="w-4 h-4" /> Abrir atividades no Mercado Pago
        </a>
      </Card>
    </div>
  )
}
