import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Send } from 'lucide-react'
import { supabase } from '../lib/supabase'

/** Tipos de recado → categoria do chamado (support_tickets). */
export const TIPOS_RECADO = [
  { cat: 'sugestao', rotulo: '💡 Sugestão', exemplo: 'Ex.: seria ótimo poder salvar meus treinos favoritos…' },
  { cat: 'bug', rotulo: '🐞 Reportar erro', exemplo: 'O que aconteceu e em qual tela? Ex.: ao salvar o almoço, apareceu uma mensagem de erro…' },
  { cat: 'dificuldade', rotulo: '🤔 Dificuldade', exemplo: 'Onde você travou? Ex.: não encontrei como mudar o descanso…' },
  { cat: 'outro', rotulo: '💬 Outro', exemplo: 'Escreva o que quiser contar.' },
] as const
type Cat = (typeof TIPOS_RECADO)[number]['cat']

/** Bloco no fim da tela inicial: recado direto para quem desenvolve o app (cai no Suporte e avisa no celular do admin). */
export default function FaleComDesenvolvedor({ userId }: { userId: string }) {
  const [cat, setCat] = useState<Cat>('sugestao')
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'livre' | 'enviando' | 'enviado' | 'erro'>('livre')
  const [aviso, setAviso] = useState('')
  const tipo = TIPOS_RECADO.find(t => t.cat === cat)!

  const enviar = async () => {
    const msg = texto.trim()
    if (msg.length < 10) { setAviso('Escreva um pouquinho mais (pelo menos 10 letras) para eu entender.'); return }
    setAviso(''); setEstado('enviando')
    const titulo = tipo.rotulo.replace(/^\S+\s/, '')
    const assunto = `${titulo}: ${msg.replace(/\s+/g, ' ').slice(0, 120)}`.slice(0, 150)
    const linha = { user_id: userId, categoria: cat as string, assunto, mensagem: msg.slice(0, 5000) }
    let { error } = await supabase.from('support_tickets').insert(linha)
    // Banco ainda sem o tipo novo (restrição de categoria): grava como "outro", com o tipo no assunto
    if (error?.code === '23514') ({ error } = await supabase.from('support_tickets').insert({ ...linha, categoria: 'outro' }))
    if (error) { setEstado('erro'); setAviso('Não deu para enviar agora. Confira a internet e tente de novo.'); return }
    setEstado('enviado'); setTexto('')
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5" aria-labelledby="fale-dev">
      <h2 id="fale-dev" className="font-bold text-zinc-50">Fale com o desenvolvedor</h2>
      <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
        Teve uma ideia, achou um erro ou travou em alguma parte? Me conta. Eu leio cada mensagem, e o R2 Fit Pro fica melhor com o que você manda.
      </p>
      {estado === 'enviado' ? (
        <div className="mt-4 rounded-2xl bg-green-500/10 border border-green-500/25 p-4" role="status">
          <p className="text-sm font-semibold text-green-400">✓ Recebido! Valeu por ajudar a melhorar o app.</p>
          <p className="text-xs text-zinc-400 mt-1">A resposta aparece em <Link to="/suporte" className="text-green-400 underline">Suporte</Link>.</p>
          <button onClick={() => setEstado('livre')} className="text-xs text-zinc-400 hover:text-zinc-200 mt-3">Mandar outro recado</button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mt-4" role="radiogroup" aria-label="Tipo de recado">
            {TIPOS_RECADO.map(t => (
              <button key={t.cat} type="button" role="radio" aria-checked={cat === t.cat} onClick={() => setCat(t.cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${cat === t.cat ? 'bg-green-500 text-zinc-950 border-green-500' : 'bg-zinc-950 text-zinc-300 border-zinc-800'}`}>
                {t.rotulo}
              </button>
            ))}
          </div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} maxLength={5000} rows={3} aria-label="Sua mensagem"
            placeholder={tipo.exemplo}
            className="mt-3 w-full rounded-2xl bg-zinc-950 border border-zinc-800 focus:border-green-500 focus:outline-none px-3.5 py-3 text-base text-zinc-100 placeholder:text-zinc-600 resize-none" />
          {aviso && <p className="text-xs text-amber-400 mt-1.5">{aviso}</p>}
          <button onClick={enviar} disabled={estado === 'enviando'}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-zinc-950 font-bold hover:bg-green-400 active:scale-[0.98] transition disabled:opacity-60">
            <Send className="w-4 h-4" /> {estado === 'enviando' ? 'Enviando…' : 'Enviar recado'}
          </button>
        </>
      )}
    </section>
  )
}
