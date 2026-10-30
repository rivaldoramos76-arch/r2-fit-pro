import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X, Search, Star, Plus, Check, Sparkles, Camera, ChevronLeft, ChevronRight, Pencil, Trash2, ChefHat } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listarReceitas } from '../../lib/receitasApi'
import type { Receita } from '../../lib/receitasApi'
import { porcaoReceita, receitaComoItem } from '../../lib/relatorio'
import { estimarAlimentoTexto, analisarImagemAlimento } from '../../lib/foodAI'
import type { FoodEstimate } from '../../lib/foodAI'
import { REFEICOES, chaveAlimento, grupoRefeicao } from '../../lib/diario'
import type { Alimento, Refeicao } from '../../lib/diario'
import { alimentosRecentes, listarFavoritos, favoritar, desfavoritar, registrarAlimentos, atualizarRegistro } from '../../lib/nutricao'
import type { Favorito, RegistroAlimento } from '../../lib/nutricao'
import { Button, Spinner, Textarea } from '../UI'
import { fmt } from './Graficos'
import EditorAlimento from './EditorAlimento'
import BuscaAlimentos from './BuscaAlimentos'
import { medidasDe, paraAlimento, semAcento, tipoMedida } from '../../lib/alimentosBase'
import type { ItemBase } from '../../lib/alimentosBase'

type Aba = 'buscar' | 'favoritos' | 'receitas' | 'texto' | 'foto'
const ABAS: { id: Aba; rotulo: string; icone: typeof Search }[] = [
  { id: 'buscar', rotulo: 'Buscar', icone: Search },
  { id: 'favoritos', rotulo: 'Favoritos', icone: Star },
  { id: 'receitas', rotulo: 'Receitas', icone: ChefHat },
  { id: 'texto', rotulo: 'Digitar', icone: Sparkles },
  { id: 'foto', rotulo: 'Foto', icone: Camera },
]

const macros = (a: Alimento) => `P ${fmt(a.proteina_g)}g · C ${fmt(a.carboidrato_g)}g · G ${fmt(a.gordura_g)}g`

/** Folha inferior animada (fecha tocando fora ou no X). */
export function Folha({ titulo, onClose, children, rodape }: { titulo: ReactNode; onClose: () => void; children: ReactNode; rodape?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/75 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} translate="no"
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col animate-sheet-up shadow-2xl shadow-black/60">
        <div className="pt-2.5 sm:hidden flex justify-center"><span className="w-10 h-1 rounded-full bg-zinc-700" /></div>
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
          <div className="min-w-0 flex-1">{titulo}</div>
          <button onClick={onClose} aria-label="Fechar" className="text-zinc-400 hover:text-zinc-100 p-1.5 -mr-1.5 rounded-lg hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 flex-1">{children}</div>
        {rodape && <div className="px-5 py-3 border-t border-zinc-800" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{rodape}</div>}
      </div>
    </div>
  )
}

function Estrela({ ativa, onClick }: { ativa: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick() }} aria-pressed={ativa} aria-label={ativa ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className="p-2 rounded-lg hover:bg-zinc-800 shrink-0">
      <Star key={String(ativa)} className={`w-[18px] h-[18px] ${ativa ? 'fill-green-400 text-green-400 animate-pop' : 'text-zinc-500'}`} />
    </button>
  )
}

/** Folha de adicionar alimento. Com `onEscolher`, serve para escolher ingredientes de uma receita
 *  (não grava no diário, não pede refeição e esconde a aba de receitas). */
export default function AdicionarAlimento({ userId, data = '', refeicaoInicial = 'Lanches', onClose, onSalvo, onEscolher }: {
  userId: string; data?: string; refeicaoInicial?: Refeicao; onClose: () => void; onSalvo?: () => void
  onEscolher?: (itens: Alimento[]) => void
}) {
  const ingrediente = !!onEscolher
  const abas = ingrediente ? ABAS.filter(a => a.id !== 'receitas') : ABAS
  const [receitas, setReceitas] = useState<Receita[] | null>(null)
  const [refeicao, setRefeicao] = useState<Refeicao>(refeicaoInicial)
  const [aba, setAba] = useState<Aba>('buscar')
  const [recentes, setRecentes] = useState<Alimento[] | null>(null)
  const [favoritos, setFavoritos] = useState<Favorito[] | null>(null)
  const [busca, setBusca] = useState('')
  const [detalhe, setDetalhe] = useState<Alimento | null>(null)
  const [base, setBase] = useState<ItemBase | null>(null)
  const [medida, setMedida] = useState(0)
  const [editado, setEditado] = useState<Alimento | null>(null)
  const [adicionados, setAdicionados] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    alimentosRecentes(userId).then(setRecentes)
    listarFavoritos(userId).then(setFavoritos)
  }, [userId])

  const favPorChave = useMemo(() => new Map((favoritos ?? []).map(f => [chaveAlimento(f), f])), [favoritos])

  const alternarFavorito = async (a: Alimento) => {
    setErro('')
    const atual = favPorChave.get(chaveAlimento(a))
    try {
      if (atual) {
        setFavoritos(fs => (fs ?? []).filter(f => f.id !== atual.id))
        await desfavoritar(atual.id)
      } else {
        const novo = await favoritar(userId, a)
        setFavoritos(fs => [...(fs ?? []).filter(f => f.id !== novo.id), novo].sort((x, y) => x.nome.localeCompare(y.nome)))
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o favorito')
      listarFavoritos(userId).then(setFavoritos)
    }
  }

  const adicionar = async (itens: (Alimento & { observacao?: string | null })[], origem: string, fechar: boolean) => {
    setErro('')
    if (onEscolher) {
      onEscolher(itens.map(({ nome, quantidade, calorias, proteina_g, carboidrato_g, gordura_g }) => ({ nome, quantidade, calorias, proteina_g, carboidrato_g, gordura_g })))
      setAdicionados(s => new Set([...s, ...itens.map(chaveAlimento)]))
      if (fechar) onClose()
      return
    }
    setSalvando(true)
    try {
      await registrarAlimentos(userId, data, refeicao, itens, origem)
      setAdicionados(s => new Set([...s, ...itens.map(chaveAlimento)]))
      onSalvo?.()
      if (fechar) onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível adicionar')
    } finally { setSalvando(false) }
  }

  const abrir = (a: Alimento) => { setBase(null); setDetalhe(a); setEditado(null) }
  const abrirBase = (item: ItemBase) => { setBase(item); setMedida(0); setDetalhe(paraAlimento(item, medidasDe(item)[0])); setEditado(null) }
  const fecharDetalhe = () => { setDetalhe(null); setBase(null) }

  const q = semAcento(busca.trim())
  const filtrar = (l: Alimento[] | null) => (l && q ? l.filter(a => semAcento(a.nome).includes(q)) : l)
  const recentesFiltrados = useMemo(() => filtrar(recentes), [recentes, q])
  const favoritosFiltrados = useMemo(() => filtrar(favoritos), [favoritos, q])

  const titulo = detalhe
    ? <button onClick={fecharDetalhe} className="flex items-center gap-1 text-zinc-300 hover:text-zinc-100 text-sm font-semibold -ml-1"><ChevronLeft className="w-5 h-5" />Voltar</button>
    : <h2 className="text-lg font-bold text-zinc-50">{ingrediente ? 'Adicionar ingrediente' : 'Adicionar alimento'}</h2>

  if (detalhe) {
    const final = editado ?? detalhe
    const medidas = base ? medidasDe(base) : []
    return (
      <Folha titulo={titulo} onClose={onClose}
        rodape={<Button size="lg" className="w-full" loading={salvando} onClick={async () => { await adicionar([final], aba === 'receitas' ? 'receita' : base ? 'busca' : aba === 'favoritos' ? 'favorito' : 'recente', false); fecharDetalhe() }}>{ingrediente ? 'Adicionar à receita' : `Adicionar a ${refeicao}`}</Button>}>
        <div className="flex items-start gap-2 animate-fade-up">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-zinc-50">{final.nome}</p>
            <p className="text-sm text-zinc-400 mt-0.5">{final.quantidade || '1 porção'}</p>
            {base && <p className="text-xs text-zinc-500 mt-1">{base.detalhe} · {fmt(base.kcal)} kcal em 100 g</p>}
          </div>
          <Estrela ativa={favPorChave.has(chaveAlimento(final))} onClick={() => alternarFavorito(final)} />
        </div>
        {base && medidas.length > 1 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-zinc-300 mb-1.5">Medida</p>
            <div className="flex flex-wrap gap-1.5" aria-label="Medida">
              {medidas.map((m, i) => (
                <button key={m.rotulo} type="button" aria-pressed={medida === i} onClick={() => { setMedida(i); setDetalhe(paraAlimento(base, m)); setEditado(null) }}
                  className={`px-2.5 py-1.5 rounded-full text-[13px] font-medium border transition ${medida === i ? 'bg-green-500 text-zinc-950 border-green-500' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}>
                  {m.rotulo === 'gramas' ? 'Em gramas' : m.rotulo === 'ml' ? 'Em ml' : `${m.rotulo}${m.rotulo.includes('(') ? '' : ` (${m.gramas} ${tipoMedida(base) === 'liquido' ? 'ml' : 'g'})`}`}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4"><EditorAlimento key={chaveAlimento(detalhe)} original={detalhe} onChange={setEditado} semGramas={!!base} /></div>
        {!ingrediente && <SeletorRefeicao valor={refeicao} onChange={setRefeicao} />}
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      </Folha>
    )
  }

  const lista = (itens: Alimento[] | null, origem: string, vazio: ReactNode, abrirItem: (a: Alimento, i: number) => void = abrir) => itens === null ? <div className="flex justify-center py-8"><Spinner /></div>
    : itens.length === 0 ? vazio : (
      <ul className="flex flex-col gap-2">
        {itens.map((a, idx) => {
          const k = chaveAlimento(a)
          const feito = adicionados.has(k)
          return (
            <li key={k} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
              <div className="flex items-center gap-1 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 rounded-2xl pr-1.5 transition">
                <button type="button" onClick={() => abrirItem(a, idx)} className="flex-1 min-w-0 text-left pl-3.5 py-2">
                  <span className="block text-sm font-semibold text-zinc-100 truncate">{a.nome}</span>
                  <span className="flex items-center gap-1 text-xs text-zinc-500 min-w-0"><span className="truncate">{fmt(a.calorias)} kcal · {a.quantidade || '1 porção'}</span><ChevronRight className="w-3.5 h-3.5 shrink-0" /></span>
                </button>
                <Estrela ativa={favPorChave.has(k)} onClick={() => alternarFavorito(a)} />
                <button type="button" aria-label={`Adicionar ${a.nome}`} disabled={salvando}
                  onClick={e => { e.stopPropagation(); adicionar([a], origem, false) }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 ${feito ? 'bg-green-500 text-zinc-950' : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'}`}>
                  {feito ? <Check key="c" className="w-5 h-5 animate-pop" /> : <Plus className="w-5 h-5" />}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )

  const campoBusca = (placeholder: string) => (
    <label className="relative block">
      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={placeholder} type="search" enterKeyHint="search"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
    </label>
  )

  return (
    <Folha titulo={titulo} onClose={onClose}
      rodape={adicionados.size > 0 && (aba === 'buscar' || aba === 'favoritos' || aba === 'receitas')
        ? <Button size="lg" className="w-full" onClick={onClose}><Check className="w-5 h-5" />Concluir ({adicionados.size})</Button> : undefined}>
      {!ingrediente && <SeletorRefeicao valor={refeicao} onChange={setRefeicao} />}
      <div className={`mt-4 grid ${abas.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} gap-1 bg-zinc-800/60 rounded-xl p-1`} role="tablist">
        {abas.map(({ id, rotulo, icone: Icone }) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => { setAba(id); setErro(''); if (id === 'receitas' && receitas === null) listarReceitas(userId).then(setReceitas).catch(() => setReceitas([])) }}
            className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-semibold transition ${aba === id ? 'bg-zinc-950 text-green-400 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}>
            <Icone className="w-4 h-4" />{rotulo}
          </button>
        ))}
      </div>

      {aba === 'buscar' && (
        <div className="mt-4">
          {campoBusca('Buscar alimento (ex.: arroz, ovo, whey)')}
          <BuscaAlimentos q={busca} onAbrir={abrirBase}
            onAdicionarRapido={item => adicionar([paraAlimento(item, medidasDe(item)[0])], 'busca', false)} />
          {recentesFiltrados && recentesFiltrados.length > 0 && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-1">{q ? 'Nos seus recentes' : 'Recentes'}</p>
              {!q && <p className="text-xs text-zinc-500 mb-2 px-1">Toque no alimento para mudar a quantidade · <span className="text-green-400">+</span> adiciona direto</p>}
              {lista(recentesFiltrados, 'recente', null)}
            </div>
          )}
          {!q && recentes?.length === 0 && <p className="text-sm text-zinc-500 text-center py-6">Busque um alimento, leia o código de barras ou use a IA. Os que você registrar aparecem aqui.</p>}
        </div>
      )}

      {aba === 'favoritos' && (
        <div className="mt-4 flex flex-col gap-3">
          {campoBusca('Buscar nos favoritos')}
          {lista(favoritosFiltrados, 'favorito', (
            <div className="text-center py-8 px-4">
              <p className="text-zinc-300 font-semibold">{q ? 'Nada encontrado' : 'Nenhum favorito ainda'}</p>
              <p className="text-sm text-zinc-500 mt-1">Toque na estrela de um alimento para guardar aqui.</p>
            </div>
          ))}
        </div>
      )}

      {aba === 'receitas' && (
        <div className="mt-4 flex flex-col gap-3">
          {receitas === null ? <div className="flex justify-center py-8"><Spinner /></div>
            : receitas.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-zinc-300 font-semibold">Nenhuma receita ainda</p>
                <p className="text-sm text-zinc-500 mt-1">Monte uma receita com os ingredientes e o rendimento. O app calcula as calorias por porção.</p>
              </div>
            ) : lista(receitas.map(r => porcaoReceita(r.nome, r.ingredientes, r.porcoes, r.peso_final_g)), 'receita', null, (a, i) => {
              // Com peso final, abre com as medidas (porção ou gramas)
              const item = receitaComoItem(receitas[i])
              if (item) abrirBase(item); else abrir(a)
            })}
          <Link to="/receitas/nova" onClick={onClose} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 py-3 text-sm font-semibold text-green-400 hover:border-green-500/50">
            <Plus className="w-4 h-4" />Criar receita
          </Link>
        </div>
      )}

      {aba === 'texto' && <AbaTexto inicial={busca} salvando={salvando} favPorChave={favPorChave} alternarFavorito={alternarFavorito} onSalvar={itens => adicionar(itens, 'texto', true)} />}
      {aba === 'foto' && <AbaFoto salvando={salvando} onSalvar={itens => adicionar(itens, 'foto', true)} />}
      {erro && <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3"><p className="text-red-400 text-sm">{erro}</p></div>}
    </Folha>
  )
}

function SeletorRefeicao({ valor, onChange }: { valor: Refeicao; onChange: (r: Refeicao) => void }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Refeição">
      {REFEICOES.map(r => (
        <button key={r} type="button" onClick={() => onChange(r)} aria-pressed={valor === r}
          className={`px-2.5 py-1.5 rounded-full text-[13px] font-medium border transition ${valor === r ? 'bg-green-500 text-zinc-950 border-green-500' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}>
          {r}
        </button>
      ))}
    </div>
  )
}

function Estimativa({ itens, onEditar, favPorChave, alternarFavorito }: {
  itens: FoodEstimate[]; onEditar: (i: number, a: Alimento | null) => void; favPorChave?: Map<string, Favorito>; alternarFavorito?: (a: Alimento) => void
}) {
  const total = itens.reduce((s, i) => s + i.calorias, 0)
  const [editando, setEditando] = useState<number | null>(null)
  return (
    <div className="mt-4 bg-green-500/5 border border-green-500/20 rounded-2xl p-3.5 animate-fade-up">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">Estimativa da IA</p>
        <span className="text-sm font-bold text-green-400">{fmt(total)} kcal</span>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-zinc-800/70">
        {itens.map((a, i) => (
          <li key={i} className="py-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setEditando(editando === i ? null : i)} className="flex-1 min-w-0 text-left">
                <span className="flex justify-between gap-2 text-sm"><span className="text-zinc-100 truncate">{a.nome}</span><span className="text-zinc-300 shrink-0">{fmt(a.calorias)} kcal</span></span>
                <span className="block text-xs text-zinc-500">{a.quantidade} · {macros(a)}</span>
              </button>
              <button type="button" onClick={() => setEditando(editando === i ? null : i)} aria-label={`Editar ${a.nome}`} className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 shrink-0"><Pencil className="w-4 h-4" /></button>
              {favPorChave && alternarFavorito && <Estrela ativa={favPorChave.has(chaveAlimento(a))} onClick={() => alternarFavorito(a)} />}
            </div>
            {editando === i && (
              <div className="mt-3 pb-1 animate-fade-up">
                <EditorAlimento original={(a as ItemEstimado).original ?? a} onChange={novo => onEditar(i, novo)} />
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => { onEditar(i, null); setEditando(null) }} className="flex-1 rounded-xl border border-zinc-800 py-2 text-sm text-red-400">Remover item</button>
                  <button type="button" onClick={() => setEditando(null)} className="flex-1 rounded-xl bg-zinc-800 py-2 text-sm font-semibold">Pronto</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Item da IA editado pela pessoa; guarda o valor original para recalcular a partir dele. */
type ItemEstimado = FoodEstimate & { original?: Alimento }
const editarLista = (set: (f: (p: ItemEstimado[]) => ItemEstimado[]) => void) => (i: number, a: Alimento | null) =>
  set(p => (a ? p.map((x, j) => (j === i ? { ...x, ...a, original: x.original ?? x } : x)) : p.filter((_, j) => j !== i)))

function AbaTexto({ inicial, salvando, onSalvar, favPorChave, alternarFavorito }: {
  inicial: string; salvando: boolean; onSalvar: (i: FoodEstimate[]) => void; favPorChave: Map<string, Favorito>; alternarFavorito: (a: Alimento) => void
}) {
  const [descricao, setDescricao] = useState(inicial)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [preview, setPreview] = useState<FoodEstimate[]>([])
  const estimar = async () => {
    if (!descricao.trim()) return
    setErro(''); setCarregando(true); setPreview([])
    try {
      const r = await estimarAlimentoTexto(descricao)
      if (r.length === 0) setErro('A IA não conseguiu estimar. Tente ser mais específico.')
      else setPreview(r)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao estimar') } finally { setCarregando(false) }
  }
  return (
    <div className="mt-4">
      <Textarea label="O que você comeu?" placeholder="Ex.: 150 g de arroz, 1 concha de feijão e 1 filé de frango" rows={3}
        value={descricao} onChange={e => { setDescricao(e.target.value); setPreview([]) }} />
      <p className="text-xs text-zinc-500 mt-1.5">Escreva a porção (gramas, colheres, unidades) e a IA calcula. Depois você pode ajustar cada item.</p>
      {preview.length > 0 && <Estimativa itens={preview} onEditar={editarLista(setPreview)} favPorChave={favPorChave} alternarFavorito={alternarFavorito} />}
      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      <div className="mt-4">
        {preview.length === 0
          ? <Button size="lg" className="w-full" loading={carregando} disabled={!descricao.trim()} onClick={estimar}><Sparkles className="w-4 h-4" />Calcular com IA</Button>
          : <Button size="lg" className="w-full" loading={salvando} onClick={() => onSalvar(preview)}>Adicionar {preview.length > 1 ? `${preview.length} itens` : ''}</Button>}
      </div>
    </div>
  )
}

function AbaFoto({ salvando, onSalvar }: { salvando: boolean; onSalvar: (i: FoodEstimate[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [img, setImg] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [preview, setPreview] = useState<FoodEstimate[]>([])
  const lerArquivo = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const im = new Image()
      im.onload = () => {
        const c = document.createElement('canvas')
        const s = Math.min(1, 1200 / im.width)
        c.width = im.width * s; c.height = im.height * s
        const ctx = c.getContext('2d'); if (!ctx) return
        ctx.drawImage(im, 0, 0, c.width, c.height)
        setImg(c.toDataURL('image/jpeg', 0.75))
      }
      im.src = r.result as string
    }
    r.readAsDataURL(file)
  }
  const analisar = async () => {
    if (!img) return
    setErro(''); setCarregando(true); setPreview([])
    try {
      const r = await analisarImagemAlimento(img)
      if (r.length === 0) setErro('A IA não identificou alimentos. Tire outra foto.')
      else setPreview(r)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao analisar') } finally { setCarregando(false) }
  }
  return (
    <div className="mt-4">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
      {!img
        ? <button onClick={() => ref.current?.click()} className="w-full border-2 border-dashed border-zinc-700 hover:border-green-500/50 rounded-2xl p-8 text-center transition">
            <Camera className="w-9 h-9 mx-auto text-green-400" />
            <p className="text-sm font-semibold text-zinc-200 mt-2">Tirar foto ou escolher</p>
            <p className="text-xs text-zinc-500 mt-1">No celular, abre a câmera direto</p>
          </button>
        : <div className="relative animate-fade-up">
            <img src={img} alt="Prato" className="w-full rounded-2xl" />
            <button onClick={() => { setImg(null); setPreview([]) }} aria-label="Remover foto" className="absolute top-2 right-2 bg-zinc-950/70 text-zinc-100 rounded-full p-1.5"><X className="w-4 h-4" /></button>
          </div>}
      {preview.length > 0 && <Estimativa itens={preview} onEditar={editarLista(setPreview)} />}
      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      {img && (
        <div className="mt-4">
          {preview.length === 0
            ? <Button size="lg" className="w-full" loading={carregando} onClick={analisar}><Sparkles className="w-4 h-4" />Analisar com IA</Button>
            : <Button size="lg" className="w-full" loading={salvando} onClick={() => onSalvar(preview)}>Adicionar</Button>}
        </div>
      )}
    </div>
  )
}

/** Edição de um alimento já registrado no diário. */
export function EditarRegistro({ registro, onClose, onSalvo, onRemover }: {
  registro: RegistroAlimento; onClose: () => void; onSalvo: () => void; onRemover: () => void
}) {
  const [refeicao, setRefeicao] = useState<Refeicao>(grupoRefeicao(registro.refeicao))
  const [editado, setEditado] = useState<Alimento>(registro)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const salvar = async () => {
    setErro(''); setSalvando(true)
    try {
      // Mantém o nome antigo da refeição (ex.: "Lanche da tarde") se a pessoa não mudou de grupo
      const r = grupoRefeicao(registro.refeicao) === refeicao && registro.refeicao ? registro.refeicao : refeicao
      await atualizarRegistro(registro.id, { ...editado, refeicao: r })
      onSalvo(); onClose()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar'); setSalvando(false) }
  }
  return (
    <Folha titulo={<h2 className="text-lg font-bold text-zinc-50">Editar alimento</h2>} onClose={onClose}
      rodape={<div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onRemover}><Trash2 className="w-4 h-4" />Remover</Button>
        <Button className="flex-[2]" loading={salvando} onClick={salvar}>Salvar alterações</Button>
      </div>}>
      <div className="animate-fade-up">
        <p className="text-xl font-bold text-zinc-50">{editado.nome}</p>
        <p className="text-sm text-zinc-400 mt-0.5">{editado.quantidade || '1 porção'}</p>
      </div>
      <div className="mt-4"><EditorAlimento original={registro} onChange={setEditado} /></div>
      <SeletorRefeicao valor={refeicao} onChange={setRefeicao} />
      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
    </Folha>
  )
}
