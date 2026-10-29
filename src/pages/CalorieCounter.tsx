import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Trash2, Target } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { REFEICOES, grupoRefeicao, hojeLocal, somarDias, rotuloDia } from '../lib/diario'
import type { Refeicao } from '../lib/diario'
import { useMeta, registrosDoDia, somarTotais } from '../lib/nutricao'
import type { RegistroAlimento } from '../lib/nutricao'
import { Spinner } from '../components/UI'
import { fmt } from '../components/nutricao/Graficos'
import AdicionarAlimento from '../components/nutricao/AdicionarAlimento'

const ICONE_REFEICAO: Record<Refeicao, string> = { 'Café da manhã': '☕', Almoço: '🍽️', Jantar: '🌙', Lanches: '🍎' }

export default function CalorieCounter() {
  const { user } = useAuth()
  const { meta } = useMeta(user?.id)
  const [data, setData] = useState(hojeLocal)
  const [itens, setItens] = useState<RegistroAlimento[]>([])
  const [carregando, setCarregando] = useState(true)
  // O início abre a folha de adicionar direto: /calorias?adicionar=Almoço
  const [params, setParams] = useSearchParams()
  const pedido = params.get('adicionar')
  const [adicionarEm, setAdicionarEm] = useState<Refeicao | null>(pedido ? grupoRefeicao(pedido) : null)
  useEffect(() => { if (pedido) setParams({}, { replace: true }) }, [pedido, setParams])

  const carregar = useCallback(async () => {
    if (!user) return
    setItens(await registrosDoDia(user.id, data))
    setCarregando(false)
  }, [user, data])
  useEffect(() => { setCarregando(true); carregar() }, [carregar])

  const remover = async (id: string) => {
    if (!confirm('Remover este alimento?')) return
    setItens(p => p.filter(i => i.id !== id))
    await supabase.from('food_logs').delete().eq('id', id)
  }

  const totais = somarTotais(itens)
  const restante = meta ? meta.calorias - totais.calorias : null

  return (
    <div className="flex flex-col gap-4" translate="no">
      <div className="flex items-center justify-between animate-fade-up">
        <button onClick={() => setData(d => somarDias(d, -1))} aria-label="Dia anterior" className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"><ChevronLeft className="w-5 h-5" /></button>
        <label className="relative cursor-pointer text-center">
          <span className="block text-lg font-bold text-zinc-50 capitalize">{rotuloDia(data)}</span>
          <span className="block text-xs text-zinc-500">Diário alimentar</span>
          <input type="date" value={data} onChange={e => e.target.value && setData(e.target.value)} aria-label="Escolher data" className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <button onClick={() => setData(d => somarDias(d, 1))} aria-label="Próximo dia" className="p-2 -mr-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Resumo: Meta − Alimentos = Restante */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 animate-fade-up" style={{ animationDelay: '60ms' }}>
        {meta ? (
          <>
            <p className="text-xs text-zinc-500 mb-2">Calorias restantes</p>
            <div className="flex items-end justify-between gap-2 text-center">
              <div><p className="text-lg font-bold tabular-nums text-zinc-100">{fmt(meta.calorias)}</p><p className="text-[11px] text-zinc-500">Meta</p></div>
              <span className="text-zinc-600 pb-4">−</span>
              <div><p className="text-lg font-bold tabular-nums text-zinc-100">{fmt(totais.calorias)}</p><p className="text-[11px] text-zinc-500">Alimentos</p></div>
              <span className="text-zinc-600 pb-4">=</span>
              <div><p className={`text-lg font-bold tabular-nums ${restante! < 0 ? 'text-amber-400' : 'text-green-400'}`}>{fmt(restante!)}</p><p className="text-[11px] text-zinc-500">Restante</p></div>
            </div>
          </>
        ) : (
          <Link to="/meta" className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-green-500/15 text-green-400 flex items-center justify-center shrink-0"><Target className="w-5 h-5" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-zinc-100">Total do dia: {fmt(totais.calorias)} kcal</span>
              <span className="block text-xs text-green-400">Defina sua meta diária →</span>
            </span>
          </Link>
        )}
        <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-3 text-center text-xs">
          <p className="text-zinc-500">Carbo <span className="block text-sm font-semibold text-lime-400 tabular-nums">{fmt(totais.carboidrato_g)}g</span></p>
          <p className="text-zinc-500">Proteína <span className="block text-sm font-semibold text-emerald-400 tabular-nums">{fmt(totais.proteina_g)}g</span></p>
          <p className="text-zinc-500">Gordura <span className="block text-sm font-semibold text-amber-400 tabular-nums">{fmt(totais.gordura_g)}g</span></p>
        </div>
      </div>

      {carregando ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        REFEICOES.map((r, idx) => {
          const daRefeicao = itens.filter(i => grupoRefeicao(i.refeicao) === r)
          const kcal = daRefeicao.reduce((s, i) => s + i.calorias, 0)
          return (
            <section key={r} aria-label={r} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-fade-up" style={{ animationDelay: `${120 + idx * 60}ms` }}>
              <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                <h2 className="font-semibold text-zinc-100 flex items-center gap-2"><span aria-hidden>{ICONE_REFEICAO[r]}</span>{r}</h2>
                <span className="text-sm font-semibold tabular-nums text-zinc-300">{fmt(kcal)} <span className="text-xs font-normal text-zinc-500">kcal</span></span>
              </div>
              {daRefeicao.length > 0 && (
                <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
                  {daRefeicao.map(it => (
                    <li key={it.id} className="group flex items-center gap-2 pl-4 pr-2 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-100 truncate">{it.nome}</p>
                        <p className="text-xs text-zinc-500 truncate">{it.quantidade || '1 porção'} · P {fmt(it.proteina_g)} · C {fmt(it.carboidrato_g)} · G {fmt(it.gordura_g)}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-zinc-200">{fmt(it.calorias)}</span>
                      <button onClick={() => remover(it.id)} aria-label={`Remover ${it.nome}`} className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition"><Trash2 className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={() => setAdicionarEm(r)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/5 border-t border-zinc-800/70 transition">
                <Plus className="w-4 h-4" />Adicionar alimento
              </button>
            </section>
          )
        })
      )}

      {user && adicionarEm && (
        <AdicionarAlimento userId={user.id} data={data} refeicaoInicial={adicionarEm} onClose={() => setAdicionarEm(null)} onSalvo={carregar} />
      )}
    </div>
  )
}

