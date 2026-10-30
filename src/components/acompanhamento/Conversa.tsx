import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Dumbbell, Salad, Target, Handshake } from 'lucide-react'
import { listarMensagens, enviarMensagem, marcarLidas, type Mensagem } from '../../lib/acompanhamento'
import { horaMensagem } from '../../lib/acompanhamentoBase'
import { Spinner } from '../UI'

const ICONES = { treino: Dumbbell, dieta: Salad, meta: Target, aviso: Handshake } as const

/** Recados entre aluno e personal. Os avisos de treino, dieta e meta enviados aparecem na conversa. */
export default function Conversa({ acompanhamentoId, meuId, souAluno, aoLer }: {
  acompanhamentoId: string
  meuId: string
  /** No lado do aluno, os avisos levam ao treino/dieta/meta recebidos. */
  souAluno: boolean
  aoLer?: () => void
}) {
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    try {
      const lista = await listarMensagens(acompanhamentoId)
      setMsgs(lista)
      if (lista.some(m => m.autor_id !== meuId && !m.lida_em)) { await marcarLidas(acompanhamentoId).catch(() => {}); aoLer?.() }
    } catch { setMsgs(m => m ?? []) }
  }, [acompanhamentoId, meuId, aoLer])

  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 20000)
    return () => clearInterval(t)
  }, [carregar])
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }) }, [msgs?.length])

  const enviar = async () => {
    const t = texto.trim()
    if (!t) return
    setEnviando(true); setErro('')
    try {
      const m = await enviarMensagem(acompanhamentoId, t)
      setMsgs(l => [...(l ?? []), m]); setTexto('')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar.') } finally { setEnviando(false) }
  }

  const destino = (m: Mensagem) => !souAluno || !m.ref_id ? (souAluno && m.tipo === 'meta' ? '/meta' : null)
    : m.tipo === 'treino' ? `/treino/${m.ref_id}` : m.tipo === 'dieta' ? `/dieta/${m.ref_id}` : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1" aria-live="polite">
        {msgs === null ? <div className="flex justify-center py-6"><Spinner /></div>
          : msgs.length === 0 ? <p className="text-sm text-zinc-500 text-center py-6">Nenhuma mensagem ainda. Mande um oi! 👋</p>
            : msgs.map(m => {
              const minha = m.autor_id === meuId
              if (m.tipo !== 'texto') {
                const Icone = ICONES[m.tipo]
                const link = destino(m)
                const conteudo = (
                  <span className="inline-flex items-center gap-2 rounded-xl bg-zinc-800/70 border border-zinc-700 px-3 py-2 text-xs text-zinc-300">
                    <Icone className="w-4 h-4 text-green-400 shrink-0" />
                    <span>{m.texto}</span>
                    <span className="text-zinc-500 whitespace-nowrap">{horaMensagem(m.created_at)}</span>
                  </span>
                )
                return <div key={m.id} className="flex justify-center">{link ? <Link to={link} className="hover:opacity-80">{conteudo}</Link> : conteudo}</div>
              }
              return (
                <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${minha ? 'bg-green-500 text-zinc-950 rounded-br-md' : 'bg-zinc-800 text-zinc-100 rounded-bl-md'}`}>
                    {m.texto}
                    <span className={`block text-[10px] mt-0.5 text-right ${minha ? 'text-zinc-900/70' : 'text-zinc-500'}`}>{horaMensagem(m.created_at)}</span>
                  </div>
                </div>
              )
            })}
        <div ref={fim} />
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); enviar() }}>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={1} maxLength={2000} placeholder="Escreva uma mensagem"
          aria-label="Mensagem"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          className="flex-1 resize-none bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 max-h-32" />
        <button type="submit" disabled={enviando || !texto.trim()} aria-label="Enviar mensagem"
          className="w-11 h-11 rounded-xl bg-green-500 text-zinc-950 flex items-center justify-center disabled:opacity-40 active:scale-95 transition shrink-0">
          {enviando ? <Spinner size="sm" className="!text-zinc-950" /> : <Send className="w-5 h-5" />}
        </button>
      </form>
    </div>
  )
}
