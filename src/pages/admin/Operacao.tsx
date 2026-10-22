import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { chamarApi, ErroApi } from '../../lib/api'
import { dataHoraBR } from '../../lib/formatos'
import { Badge, Button, Select, Textarea } from '../../components/UI'
import { Erro, Tabela, Td, msgErro } from './comum'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
const COR: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'zinc'> = {
  processado: 'green', enviado: 'green', recebido: 'yellow', pendente: 'yellow', ignorado: 'zinc', erro: 'red', rejeitado: 'red', sem_provedor: 'yellow',
  aberto: 'yellow', em_andamento: 'blue', respondido: 'green', fechado: 'zinc', aberta: 'yellow', concluida: 'green', recusada: 'red',
}

export function Integracoes() {
  const [eventos, setEventos] = useState<Linha[]>([])
  const [emails, setEmails] = useState<Linha[]>([])
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(() => {
    supabase.from('webhook_events').select('id, created_at, topico, acao, resource_id, status, assinatura_valida, tentativas, erro')
      .order('created_at', { ascending: false }).limit(100).then(({ data, error }) => { if (error) setErro(msgErro(error)); else setEventos(data ?? []) })
    supabase.from('email_outbox').select('id, created_at, destinatario, modelo, status, tentativas, erro, enviado_em')
      .order('created_at', { ascending: false }).limit(100).then(({ data }) => setEmails(data ?? []))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const reprocessar = async () => {
    setProcessando(true); setInfo(''); setErro('')
    try {
      const r = await chamarApi<{ enviados: number; falhas: number; semProvedor: number }>('billing', { acao: 'processar_emails', reenviar_sem_provedor: true })
      setInfo(`Enviados: ${r.enviados} · Falhas: ${r.falhas} · Sem provedor configurado: ${r.semProvedor}`)
      carregar()
    } catch (e) { setErro(e instanceof ErroApi ? e.message : 'Falha ao processar') } finally { setProcessando(false) }
  }

  return (
    <div className="flex flex-col gap-6">
      <Erro texto={erro} />
      <section>
        <h2 className="font-semibold mb-3">Eventos do Mercado Pago (webhooks)</h2>
        <Tabela cabecalho={['Recebido', 'Tópico', 'Ação', 'Recurso', 'Status', 'Assinatura', 'Tent.', 'Erro']} vazio={eventos.length === 0}>
          {eventos.map(e => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap">{dataHoraBR(e.created_at)}</Td><Td>{e.topico || '—'}</Td><Td>{e.acao || '—'}</Td>
              <Td className="text-xs break-all">{e.resource_id ?? '—'}</Td>
              <Td><Badge variant={COR[e.status] ?? 'zinc'}>{e.status}</Badge></Td>
              <Td>{e.assinatura_valida ? 'válida' : 'inválida'}</Td><Td>{e.tentativas}</Td>
              <Td className="text-xs text-red-300 max-w-xs break-words">{e.erro ?? ''}</Td>
            </tr>
          ))}
        </Tabela>
      </section>
      <section>
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-semibold">E-mails transacionais</h2>
          <Button size="sm" variant="secondary" onClick={reprocessar} loading={processando}>Reenviar pendentes</Button>
        </div>
        {info && <p className="text-sm text-zinc-300 mb-2">{info}</p>}
        <Tabela cabecalho={['Criado', 'Destinatário', 'Modelo', 'Status', 'Tent.', 'Erro']} vazio={emails.length === 0}>
          {emails.map(m => (
            <tr key={m.id}>
              <Td className="whitespace-nowrap">{dataHoraBR(m.created_at)}</Td><Td className="break-all">{m.destinatario}</Td><Td>{m.modelo}</Td>
              <Td><Badge variant={COR[m.status] ?? 'zinc'}>{m.status}</Badge></Td><Td>{m.tentativas}</Td>
              <Td className="text-xs text-red-300 max-w-xs break-words">{m.erro ?? ''}</Td>
            </tr>
          ))}
        </Tabela>
      </section>
    </div>
  )
}

export function Suporte() {
  const [lista, setLista] = useState<Linha[]>([])
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [filtro, setFiltro] = useState('aberto')
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(200)
    if (filtro) q = q.eq('status', filtro)
    const { data, error } = await q
    if (error) return setErro(msgErro(error))
    setLista(data ?? [])
    const ids = [...new Set((data ?? []).map(t => t.user_id).filter(Boolean))]
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, email').in('id', ids)
      setEmails(Object.fromEntries((p ?? []).map(x => [x.id, x.email])))
    }
  }, [filtro])
  useEffect(() => { carregar() }, [carregar])

  const responder = async (id: string, status: string) => {
    const resposta = respostas[id]?.trim()
    const { error } = await supabase.from('support_tickets').update(resposta ? { resposta, status } : { status }).eq('id', id)
    if (error) setErro(msgErro(error)); else { setRespostas(r => ({ ...r, [id]: '' })); carregar() }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs"><Select label="Status" value={filtro} onChange={e => setFiltro(e.target.value)}>
        <option value="">Todos</option><option value="aberto">Abertos</option><option value="em_andamento">Em andamento</option>
        <option value="respondido">Respondidos</option><option value="fechado">Fechados</option>
      </Select></div>
      <Erro texto={erro} />
      {lista.length === 0 && <p className="text-sm text-zinc-500">Nenhum chamado.</p>}
      {lista.map(t => (
        <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex justify-between gap-3 flex-wrap">
            <div><p className="font-semibold">{t.assunto}</p><p className="text-xs text-zinc-500">{dataHoraBR(t.created_at)} · {t.categoria} · {emails[t.user_id] ?? t.user_id}</p></div>
            <Badge variant={COR[t.status] ?? 'zinc'}>{t.status}</Badge>
          </div>
          <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap">{t.mensagem}</p>
          {t.resposta && <p className="text-sm text-green-300 mt-2 whitespace-pre-wrap border-l-2 border-green-500/40 pl-3">{t.resposta}</p>}
          <div className="mt-3 flex flex-col gap-2">
            <Textarea label="Resposta" rows={3} value={respostas[t.id] ?? ''} onChange={e => setRespostas(r => ({ ...r, [t.id]: e.target.value }))} maxLength={5000} />
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => responder(t.id, 'respondido')} disabled={!respostas[t.id]?.trim()}>Enviar resposta</Button>
              <Button size="sm" variant="secondary" onClick={() => responder(t.id, 'em_andamento')}>Em andamento</Button>
              <Button size="sm" variant="ghost" onClick={() => responder(t.id, 'fechado')}>Fechar</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Privacidade() {
  const [lista, setLista] = useState<Linha[]>([])
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => {
    supabase.from('privacy_requests').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) setErro(msgErro(error)); else setLista(data ?? []) })
  }, [])
  useEffect(() => { carregar() }, [carregar])
  const atualizar = async (id: string, status: string) => {
    const { error } = await supabase.from('privacy_requests').update({ status, concluida_em: status === 'aberta' ? null : new Date().toISOString() }).eq('id', id)
    if (error) setErro(msgErro(error)); else carregar()
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">Prazo de resposta recomendado: 15 dias (LGPD art. 19). Exportação e exclusão de conta são atendidas automaticamente pelo app.</p>
      <Erro texto={erro} />
      <Tabela cabecalho={['Data', 'Titular', 'Tipo', 'Detalhes', 'Status', 'Ações']} vazio={lista.length === 0}>
        {lista.map(p => (
          <tr key={p.id}>
            <Td className="whitespace-nowrap">{dataHoraBR(p.created_at)}</Td><Td className="break-all">{p.email ?? '—'}</Td><Td>{p.tipo}</Td>
            <Td className="text-xs max-w-xs whitespace-pre-wrap">{p.detalhes ?? ''}</Td>
            <Td><Badge variant={COR[p.status] ?? 'zinc'}>{p.status}</Badge></Td>
            <Td>{p.status === 'aberta' && <div className="flex gap-1"><Button size="sm" onClick={() => atualizar(p.id, 'concluida')}>Concluir</Button><Button size="sm" variant="ghost" onClick={() => atualizar(p.id, 'recusada')}>Recusar</Button></div>}</Td>
          </tr>
        ))}
      </Tabela>
    </div>
  )
}

export function Auditoria() {
  const [lista, setLista] = useState<Linha[]>([])
  const [erro, setErro] = useState('')
  useEffect(() => {
    supabase.from('audit_logs').select('id, created_at, actor_id, acao, alvo, detalhes').order('created_at', { ascending: false }).limit(300)
      .then(({ data, error }) => { if (error) setErro(msgErro(error)); else setLista(data ?? []) })
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <Erro texto={erro} />
      <Tabela cabecalho={['Data', 'Ação', 'Alvo', 'Autor', 'Detalhes']} vazio={lista.length === 0}>
        {lista.map(a => (
          <tr key={a.id}>
            <Td className="whitespace-nowrap">{dataHoraBR(a.created_at)}</Td><Td>{a.acao}</Td>
            <Td className="text-xs break-all">{a.alvo ?? '—'}</Td><Td className="text-xs break-all text-zinc-500">{a.actor_id ?? 'sistema'}</Td>
            <Td><details><summary className="text-xs text-zinc-400 cursor-pointer">ver</summary><pre className="text-[11px] text-zinc-400 whitespace-pre-wrap max-w-md">{JSON.stringify(a.detalhes, null, 2)}</pre></details></Td>
          </tr>
        ))}
      </Tabela>
    </div>
  )
}
