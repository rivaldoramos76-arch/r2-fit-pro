import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { estimarAlimentoTexto, analisarImagemAlimento } from '../lib/foodAI'
import type { FoodEstimate } from '../lib/foodAI'
import { Button, Select, Textarea, Card, Spinner, EmptyState } from '../components/UI'

interface FoodLog {
  id: string; user_id: string; data: string; refeicao: string | null; nome: string
  quantidade: string | null; calorias: number; proteina_g: number; carboidrato_g: number
  gordura_g: number; observacao: string | null; origem: string | null; created_at: string
}

const MEALS = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Outro']

// Datas sempre no fuso local do usuário (YYYY-MM-DD), sem conversão para UTC.
function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto flex flex-col gap-4" translate="no">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 p-1 hover:text-zinc-200 text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function PreviewList({ items }: { items: FoodEstimate[] }) {
  const total = items.reduce((s, i) => s + i.calorias, 0)
  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-400 uppercase">Estimativa</p>
        <span className="text-sm font-bold text-blue-400">{total} kcal</span>
      </div>
      {items.map((a, i) => (
        <div key={i} className="text-sm">
          <div className="flex justify-between"><span className="text-zinc-200">{a.nome}</span><span className="text-zinc-400">{a.calorias} kcal</span></div>
          <p className="text-xs text-zinc-500">{a.quantidade} · P {a.proteina_g.toFixed(0)}g · C {a.carboidrato_g.toFixed(0)}g · G {a.gordura_g.toFixed(0)}g</p>
        </div>
      ))}
    </div>
  )
}

function TextModal({ onClose, onSaved, data }: { onClose: () => void; onSaved: () => void; data: string }) {
  const { user } = useAuth()
  const [descricao, setDescricao] = useState('')
  const [refeicao, setRefeicao] = useState('Almoço')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<FoodEstimate[]>([])

  const estimate = async () => {
    if (!descricao.trim()) return
    setError(''); setLoading(true); setPreview([])
    try {
      const r = await estimarAlimentoTexto(descricao)
      if (r.length === 0) setError('IA não conseguiu estimar. Tente ser mais específico.')
      else setPreview(r)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao estimar')
    } finally { setLoading(false) }
  }

  const save = async () => {
    if (!user || preview.length === 0) return
    setLoading(true)
    const rows = preview.map(a => ({
      user_id: user.id, data, refeicao, nome: a.nome, quantidade: a.quantidade,
      calorias: a.calorias, proteina_g: a.proteina_g, carboidrato_g: a.carboidrato_g,
      gordura_g: a.gordura_g, observacao: a.observacao ?? null, origem: 'texto',
    }))
    const { error: dbErr } = await supabase.from('food_logs').insert(rows)
    setLoading(false)
    if (dbErr) setError(dbErr.message)
    else onSaved()
  }

  return (
    <Modal onClose={onClose} title="Adicionar por texto">
      <Textarea label="O que você comeu?" placeholder="Ex: 100g de arroz branco, 1 cachorro quente, 2 fatias de pizza..."
        value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} />
      <p className="text-xs text-zinc-500 -mt-2">Específico (gramas) ou genérico. A IA estima.</p>
      <Select label="Refeição" value={refeicao} onChange={e => setRefeicao(e.target.value)}>{MEALS.map(m => <option key={m}>{m}</option>)}</Select>
      {preview.length > 0 && <PreviewList items={preview} />}
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3"><p className="text-red-400 text-sm">{error}</p></div>}
      <div className="flex gap-2 mt-2">
        <Button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700">Cancelar</Button>
        {preview.length === 0
          ? <Button onClick={estimate} loading={loading} className="flex-1">✨ Estimar</Button>
          : <Button onClick={save} loading={loading} className="flex-1">Salvar</Button>}
      </div>
    </Modal>
  )
}

function PhotoModal({ onClose, onSaved, data }: { onClose: () => void; onSaved: () => void; data: string }) {
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [img, setImg] = useState<string | null>(null)
  const [refeicao, setRefeicao] = useState('Almoço')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<FoodEstimate[]>([])

  const handleFile = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const d = r.result as string
      const im = new Image()
      im.onload = () => {
        const c = document.createElement('canvas')
        const s = Math.min(1, 1200 / im.width)
        c.width = im.width * s; c.height = im.height * s
        const ctx = c.getContext('2d'); if (!ctx) return
        ctx.drawImage(im, 0, 0, c.width, c.height)
        setImg(c.toDataURL('image/jpeg', 0.75))
      }
      im.src = d
    }
    r.readAsDataURL(file)
  }

  const analyze = async () => {
    if (!img) return
    setError(''); setLoading(true); setPreview([])
    try {
      const r = await analisarImagemAlimento(img)
      if (r.length === 0) setError('IA não identificou alimentos. Tire outra foto.')
      else setPreview(r)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar')
    } finally { setLoading(false) }
  }

  const save = async () => {
    if (!user || preview.length === 0) return
    setLoading(true)
    const rows = preview.map(a => ({
      user_id: user.id, data, refeicao, nome: a.nome, quantidade: a.quantidade,
      calorias: a.calorias, proteina_g: a.proteina_g, carboidrato_g: a.carboidrato_g,
      gordura_g: a.gordura_g, observacao: a.observacao ?? null, origem: 'foto',
    }))
    const { error: dbErr } = await supabase.from('food_logs').insert(rows)
    setLoading(false)
    if (dbErr) setError(dbErr.message)
    else onSaved()
  }

  return (
    <Modal onClose={onClose} title="Adicionar por foto">
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
      {!img
        ? <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-zinc-700 hover:border-blue-500/50 rounded-2xl p-8 text-center transition">
            <div className="text-4xl mb-2">📷</div>
            <p className="text-sm font-semibold text-zinc-200">Tirar foto ou escolher</p>
            <p className="text-xs text-zinc-500 mt-1">No celular abre a câmera direto</p>
          </button>
        : <div className="relative">
            <img src={img} alt="Prato" className="w-full rounded-2xl" />
            <button onClick={() => { setImg(null); setPreview([]) }} className="absolute top-2 right-2 bg-zinc-950/70 text-zinc-100 rounded-full px-2 py-1 text-sm">✕</button>
          </div>}
      <Select label="Refeição" value={refeicao} onChange={e => setRefeicao(e.target.value)}>{MEALS.map(m => <option key={m}>{m}</option>)}</Select>
      {preview.length > 0 && <PreviewList items={preview} />}
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3"><p className="text-red-400 text-sm">{error}</p></div>}
      <div className="flex gap-2 mt-2">
        <Button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700">Cancelar</Button>
        {!img ? null
          : preview.length === 0
            ? <Button onClick={analyze} loading={loading} className="flex-1">✨ Analisar</Button>
            : <Button onClick={save} loading={loading} className="flex-1">Salvar</Button>}
      </div>
    </Modal>
  )
}

export default function CalorieCounter({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [data, setData] = useState(hojeLocal)
  const [items, setItems] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'texto' | 'foto'>(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const { data: rows } = await supabase.from('food_logs').select('*').eq('user_id', user.id).eq('data', data).order('created_at', { ascending: true })
    setItems((rows as FoodLog[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [user, data])

  const totals = items.reduce((a, i) => ({
    cal: a.cal + i.calorias, p: a.p + Number(i.proteina_g), c: a.c + Number(i.carboidrato_g), g: a.g + Number(i.gordura_g),
  }), { cal: 0, p: 0, c: 0, g: 0 })

  const grouped: Record<string, FoodLog[]> = {}
  for (const i of items) {
    const k = i.refeicao || 'Outros'
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(i)
  }
  const order = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Outro', 'Outros']
  const keys = Object.keys(grouped).sort((a, b) => order.indexOf(a) - order.indexOf(b))

  const del = async (id: string) => {
    if (!confirm('Remover este item?')) return
    await supabase.from('food_logs').delete().eq('id', id)
    setItems(p => p.filter(i => i.id !== id))
  }

  const isToday = data === hojeLocal()

  return (
    <div className="flex flex-col gap-5" translate="no">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 p-1.5 -ml-1.5 rounded-lg hover:bg-zinc-800">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-zinc-100">Contador de Calorias</h1>
          <div className="flex items-center gap-1 mt-0.5">
            <button onClick={() => setData(d => somarDias(d, -1))} aria-label="Dia anterior"
              className="text-zinc-400 hover:text-zinc-100 px-1.5 py-0.5 rounded-md hover:bg-zinc-800 text-base leading-none">←</button>
            <label className="relative text-sm text-zinc-300 tabular-nums cursor-pointer">
              {formatarData(data)}
              <input type="date" value={data} onChange={e => e.target.value && setData(e.target.value)} aria-label="Escolher data"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </label>
            {isToday && <span className="text-xs text-blue-400">(hoje)</span>}
            <button onClick={() => setData(d => somarDias(d, 1))} aria-label="Próximo dia"
              className="text-zinc-400 hover:text-zinc-100 px-1.5 py-0.5 rounded-md hover:bg-zinc-800 text-base leading-none">→</button>
          </div>
        </div>
      </div>

      <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
        <div className="text-center">
          <p className="text-xs text-zinc-500">Total do dia</p>
          <p className="text-4xl font-bold text-blue-400">{totals.cal}</p>
          <p className="text-xs text-zinc-500">kcal</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-blue-500/15">
          <div className="text-center"><p className="text-xs text-zinc-500">Proteína</p><p className="font-semibold text-zinc-200">{totals.p.toFixed(0)}g</p></div>
          <div className="text-center"><p className="text-xs text-zinc-500">Carbo</p><p className="font-semibold text-zinc-200">{totals.c.toFixed(0)}g</p></div>
          <div className="text-center"><p className="text-xs text-zinc-500">Gordura</p><p className="font-semibold text-zinc-200">{totals.g.toFixed(0)}g</p></div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setModal('texto')} className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 rounded-xl py-3 px-4 text-left transition active:scale-[0.98]">
          <div className="text-2xl mb-1">⌨️</div><p className="text-sm font-semibold text-zinc-100">Digitar</p><p className="text-xs text-zinc-500">Alimento ou prato</p>
        </button>
        <button onClick={() => setModal('foto')} className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 rounded-xl py-3 px-4 text-left transition active:scale-[0.98]">
          <div className="text-2xl mb-1">📷</div><p className="text-sm font-semibold text-zinc-100">Foto</p><p className="text-xs text-zinc-500">Analisar com IA</p>
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        : items.length === 0 ? <EmptyState title="Nada registrado" description="Adicione o que comeu com foto, texto específico (100g arroz) ou genérico (1 cachorro quente)" />
        : <div className="flex flex-col gap-4">{keys.map(m => {
            const its = grouped[m]
            const mc = its.reduce((s, i) => s + i.calorias, 0)
            return (
              <div key={m}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold text-zinc-300">{m}</h3>
                  <span className="text-xs text-zinc-500">{mc} kcal</span>
                </div>
                <Card>
                  <div className="flex flex-col divide-y divide-zinc-800/50">{its.map(it => (
                    <div key={it.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-100 text-sm">{it.nome}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{it.quantidade} · P {Number(it.proteina_g).toFixed(0)}g · C {Number(it.carboidrato_g).toFixed(0)}g · G {Number(it.gordura_g).toFixed(0)}g</p>
                        {it.observacao && <p className="text-xs text-zinc-600 italic mt-0.5">{it.observacao}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-blue-400">{it.calorias}</span>
                        <button onClick={() => del(it.id)} aria-label="Remover" className="text-red-500/50 hover:text-red-400 p-1 text-sm">✕</button>
                      </div>
                    </div>
                  ))}</div>
                </Card>
              </div>
            )
          })}</div>}

      {modal === 'texto' && <TextModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} data={data} />}
      {modal === 'foto' && <PhotoModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} data={data} />}
    </div>
  )
}
