import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChefHat, Plus, Minus, Trash2, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { listarReceitas, buscarReceita, salvarReceita, apagarReceita } from '../lib/receitasApi'
import type { Receita } from '../lib/receitasApi'
import { porcaoReceita, totaisIngredientes } from '../lib/relatorio'
import type { Alimento } from '../lib/diario'
import { numeroBR } from '../lib/diario'
import { Button, Input, Spinner, Textarea } from '../components/UI'
import { fmt } from '../components/nutricao/Graficos'
import AdicionarAlimento, { Folha } from '../components/nutricao/AdicionarAlimento'
import EditorAlimento from '../components/nutricao/EditorAlimento'

/** Lista de receitas salvas. */
export function ListaReceitas() {
  const { user } = useAuth()
  const [lista, setLista] = useState<Receita[] | null>(null)
  useEffect(() => { if (user) listarReceitas(user.id).then(setLista).catch(() => setLista([])) }, [user])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2"><ChefHat className="w-6 h-6 text-green-400" />Receitas</h1>
          <p className="text-sm text-zinc-500">Calorias e macros por porção, prontas para o diário.</p>
        </div>
        <Link to="/receitas/nova" className="inline-flex items-center gap-1.5 rounded-xl bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold text-sm px-3.5 py-2 active:scale-95 transition"><Plus className="w-4 h-4" />Nova</Link>
      </div>
      {lista === null ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        : lista.length === 0 ? (
          <div className="text-center py-12 px-6 bg-zinc-900 border border-zinc-800 rounded-3xl">
            <ChefHat className="w-10 h-10 text-green-400 mx-auto" />
            <p className="font-semibold text-zinc-100 mt-3">Salve suas receitas da semana</p>
            <p className="text-sm text-zinc-500 mt-1">Coloque os ingredientes e quantas porções rende. Depois é só adicionar ao diário com um toque.</p>
            <Link to="/receitas/nova" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-green-500 text-zinc-950 font-semibold text-sm px-4 py-2.5"><Plus className="w-4 h-4" />Criar primeira receita</Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {lista.map((r, i) => {
              const p = porcaoReceita(r.nome, r.ingredientes, r.porcoes, r.peso_final_g)
              return (
                <li key={r.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <Link to={`/receitas/${r.id}`} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl px-4 py-3 transition">
                    <span className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0"><ChefHat className="w-5 h-5 text-green-400" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-zinc-100 truncate">{r.nome}</span>
                      <span className="block text-xs text-zinc-500">{fmt(p.calorias)} kcal por porção · rende {numeroBR(r.porcoes)}{r.peso_final_g ? ` · ${numeroBR(r.peso_final_g)} g` : ''} · {r.ingredientes.length} ingrediente(s)</span>
                    </span>
                    <ChevronRight className="w-5 h-5 text-zinc-600" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}

/** Criar ou editar uma receita. */
export function EditorReceita() {
  const { id } = useParams<{ id?: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [carregando, setCarregando] = useState(!!id)
  const [nome, setNome] = useState('')
  const [porcoes, setPorcoes] = useState(4)
  const [porcoesTxt, setPorcoesTxt] = useState<string | null>(null)
  const [pesoTxt, setPesoTxt] = useState('')
  const [ingredientes, setIngredientes] = useState<Alimento[]>([])
  const [preparo, setPreparo] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)
  const [editado, setEditado] = useState<Alimento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!id) return
    buscarReceita(id).then(r => {
      if (r) { setNome(r.nome); setPorcoes(r.porcoes); setPesoTxt(r.peso_final_g ? numeroBR(r.peso_final_g) : ''); setIngredientes(r.ingredientes); setPreparo(r.modo_preparo ?? '') }
      setCarregando(false)
    })
  }, [id])

  const adicionar = useCallback((novos: Alimento[]) => setIngredientes(l => [...l, ...novos]), [])
  const total = totaisIngredientes(ingredientes)
  const pesoNum = Number(pesoTxt.replace(/\./g, '').replace(',', '.'))
  const pesoFinal = pesoTxt.trim() && pesoNum > 0 ? pesoNum : null
  const porcao = porcaoReceita(nome || 'Receita', ingredientes, porcoes, pesoFinal)

  const salvar = async () => {
    if (!nome.trim()) { setErro('Dê um nome para a receita.'); return }
    if (!ingredientes.length) { setErro('Adicione pelo menos um ingrediente.'); return }
    if (pesoTxt.trim() && !(pesoNum > 0 && pesoNum <= 50000)) { setErro('Peso final inválido: use gramas, até 50.000 g.'); return }
    setErro(''); setSalvando(true)
    try {
      await salvarReceita(user!.id, { id, nome, porcoes, peso_final_g: pesoFinal, ingredientes, modo_preparo: preparo })
      navigate('/receitas')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar'); setSalvando(false) }
  }
  const apagar = async () => {
    if (!id || !confirm(`Apagar a receita "${nome}"?`)) return
    await apagarReceita(id)
    navigate('/receitas')
  }

  if (carregando) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/receitas')} aria-label="Voltar" className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="flex-1 text-xl font-bold text-zinc-50">{id ? 'Editar receita' : 'Nova receita'}</h1>
        {id && <button onClick={apagar} aria-label="Apagar receita" className="p-2 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-5 h-5" /></button>}
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <Input label="Nome da receita" value={nome} onChange={e => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Frango com batata-doce" />
        <div>
          <p className="text-sm font-medium text-zinc-300 mb-1.5">Rende quantas porções?</p>
          <div className="flex items-center gap-2 bg-zinc-800/60 rounded-2xl p-2 w-fit">
            <button type="button" onClick={() => setPorcoes(p => Math.max(1, p - 1))} aria-label="Menos uma porção" className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center active:scale-95"><Minus className="w-4 h-4" /></button>
            <input value={porcoesTxt ?? numeroBR(porcoes)} inputMode="decimal" aria-label="Porções"
              onChange={e => { setPorcoesTxt(e.target.value); const v = Number(e.target.value.replace(',', '.')); if (v > 0 && v <= 100) setPorcoes(v) }}
              onBlur={() => setPorcoesTxt(null)}
              className="w-14 bg-transparent text-center text-xl font-bold tabular-nums text-zinc-50 focus:outline-none" />
            <button type="button" onClick={() => setPorcoes(p => Math.min(100, p + 1))} aria-label="Mais uma porção" className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center active:scale-95"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="peso-final" className="text-sm font-medium text-zinc-300">Peso final da receita pronta (opcional)</label>
          <div className="relative w-40">
            <input id="peso-final" value={pesoTxt} onChange={e => setPesoTxt(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="Ex.: 1400"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-4 pr-9 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">g</span>
          </div>
          <p className="text-xs text-zinc-500">Pese a comida pronta (sem a panela). Assim, no diário, você registra em gramas o que colocou no prato.</p>
        </div>
      </section>

      <section aria-label="Por porção" className="rounded-3xl border border-green-500/25 bg-gradient-to-br from-green-500/10 via-zinc-900 to-zinc-900 p-4">
        <p className="text-xs text-zinc-400">Cada porção tem</p>
        <p className="text-3xl font-bold tabular-nums text-green-400">{fmt(porcao.calorias)} <span className="text-base font-medium text-zinc-400">kcal</span></p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <p className="text-zinc-500">Carbo <span className="block text-sm font-semibold text-lime-400">{fmt(porcao.carboidrato_g)}g</span></p>
          <p className="text-zinc-500">Proteína <span className="block text-sm font-semibold text-emerald-400">{fmt(porcao.proteina_g)}g</span></p>
          <p className="text-zinc-500">Gordura <span className="block text-sm font-semibold text-amber-400">{fmt(porcao.gordura_g)}g</span></p>
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">Receita inteira: {fmt(total.calorias)} kcal{pesoFinal ? ` · cada porção ≈ ${fmt(Math.round(pesoFinal / porcoes))} g · 100 g = ${fmt(Math.round(total.calorias * 100 / pesoFinal))} kcal` : ''}</p>
      </section>

      <section aria-label="Ingredientes" className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <h2 className="px-4 pt-3.5 pb-2 font-semibold text-zinc-100">Ingredientes ({ingredientes.length})</h2>
        {ingredientes.length > 0 && (
          <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
            {ingredientes.map((i, idx) => (
              <li key={idx} className="flex items-center gap-2 pr-2">
                <button type="button" onClick={() => { setEditando(idx); setEditado(null) }} aria-label={`Editar ${i.nome}`} className="flex-1 min-w-0 flex items-center gap-2 pl-4 py-2.5 text-left hover:bg-zinc-800/40">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-zinc-100 truncate">{i.nome}</span>
                    <span className="block text-xs text-zinc-500 truncate">{i.quantidade || '—'}</span>
                  </span>
                  <Pencil className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                </button>
                <span className="text-sm font-semibold tabular-nums text-zinc-200">{fmt(i.calorias)}</span>
                <button onClick={() => setIngredientes(l => l.filter((_, j) => j !== idx))} aria-label={`Remover ${i.nome}`} className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={() => setAdicionando(true)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/5 border-t border-zinc-800/70">
          <Plus className="w-4 h-4" />Adicionar ingrediente
        </button>
      </section>

      <Textarea label="Modo de preparo (opcional)" rows={3} value={preparo} onChange={e => setPreparo(e.target.value)} maxLength={4000} />
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <div className="sticky bottom-24 bg-zinc-950/90 backdrop-blur py-2">
        <Button size="lg" className="w-full" loading={salvando} onClick={salvar}>Salvar receita</Button>
      </div>

      {adicionando && user && <AdicionarAlimento userId={user.id} onClose={() => setAdicionando(false)} onEscolher={adicionar} />}
      {editando !== null && ingredientes[editando] && (
        <Folha titulo={<h2 className="text-lg font-bold text-zinc-50">Editar ingrediente</h2>} onClose={() => setEditando(null)}
          rodape={<Button size="lg" className="w-full" onClick={() => { if (editado) setIngredientes(l => l.map((x, j) => (j === editando ? editado : x))); setEditando(null) }}>Salvar</Button>}>
          <p className="text-xl font-bold text-zinc-50">{(editado ?? ingredientes[editando]).nome}</p>
          <div className="mt-4"><EditorAlimento original={ingredientes[editando]} onChange={setEditado} /></div>
        </Folha>
      )}
    </div>
  )
}
