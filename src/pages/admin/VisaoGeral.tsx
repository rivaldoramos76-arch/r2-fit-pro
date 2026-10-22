import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { brl } from '../../lib/formatos'
import { Spinner } from '../../components/UI'
import { Erro, msgErro } from './comum'

type Metricas = Record<string, number | Record<string, number>>

function Cartao({ titulo, valor, nota, destaque }: { titulo: string; valor: string | number; nota?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border ${destaque ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
      <p className="text-xs text-zinc-400">{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
      {nota && <p className="text-xs text-zinc-500 mt-1">{nota}</p>}
    </div>
  )
}

export default function VisaoGeral() {
  const [m, setM] = useState<Metricas | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    supabase.rpc('admin_metricas').then(({ data, error }) => { if (error) setErro(msgErro(error)); else setM(data as Metricas) })
  }, [])
  if (erro) return <Erro texto={erro} />
  if (!m) return <div className="flex justify-center py-10"><Spinner /></div>
  const n = (k: string) => Number(m[k] ?? 0)
  const porStatus = (m.assinaturas_por_status ?? {}) as Record<string, number>
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-semibold mb-3">Receita</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao destaque titulo="Receita recorrente mensal (MRR)" valor={brl(n('mrr_centavos'))} nota="Assinaturas ativas e pagas" />
          <Cartao titulo="Recebido no mês" valor={brl(n('recebido_mes_centavos'))} nota={`Total histórico: ${brl(n('recebido_total_centavos'))}`} />
          <Cartao titulo="Pendente" valor={brl(n('pendente_centavos'))} nota="Pagamentos aguardando confirmação" />
          <Cartao titulo="Estornado / em disputa" valor={brl(n('estornado_centavos'))} />
          <Cartao titulo="Projetado (próximo ciclo)" valor={brl(n('projetado_proximo_mes_centavos'))} nota="Ativas + inadimplentes recentes, sem canceladas" />
          <Cartao titulo="Falhas de cobrança (30 dias)" valor={n('falhas_30d')} />
        </div>
      </section>
      <section>
        <h2 className="font-semibold mb-3">Clientes</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao titulo="Usuários cadastrados" valor={n('usuarios_total')} nota={`${n('usuarios_30d')} nos últimos 30 dias`} />
          <Cartao titulo="Assinantes com acesso" valor={n('assinantes_ativos')} />
          <Cartao titulo="Chamados em aberto" valor={n('tickets_abertos')} />
          <Cartao titulo="Pedidos LGPD em aberto" valor={n('privacidade_abertas')} />
        </div>
        <p className="text-xs text-zinc-500 mt-3">Assinaturas por status: {Object.entries(porStatus).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhuma'}</p>
      </section>
      <section>
        <h2 className="font-semibold mb-3">Operação</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao titulo="Webhooks com erro (7 dias)" valor={n('webhooks_erro_7d')} />
          <Cartao titulo="E-mails não enviados" valor={n('emails_pendentes')} nota="Pendentes, com erro ou sem provedor" />
        </div>
      </section>
    </div>
  )
}
