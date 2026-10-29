import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X, Search, Star, Plus, Check, Clock, Sparkles, Camera, Minus, ChevronLeft } from 'lucide-react'
import { estimarAlimentoTexto, analisarImagemAlimento } from '../../lib/foodAI'
import type { FoodEstimate } from '../../lib/foodAI'
import { REFEICOES, chaveAlimento, escalarAlimento } from '../../lib/diario'
import type { Alimento, Refeicao } from '../../lib/diario'
import { alimentosRecentes, listarFavoritos, favoritar, desfavoritar, registrarAlimentos } from '../../lib/nutricao'
import type { Favorito } from '../../lib/nutricao'
import { Button, Spinner, Textarea } from '../UI'
import { fmt } from './Graficos'

type Aba = 'recentes' | 'favoritos' | 'texto' | 'foto'
const ABAS: { id: Aba; rotulo: string; icone: typeof Clock }[] = [
  { id: 'recentes', rotulo: 'Recentes', icone: Clock },
  { id: 'favoritos', rotulo: 'Favoritos', icone: Star },
  { id: 'texto', rotulo: 'Digitar', icone: Sparkles },
  { id: 'foto', rotulo: 'Foto', icone: Camera },
]
const PORCOES = [0.5, 1, 1.5, 2, 2.5, 3]

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
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

export default function AdicionarAlimento({ userId, data, refeicaoInicial, onClose, onSalvo }: {
  userId: string; data: string; refeicaoInicial: Refeicao; onClose: () => void; onSalvo: () => void
}) {
  const [refeicao, setRefeicao] = useState<Refeicao>(refeicaoInicial)
  const [aba, setAba] = useState<Aba>('recentes')
  const [recentes, setRecentes] = useState<Alimento[] | null>(null)
  const [favoritos, setFavoritos] = useState<Favorito[] | null>(null)
  const [busca, setBusca] = useState('')
  const [detalhe, setDetalhe] = useState<Alimento | null>(null)
  const [porcoes, setPorcoes] = useState(1)
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
    setErro(''); setSalvando(true)
    try {
      await registrarAlimentos(userId, data, refeicao, itens, origem)
      setAdicionados(s => new Set([...s, ...itens.map(chaveAlimento)]))
      onSalvo()
      if (fechar) onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível adicionar')
    } finally { setSalvando(false) }
  }

  const lista = aba === 'recentes' ? recentes : aba === 'favoritos' ? favoritos : null
  const filtrada = useMemo(() => {
    if (!lista) return null
    const q = semAcento(busca.trim())
    return q ? lista.filter(a => semAcento(a.nome).includes(q)) : lista
  }, [lista, busca])

  const titulo = detalhe
    ? <button onClick={() => setDetalhe(null)} className="flex items-center gap-1 text-zinc-300 hover:text-zinc-100 text-sm font-semibold -ml-1"><ChevronLeft className="w-5 h-5" />Voltar</button>
    : <h2 className="text-lg font-bold text-zinc-50">Adicionar alimento</h2>

  if (detalhe) {
    const escalado = escalarAlimento(detalhe, porcoes)
    const i = PORCOES.indexOf(porcoes)
    return (
      <Folha titulo={titulo} onClose={onClose}
        rodape={<Button size="lg" className="w-full" loading={salvando} onClick={async () => { await adicionar([escalado], 'recente', false); setDetalhe(null); setPorcoes(1) }}>Adicionar a {refeicao}</Button>}>
        <div className="flex items-start gap-2 animate-fade-up">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-zinc-50">{detalhe.nome}</p>
            <p className="text-sm text-zinc-400 mt-0.5">{detalhe.quantidade || '1 porção'}</p>
          </div>
          <Estrela ativa={favPorChave.has(chaveAlimento(detalhe))} onClick={() => alternarFavorito(detalhe)} />
        </div>
        <div className="mt-5 flex items-center justify-between bg-zinc-800/60 rounded-2xl p-2">
          <button onClick={() => i > 0 && setPorcoes(PORCOES[i - 1])} disabled={i <= 0} aria-label="Menos"
            className="w-11 h-11 rounded-xl bg-zinc-900 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"><Minus className="w-5 h-5" /></button>
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{String(porcoes).replace('.', ',')}</p>
            <p className="text-xs text-zinc-400">{porcoes === 1 ? 'porção' : 'porções'}</p>
          </div>
          <button onClick={() => i < PORCOES.length - 1 && setPorcoes(PORCOES[i + 1])} disabled={i >= PORCOES.length - 1} aria-label="Mais"
            className="w-11 h-11 rounded-xl bg-zinc-900 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"><Plus className="w-5 h-5" /></button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[['Calorias', fmt(escalado.calorias), 'text-green-400'], ['Carbo', fmt(escalado.carboidrato_g) + 'g', 'text-lime-400'], ['Proteína', fmt(escalado.proteina_g) + 'g', 'text-emerald-400'], ['Gordura', fmt(escalado.gordura_g) + 'g', 'text-amber-400']].map(([r, v, c]) => (
            <div key={r} className="bg-zinc-800/40 rounded-xl py-3">
              <p className={`text-base font-bold tabular-nums ${c}`}>{v}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">{r}</p>
            </div>
          ))}
        </div>
        <SeletorRefeicao valor={refeicao} onChange={setRefeicao} />
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      </Folha>
    )
  }

  return (
    <Folha titulo={titulo} onClose={onClose}
      rodape={adicionados.size > 0 && (aba === 'recentes' || aba === 'favoritos')
        ? <Button size="lg" className="w-full" onClick={onClose}><Check className="w-5 h-5" />Concluir ({adicionados.size})</Button> : undefined}>
      <SeletorRefeicao valor={refeicao} onChange={setRefeicao} />
      <div className="mt-4 grid grid-cols-4 gap-1 bg-zinc-800/60 rounded-xl p-1" role="tablist">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => { setAba(id); setErro('') }}
            className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-semibold transition ${aba === id ? 'bg-zinc-950 text-green-400 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}>
            <Icone className="w-4 h-4" />{rotulo}
          </button>
        ))}
      </div>

      {(aba === 'recentes' || aba === 'favoritos') && (
        <div className="mt-4">
          <label className="relative block">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={aba === 'recentes' ? 'Buscar nos recentes' : 'Buscar nos favoritos'}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </label>
          {filtrada === null ? <div className="flex justify-center py-10"><Spinner /></div>
            : filtrada.length === 0 ? (
              <div className="text-center py-10 px-4">
                <p className="text-zinc-300 font-semibold">{busca ? 'Nada encontrado' : aba === 'recentes' ? 'Nenhum alimento recente' : 'Nenhum favorito ainda'}</p>
                <p className="text-sm text-zinc-500 mt-1">{aba === 'recentes' ? 'Use "Digitar" ou "Foto" para registrar; eles aparecem aqui depois.' : 'Toque na estrela de um alimento para guardar aqui.'}</p>
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {filtrada.map((a, idx) => {
                  const k = chaveAlimento(a)
                  const feito = adicionados.has(k)
                  return (
                    <li key={k} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}>
                      <div className="flex items-center gap-1 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 rounded-2xl pr-1.5 transition">
                        <button type="button" onClick={() => { setDetalhe(a); setPorcoes(1) }} className="flex-1 min-w-0 text-left pl-3.5 py-2">
                          <span className="block text-sm font-semibold text-zinc-100 truncate">{a.nome}</span>
                          <span className="block text-xs text-zinc-500 truncate">{fmt(a.calorias)} kcal · {a.quantidade || '1 porção'}</span>
                        </button>
                        <Estrela ativa={favPorChave.has(k)} onClick={() => alternarFavorito(a)} />
                        <button type="button" aria-label={`Adicionar ${a.nome}`} disabled={salvando}
                          onClick={e => { e.stopPropagation(); adicionar([a], aba === 'favoritos' ? 'favorito' : 'recente', false) }}
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 ${feito ? 'bg-green-500 text-zinc-950' : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'}`}>
                          {feito ? <Check key="c" className="w-5 h-5 animate-pop" /> : <Plus className="w-5 h-5" />}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
        </div>
      )}

      {aba === 'texto' && <AbaTexto salvando={salvando} favPorChave={favPorChave} alternarFavorito={alternarFavorito} onSalvar={itens => adicionar(itens, 'texto', true)} />}
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

function Estimativa({ itens, favPorChave, alternarFavorito }: { itens: FoodEstimate[]; favPorChave?: Map<string, Favorito>; alternarFavorito?: (a: Alimento) => void }) {
  const total = itens.reduce((s, i) => s + i.calorias, 0)
  return (
    <div className="mt-4 bg-green-500/5 border border-green-500/20 rounded-2xl p-3.5 animate-fade-up">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">Estimativa da IA</p>
        <span className="text-sm font-bold text-green-400">{fmt(total)} kcal</span>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-zinc-800/70">
        {itens.map((a, i) => (
          <li key={i} className="py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2 text-sm"><span className="text-zinc-100 truncate">{a.nome}</span><span className="text-zinc-300 shrink-0">{fmt(a.calorias)} kcal</span></div>
              <p className="text-xs text-zinc-500">{a.quantidade} · {macros(a)}</p>
            </div>
            {favPorChave && alternarFavorito && <Estrela ativa={favPorChave.has(chaveAlimento(a))} onClick={() => alternarFavorito(a)} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AbaTexto({ salvando, onSalvar, favPorChave, alternarFavorito }: {
  salvando: boolean; onSalvar: (i: FoodEstimate[]) => void; favPorChave: Map<string, Favorito>; alternarFavorito: (a: Alimento) => void
}) {
  const [descricao, setDescricao] = useState('')
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
      <p className="text-xs text-zinc-500 mt-1.5">Escreva a porção (gramas, colheres, unidades) e a IA calcula.</p>
      {preview.length > 0 && <Estimativa itens={preview} favPorChave={favPorChave} alternarFavorito={alternarFavorito} />}
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
      {preview.length > 0 && <Estimativa itens={preview} />}
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
