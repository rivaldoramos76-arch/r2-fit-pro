import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { brl, dataBR, dataHoraBR, ROTULO_PAGAMENTO } from '../../lib/formatos'
import { Badge, Select } from '../../components/UI'
import { Erro, Tabela, Td, msgErro } from './comum'

async function mapaEmails(ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter(Boolean))] as string[]
  if (!unicos.length) return {} as Record<string, string>
  const { data } = await supabase.from('profiles').select('id, email').in('id', unicos)
  return Object.fromEntries((data ?? []).map(p => [p.id, p.email ?? '—']))
}

const COR_ASSINATURA: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'zinc'> = { ativa: 'green', pendente: 'yellow', inadimplente: 'red', cancelada: 'blue', expirada: 'zinc' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export function Assinaturas() {
  const [lista, setLista] = useState<Linha[]>([])
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [filtro, setFiltro] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => {
    let q = supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(300)
    if (filtro) q = q.eq('status', filtro)
    q.then(async ({ data, error }) => {
      if (error) return setErro(msgErro(error))
      setLista(data ?? []); setEmails(await mapaEmails((data ?? []).map(s => s.user_id)))
    })
  }, [filtro])
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs"><Select label="Status" value={filtro} onChange={e => setFiltro(e.target.value)}>
        <option value="">Todos</option>{Object.keys(COR_ASSINATURA).map(s => <option key={s} value={s}>{s}</option>)}
      </Select></div>
      <Erro texto={erro} />
      <Tabela cabecalho={['Cliente', 'Status', 'Status MP', 'Preço', 'Início', 'Pago até', 'Próx. cobrança', 'ID MP']} vazio={lista.length === 0}>
        {lista.map(s => (
          <tr key={s.id}>
            <Td className="break-all">{s.user_id ? emails[s.user_id] ?? s.user_id : <i className="text-zinc-500">conta excluída</i>}</Td>
            <Td><Badge variant={COR_ASSINATURA[s.status] ?? 'zinc'}>{s.status}</Badge></Td>
            <Td>{s.provider_status ?? '—'}</Td>
            <Td>{brl(s.preco_centavos)}</Td>
            <Td>{dataBR(s.iniciada_em)}</Td>
            <Td>{dataBR(s.periodo_atual_fim)}</Td>
            <Td>{dataBR(s.proxima_cobranca)}</Td>
            <Td className="text-xs text-zinc-500 break-all">{s.provider_subscription_id ?? '—'}</Td>
          </tr>
        ))}
      </Tabela>
    </div>
  )
}

export function Pagamentos() {
  const [lista, setLista] = useState<Linha[]>([])
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [filtro, setFiltro] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => {
    let q = supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(300)
    if (filtro) q = q.eq('status', filtro)
    q.then(async ({ data, error }) => {
      if (error) return setErro(msgErro(error))
      setLista(data ?? []); setEmails(await mapaEmails((data ?? []).map(p => p.user_id)))
    })
  }, [filtro])
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs"><Select label="Status" value={filtro} onChange={e => setFiltro(e.target.value)}>
        <option value="">Todos</option>{Object.keys(ROTULO_PAGAMENTO).map(s => <option key={s} value={s}>{ROTULO_PAGAMENTO[s].texto}</option>)}
      </Select></div>
      <Erro texto={erro} />
      <Tabela cabecalho={['Data', 'Cliente', 'Valor', 'Status', 'Detalhe', 'Método', 'ID MP']} vazio={lista.length === 0}>
        {lista.map(p => (
          <tr key={p.id}>
            <Td className="whitespace-nowrap">{dataHoraBR(p.pago_em ?? p.created_at)}</Td>
            <Td className="break-all">{p.user_id ? emails[p.user_id] ?? p.user_id : <i className="text-zinc-500">conta excluída</i>}</Td>
            <Td>{brl(p.valor_centavos)}{p.valor_estornado_centavos > 0 && <span className="block text-xs text-blue-300">estorno {brl(p.valor_estornado_centavos)}</span>}</Td>
            <Td><Badge variant={ROTULO_PAGAMENTO[p.status]?.cor ?? 'zinc'}>{ROTULO_PAGAMENTO[p.status]?.texto ?? p.status}</Badge></Td>
            <Td className="text-xs">{p.status_detalhe ?? '—'}</Td>
            <Td className="text-xs">{p.metodo ?? '—'}</Td>
            <Td className="text-xs text-zinc-500">{p.provider_payment_id}</Td>
          </tr>
        ))}
      </Tabela>
    </div>
  )
}
