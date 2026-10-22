import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useConfig, ou } from '../lib/config'
import { FAQ_SUPORTE } from '../lib/faq'
import { dataHoraBR } from '../lib/formatos'
import { Badge, Button, Card, Input, Select, Textarea } from '../components/UI'

const CATEGORIAS = [
  ['conta', 'Conta e login'], ['assinatura', 'Assinatura'], ['pagamento', 'Pagamento e cobrança'],
  ['treino', 'Treinos'], ['dieta', 'Dieta'], ['calorias', 'Contador de calorias'],
  ['privacidade', 'Privacidade e dados (LGPD)'], ['bug', 'Erro no aplicativo'], ['outro', 'Outro assunto'],
] as const

const STATUS: Record<string, { texto: string; cor: 'green' | 'yellow' | 'blue' | 'zinc' }> = {
  aberto: { texto: 'Aberto', cor: 'yellow' }, em_andamento: { texto: 'Em andamento', cor: 'blue' },
  respondido: { texto: 'Respondido', cor: 'green' }, fechado: { texto: 'Fechado', cor: 'zinc' },
}

interface Chamado { id: string; categoria: string; assunto: string; mensagem: string; status: string; resposta: string | null; respondido_em: string | null; created_at: string }

/** Conteúdo da Central de Ajuda; usado dentro do layout do app ou do layout público. */
export default function SuportePage() {
  const { user } = useAuth()
  const { config } = useConfig()
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [categoria, setCategoria] = useState('conta')
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const carregar = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('support_tickets')
      .select('id, categoria, assunto, mensagem, status, resposta, respondido_em, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
    setChamados((data ?? []) as Chamado[])
  }, [user])

  useEffect(() => { carregar() }, [carregar])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(''); setOk('')
    if (assunto.trim().length < 3) { setErro('Informe um assunto (mínimo 3 caracteres).'); return }
    if (mensagem.trim().length < 10) { setErro('Descreva o problema com pelo menos 10 caracteres.'); return }
    setEnviando(true)
    const { error } = await supabase.from('support_tickets').insert({
      user_id: user!.id, categoria, assunto: assunto.trim().slice(0, 150), mensagem: mensagem.trim().slice(0, 5000),
    })
    setEnviando(false)
    if (error) { setErro('Não foi possível enviar. Verifique sua conexão e tente novamente.'); return }
    setAssunto(''); setMensagem(''); setOk('Chamado enviado! Responderemos por aqui e, se necessário, por e-mail.')
    carregar()
  }

  const fechar = async (id: string) => {
    await supabase.from('support_tickets').update({ status: 'fechado' }).eq('id', id)
    carregar()
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold">Ajuda e Suporte</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Contato: {ou(config?.empresa.email_suporte)}{config?.textos.horario_suporte ? ` · ${config.textos.horario_suporte}` : ''}
        </p>
      </div>

      <section aria-labelledby="faq-suporte">
        <h2 id="faq-suporte" className="font-semibold mb-3">Perguntas frequentes</h2>
        <div className="flex flex-col gap-2">
          {FAQ_SUPORTE.map(({ p, r }) => (
            <details key={p} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 group">
              <summary className="font-medium text-sm cursor-pointer list-none flex justify-between gap-3">{p}<span className="text-zinc-500 group-open:rotate-45 transition">+</span></summary>
              <p className="text-sm text-zinc-400 mt-2">{r}</p>
            </details>
          ))}
        </div>
      </section>

      {!user ? (
        <Card>
          <p className="text-sm text-zinc-300">Para abrir um chamado e acompanhar as respostas, <Link to="/auth?next=/suporte" className="text-green-400 underline">entre na sua conta</Link>.</p>
          {config?.empresa.email_suporte && <p className="text-sm text-zinc-400 mt-2">Sem acesso à conta? Escreva para {config.empresa.email_suporte}.</p>}
        </Card>
      ) : (
        <>
          <section aria-labelledby="novo-chamado">
            <h2 id="novo-chamado" className="font-semibold mb-3">Abrir chamado</h2>
            <Card>
              <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
                <Select label="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)}>
                  {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <Input label="Assunto" value={assunto} onChange={e => setAssunto(e.target.value)} maxLength={150} />
                <Textarea label="Mensagem" value={mensagem} onChange={e => setMensagem(e.target.value)} rows={5} maxLength={5000}
                  hint="Não envie senhas ou dados completos de cartão." />
                {erro && <p role="alert" className="text-red-400 text-sm">{erro}</p>}
                {ok && <p role="status" className="text-green-400 text-sm">{ok}</p>}
                <Button type="submit" loading={enviando}>Enviar chamado</Button>
              </form>
            </Card>
          </section>

          <section aria-labelledby="meus-chamados">
            <h2 id="meus-chamados" className="font-semibold mb-3">Meus chamados</h2>
            {chamados.length === 0 ? <p className="text-sm text-zinc-500">Você ainda não abriu chamados.</p> : (
              <div className="flex flex-col gap-3">
                {chamados.map(c => (
                  <Card key={c.id}>
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">{c.assunto}</p>
                        <p className="text-xs text-zinc-500">{dataHoraBR(c.created_at)} · {CATEGORIAS.find(([v]) => v === c.categoria)?.[1]}</p>
                      </div>
                      <Badge variant={STATUS[c.status]?.cor ?? 'zinc'}>{STATUS[c.status]?.texto ?? c.status}</Badge>
                    </div>
                    <p className="text-sm text-zinc-400 mt-2 whitespace-pre-wrap">{c.mensagem}</p>
                    {c.resposta && (
                      <div className="mt-3 bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                        <p className="text-xs text-green-400 font-semibold">Resposta do suporte · {dataHoraBR(c.respondido_em)}</p>
                        <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">{c.resposta}</p>
                      </div>
                    )}
                    {c.status !== 'fechado' && (
                      <button onClick={() => fechar(c.id)} className="text-xs text-zinc-500 underline mt-2">Marcar como resolvido</button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
