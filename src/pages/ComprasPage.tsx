import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Dieta } from '../types'
import { listaDeCompras, textoDaLista } from '../lib/comprasBase'
import { Spinner } from '../components/UI'

const DIAS = [1, 3, 7, 14]
const chaveLocal = (id: string) => `r2-compras-${id}`
const lerMarcados = (id: string) => { try { return new Set<string>(JSON.parse(localStorage.getItem(chaveLocal(id)) ?? '[]')) } catch { return new Set<string>() } }

/** Lista de compras da dieta: soma as quantidades do dia e multiplica pelos dias; marca o que já pegou. */
export default function ComprasPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [dieta, setDieta] = useState<Dieta | null>(null)
  const [dias, setDias] = useState(7)
  const [marcados, setMarcados] = useState<Set<string>>(() => lerMarcados(id))
  const [aviso, setAviso] = useState('')
  useEffect(() => { supabase.from('dietas').select('*').eq('id', id).maybeSingle().then(({ data }) => setDieta(data as Dieta | null)) }, [id])
  const itens = useMemo(() => (dieta ? listaDeCompras(dieta.plano?.refeicoes ?? [], dias) : []), [dieta, dias])
  if (!dieta) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const marcar = (k: string) => setMarcados(m => {
    const n = new Set(m); if (n.has(k)) n.delete(k); else n.add(k)
    try { localStorage.setItem(chaveLocal(id), JSON.stringify([...n])) } catch { /* sem armazenamento */ }
    return n
  })
  const texto = textoDaLista(`Lista de compras · ${dieta.nome} (${dias} ${dias === 1 ? 'dia' : 'dias'})`, itens, marcados)
  const copiar = () => navigator.clipboard?.writeText(texto).then(() => setAviso('Lista copiada.')).catch(() => setAviso('Não foi possível copiar.'))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-100">Lista de compras</h1>
          <p className="text-sm text-zinc-500 truncate">{dieta.nome}</p>
        </div>
      </div>
      <div role="group" aria-label="Para quantos dias" className="grid grid-cols-4 gap-2">
        {DIAS.map(n => (
          <button key={n} type="button" aria-pressed={dias === n} onClick={() => setDias(n)}
            className={`py-2 rounded-xl text-sm font-semibold border ${dias === n ? 'bg-green-500/10 border-green-500/40 text-green-400' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}>{n} {n === 1 ? 'dia' : 'dias'}</button>
        ))}
      </div>
      <ul className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/70" aria-label="Itens">
        {itens.map(i => (
          <li key={i.chave}>
            <label className="flex items-center gap-3 px-4 py-3">
              <input type="checkbox" checked={marcados.has(i.chave)} onChange={() => marcar(i.chave)} className="w-5 h-5 accent-green-500" aria-label={i.nome} />
              <span className={`flex-1 min-w-0 text-sm ${marcados.has(i.chave) ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{i.nome}</span>
              <span className="text-sm text-zinc-400 tabular-nums text-right">{i.total}</span>
            </label>
          </li>
        ))}
        {!itens.length && <li className="px-4 py-6 text-sm text-zinc-500 text-center">Esta dieta não tem alimentos.</li>}
      </ul>
      <p className="text-[11px] text-zinc-500 px-1">Quantidades somadas das refeições de um dia vezes os dias escolhidos. Toque para riscar o que já pegou.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={copiar} className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold bg-zinc-800 text-zinc-200 border border-zinc-700"><Copy className="w-4 h-4" />Copiar</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold bg-green-500 text-zinc-950"><MessageCircle className="w-4 h-4" />WhatsApp</a>
      </div>
      {marcados.size > 0 && <button type="button" onClick={() => { setMarcados(new Set()); try { localStorage.removeItem(chaveLocal(id)) } catch { /* ignore */ } }} className="text-xs text-zinc-500">Desmarcar tudo</button>}
      {aviso && <p role="status" className="text-sm text-green-400 text-center">{aviso}</p>}
    </div>
  )
}
