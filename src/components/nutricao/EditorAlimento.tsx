import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Pencil } from 'lucide-react'
import { ajustarQuantidade, escalarAlimento, lerQuantidade, numeroBR, passoQuantidade } from '../../lib/diario'
import type { Alimento } from '../../lib/diario'
import { Input } from '../UI'
import { fmt } from './Graficos'

const num = (s: string) => Number(s.replace(',', '.'))
const PORCOES = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5]

/** Ajuste de quantidade (proporcional) e edição manual de um alimento.
 *  Chama onChange com o resultado sempre que algo muda. */
export default function EditorAlimento({ original, onChange }: { original: Alimento; onChange: (a: Alimento) => void }) {
  const q = useMemo(() => lerQuantidade(original.quantidade), [original.quantidade])
  const [valor, setValor] = useState(q ? numeroBR(q.valor) : '1')
  const [manual, setManual] = useState<null | Record<keyof Alimento, string>>(null)

  const resultado: Alimento = useMemo(() => {
    if (manual) {
      return {
        nome: manual.nome.trim() || original.nome, quantidade: manual.quantidade.trim(),
        calorias: Math.max(0, Math.round(num(manual.calorias) || 0)), proteina_g: Math.max(0, num(manual.proteina_g) || 0),
        carboidrato_g: Math.max(0, num(manual.carboidrato_g) || 0), gordura_g: Math.max(0, num(manual.gordura_g) || 0),
      }
    }
    const v = num(valor)
    if (!(v > 0)) return original
    return q ? ajustarQuantidade(original, v) : escalarAlimento(original, v)
  }, [manual, valor, q, original])

  const chave = JSON.stringify(resultado)
  useEffect(() => { onChange(resultado) }, [chave])

  const passo = q ? passoQuantidade(q) : 0
  const mudar = (dir: 1 | -1) => {
    const v = num(valor) || 0
    if (q) setValor(numeroBR(Math.max(passo, Math.round((v + dir * passo) * 100) / 100)))
    else {
      const i = PORCOES.findIndex(p => p >= v)
      const prox = PORCOES[Math.min(PORCOES.length - 1, Math.max(0, (i < 0 ? PORCOES.length - 1 : i) + dir))]
      setValor(numeroBR(prox))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!manual && (
        <div>
          <p className="text-sm font-medium text-zinc-300 mb-1.5">Quantidade</p>
          <div className="flex items-center gap-2 bg-zinc-800/60 rounded-2xl p-2">
            <button type="button" onClick={() => mudar(-1)} aria-label="Menos"
              className="w-11 h-11 rounded-xl bg-zinc-900 flex items-center justify-center active:scale-95 transition shrink-0"><Minus className="w-5 h-5" /></button>
            <label className="flex-1 flex items-baseline justify-center gap-2 min-w-0">
              <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" aria-label="Quantidade"
                className="w-20 bg-transparent text-center text-2xl font-bold tabular-nums text-zinc-50 focus:outline-none border-b border-zinc-600 focus:border-green-500" />
              <span className="text-sm text-zinc-300 truncate">{q ? (lerQuantidade(resultado.quantidade)?.unidade || q.unidade) : `× ${original.quantidade || 'porção'}`}</span>
            </label>
            <button type="button" onClick={() => mudar(1)} aria-label="Mais"
              className="w-11 h-11 rounded-xl bg-zinc-900 flex items-center justify-center active:scale-95 transition shrink-0"><Plus className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-center">
        {[['Calorias', fmt(resultado.calorias), 'text-green-400'], ['Carbo', fmt(resultado.carboidrato_g) + 'g', 'text-lime-400'], ['Proteína', fmt(resultado.proteina_g) + 'g', 'text-emerald-400'], ['Gordura', fmt(resultado.gordura_g) + 'g', 'text-amber-400']].map(([r, v, c]) => (
          <div key={r} className="bg-zinc-800/40 rounded-xl py-3">
            <p className={`text-base font-bold tabular-nums ${c}`}>{v}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">{r}</p>
          </div>
        ))}
      </div>

      {manual ? (
        <div className="flex flex-col gap-3 animate-fade-up">
          <Input label="Nome" value={manual.nome} onChange={e => setManual({ ...manual, nome: e.target.value })} maxLength={200} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Quantidade" value={manual.quantidade} onChange={e => setManual({ ...manual, quantidade: e.target.value })} maxLength={120} placeholder="Ex.: 2 ovos" />
            <Input label="Calorias (kcal)" inputMode="numeric" value={manual.calorias} onChange={e => setManual({ ...manual, calorias: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label="Carbo (g)" inputMode="decimal" value={manual.carboidrato_g} onChange={e => setManual({ ...manual, carboidrato_g: e.target.value })} />
            <Input label="Proteína (g)" inputMode="decimal" value={manual.proteina_g} onChange={e => setManual({ ...manual, proteina_g: e.target.value })} />
            <Input label="Gordura (g)" inputMode="decimal" value={manual.gordura_g} onChange={e => setManual({ ...manual, gordura_g: e.target.value })} />
          </div>
          <button type="button" onClick={() => setManual(null)} className="text-sm text-green-400 self-start">Voltar ao ajuste por quantidade</button>
        </div>
      ) : (
        <button type="button" onClick={() => setManual({
          nome: resultado.nome, quantidade: resultado.quantidade, calorias: String(resultado.calorias),
          proteina_g: numeroBR(resultado.proteina_g), carboidrato_g: numeroBR(resultado.carboidrato_g), gordura_g: numeroBR(resultado.gordura_g),
        })} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-600">
          <Pencil className="w-4 h-4" />Editar nome e valores
        </button>
      )}
    </div>
  )
}
