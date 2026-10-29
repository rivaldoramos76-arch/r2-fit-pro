import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { gerarDieta, ajustarDieta, recalcularDieta } from '../lib/openai'
import type { DietaFormData, PlanoAlimentar } from '../lib/openai'
import EditorDieta from '../components/dieta/EditorDieta'
import { Pencil, Sparkles } from 'lucide-react'
import type { Dieta } from '../types'
import { Button, Input, Select, Textarea, Card, Badge, Spinner, EmptyState, SectionHeader } from '../components/UI'

function DietMenu({ onSelect }: { onSelect: (v: 'planos' | 'contador') => void }) {
  return (
    <div className="flex flex-col gap-5" translate="no">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dieta</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Escolha uma opção</p>
      </div>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <button
          onClick={() => onSelect('planos')}
          className="group text-left rounded-3xl p-5 min-h-[150px] flex flex-col justify-between gap-4 bg-gradient-to-br from-green-500/20 via-green-500/10 to-zinc-900 border border-green-500/30 hover:border-green-400/60 transition active:scale-[0.98]">
          <span className="w-12 h-12 rounded-2xl bg-green-500 text-zinc-950 flex items-center justify-center shadow-lg shadow-green-500/20">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
          </span>
          <span>
            <span className="block font-bold text-lg text-zinc-100 leading-tight">Plano de Dieta com IA</span>
            <span className="block text-sm text-zinc-400 mt-1 leading-snug">Gera plano personalizado com refeições e macros</span>
          </span>
        </button>
        <button
          onClick={() => onSelect('contador')}
          className="group text-left rounded-3xl p-5 min-h-[150px] flex flex-col justify-between gap-4 bg-zinc-900 border border-zinc-800 hover:border-green-500/40 transition active:scale-[0.98]">
          <span className="w-12 h-12 rounded-2xl bg-zinc-800 text-green-400 border border-zinc-700 flex items-center justify-center group-hover:bg-zinc-700 transition">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
          </span>
          <span>
            <span className="block font-bold text-lg text-zinc-100 leading-tight">Diário alimentar</span>
            <span className="block text-sm text-zinc-400 mt-1 leading-snug">Registra por foto ou texto, IA estima nutrientes</span>
          </span>
        </button>
      </div>
    </div>
  )
}

function DietList({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [dietas, setDietas] = useState<Dieta[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('dietas').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setDietas(data ?? []); setLoading(false) })
  }, [user])

  const del = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Excluir este plano?')) return
    await supabase.from('dietas').delete().eq('id', id)
    setDietas(p => p.filter(d => d.id !== id))
  }

  if (showForm) return <DietForm onBack={() => setShowForm(false)} onCreated={(d) => { setDietas(p => [d, ...p]); setShowForm(false) }} />

  return (
    <div className="flex flex-col gap-5" translate="no">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 p-1.5 -ml-1.5 rounded-lg hover:bg-zinc-800">←</button>
        <SectionHeader title="Planos de Dieta" subtitle="Gerados por IA" action={<Button onClick={() => setShowForm(true)} size="sm">+ Nova</Button>} />
      </div>
      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        : dietas.length === 0 ? <EmptyState title="Nenhuma dieta ainda" description="Crie seu primeiro plano com IA" action={<Button onClick={() => setShowForm(true)}>Criar com IA</Button>} />
        : <div className="flex flex-col gap-3">{dietas.map((d) => (
            <div key={d.id} className="relative">
              <Link to={`/dieta/${d.id}`}><Card className="hover:border-zinc-700 transition">
                <div className="flex items-start justify-between gap-3 pr-10">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-100 truncate">{d.nome}</p>
                    <p className="text-xs text-zinc-500 mt-1">{new Date(d.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-green-400">{d.calorias_dia}</p>
                    <p className="text-xs text-zinc-500">kcal/dia</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="green">{d.objetivo}</Badge>
                  <Badge variant="zinc">{d.plano?.refeicoes?.length ?? 0} refeições</Badge>
                  {d.plano?.macros && <Badge variant="zinc">P: {d.plano.macros.proteina_g}g</Badge>}
                </div>
              </Card></Link>
              <button onClick={(e) => del(e, d.id)} aria-label="Excluir"
                className="absolute top-3 right-3 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-red-500/70 hover:text-red-400 hover:bg-red-500/10">🗑</button>
            </div>
          ))}</div>}
    </div>
  )
}

function DietForm({ onBack, onCreated }: { onBack: () => void; onCreated: (d: Dieta) => void }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<DietaFormData>({
    objetivo: 'Perda de gordura', peso: 70, altura: 170, idade: 25, sexo: 'Masculino',
    nivel_atividade: 'Moderadamente ativo', restricoes: '', refeicoes_dia: 5,
  })
  const set = <K extends keyof DietaFormData>(k: K, v: DietaFormData[K]) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError(''); setLoading(true)
    try {
      const plano = await gerarDieta(form)
      const { data, error: dbErr } = await supabase.from('dietas').insert({
        user_id: user.id, nome: plano.nome, objetivo: plano.objetivo,
        calorias_dia: plano.calorias_dia, plano,
      }).select().single()
      if (dbErr) throw dbErr
      onCreated(data as Dieta)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar dieta'
      setError(msg.includes('API key') ? 'Chave da OpenAI inválida.' : msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-5" translate="no">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 p-1.5 -ml-1.5 rounded-lg hover:bg-zinc-800">←</button>
        <div><h1 className="text-xl font-bold text-zinc-100">Nova Dieta com IA</h1><p className="text-sm text-zinc-500">Preencha seu perfil</p></div>
      </div>
      {loading && <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center"><Spinner size="lg" className="mx-auto mb-3" /><p className="text-green-400 font-semibold">Gerando seu plano alimentar...</p><p className="text-zinc-500 text-sm mt-1">IA calculando macros e refeições</p></div>}
      {!loading && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select label="Objetivo" value={form.objetivo} onChange={e => set('objetivo', e.target.value)}>
            <option>Perda de gordura</option><option>Ganho de massa muscular</option><option>Manutenção</option><option>Condicionamento</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Sexo" value={form.sexo} onChange={e => set('sexo', e.target.value)}><option>Masculino</option><option>Feminino</option></Select>
            <Input label="Idade" type="number" min={15} max={80} value={form.idade} onChange={e => set('idade', +e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Peso (kg)" type="number" min={30} max={250} step={0.1} value={form.peso} onChange={e => set('peso', +e.target.value)} />
            <Input label="Altura (cm)" type="number" min={140} max={220} value={form.altura} onChange={e => set('altura', +e.target.value)} />
          </div>
          <Select label="Nível de atividade física" value={form.nivel_atividade} onChange={e => set('nivel_atividade', e.target.value)}>
            <option>Sedentário</option><option>Levemente ativo</option><option>Moderadamente ativo</option><option>Muito ativo</option><option>Extremamente ativo</option>
          </Select>
          <Input label="Refeições por dia" type="number" min={3} max={8} value={form.refeicoes_dia} onChange={e => set('refeicoes_dia', +e.target.value)} />
          <Input label="Meta calórica (opcional)" type="number" min={1000} max={6000} placeholder="Deixe em branco para calcular"
            value={form.calorias_alvo ?? ''} onChange={e => set('calorias_alvo', e.target.value ? +e.target.value : undefined)} />
          <Textarea label="Restrições" placeholder="Ex: sem glúten, vegetariano, alergias..." value={form.restricoes} onChange={e => set('restricoes', e.target.value)} rows={2} />
          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3"><p className="text-red-400 text-sm">{error}</p></div>}
          <Button type="submit" size="lg" loading={loading} className="mt-2">✨ Gerar Plano com IA</Button>
        </form>
      )}
    </div>
  )
}

function DietDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const [dieta, setDieta] = useState<Dieta | null>(null)
  const [loading, setLoading] = useState(true)
  const [rascunho, setRascunho] = useState<{ nome: string; plano: PlanoAlimentar } | null>(null)
  const [pedidoIA, setPedidoIA] = useState('')
  const [ajustando, setAjustando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  useEffect(() => {
    supabase.from('dietas').select('*').eq('id', id).single().then(({ data }) => { setDieta(data); setLoading(false) })
  }, [id])
  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!dieta) return <div className="text-center py-16 text-zinc-500">Dieta não encontrada</div>
  const plano = dieta.plano ?? {}

  const gravar = async (nome: string, novo: PlanoAlimentar) => {
    const final = { ...novo, nome: nome.trim() || dieta.nome }
    const { data, error } = await supabase.from('dietas')
      .update({ nome: final.nome, calorias_dia: final.calorias_dia, objetivo: final.objetivo || dieta.objetivo, plano: final })
      .eq('id', dieta.id).select().single()
    if (error) throw new Error(error.message)
    setDieta(data as Dieta)
  }
  const salvarEdicao = async () => {
    if (!rascunho) return
    setErro(''); setSalvando(true)
    try { await gravar(rascunho.nome, rascunho.plano); setRascunho(null); setAviso('Plano atualizado.') }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar') }
    finally { setSalvando(false) }
  }
  const ajustarComIA = async () => {
    if (!pedidoIA.trim()) return
    setErro(''); setAviso(''); setAjustando(true)
    try {
      const novo = await ajustarDieta(plano as PlanoAlimentar, pedidoIA.trim())
      await gravar(novo.nome || dieta.nome, novo)
      setPedidoIA(''); setAviso('Pronto! A IA ajustou seu plano.')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível ajustar') }
    finally { setAjustando(false) }
  }

  if (rascunho) {
    return (
      <div className="flex flex-col gap-4" translate="no">
        <div className="flex items-center gap-3">
          <button onClick={() => setRascunho(null)} className="text-zinc-400 p-1.5 -ml-1.5 rounded-lg hover:bg-zinc-800" aria-label="Cancelar edição">←</button>
          <div className="flex-1 min-w-0"><h1 className="text-xl font-bold text-zinc-100">Editar plano</h1><p className="text-sm text-zinc-500">Toque numa refeição para mudar alimentos e quantidades</p></div>
        </div>
        <EditorDieta plano={rascunho.plano} onChange={p => setRascunho(r => r && { ...r, plano: p })} nome={rascunho.nome} onNome={n => setRascunho(r => r && { ...r, nome: n })} />
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="sticky bottom-24 flex gap-2 bg-zinc-950/90 backdrop-blur py-2">
          <Button variant="secondary" className="flex-1" onClick={() => setRascunho(null)}>Cancelar</Button>
          <Button className="flex-[2]" loading={salvando} onClick={salvarEdicao}>Salvar plano</Button>
        </div>
      </div>
    )
  }
  const del = async () => {
    if (!confirm('Excluir este plano?')) return
    await supabase.from('dietas').delete().eq('id', id)
    navigate('/dieta')
  }
  return (
    <div className="flex flex-col gap-5" translate="no">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dieta')} className="text-zinc-400 p-1.5 -ml-1.5 rounded-lg hover:bg-zinc-800">←</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-100 truncate">{dieta.nome}</h1>
          <p className="text-sm text-zinc-500">{new Date(dieta.created_at).toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
        </div>
        <button onClick={() => { setAviso(''); setRascunho({ nome: dieta.nome, plano: recalcularDieta({ ...(plano as PlanoAlimentar), refeicoes: plano.refeicoes ?? [] }) }) }}
          className="flex items-center gap-1.5 text-sm font-semibold text-green-400 px-3 py-1.5 rounded-lg border border-green-500/30 hover:bg-green-500/10"><Pencil className="w-4 h-4" />Editar</button>
        <button onClick={del} aria-label="Excluir plano" className="text-red-500/60 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10">🗑</button>
      </div>
      {aviso && <p role="status" className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">{aviso}</p>}
      <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20">
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-xs text-zinc-500">Calorias/dia</p><p className="text-3xl font-bold text-green-400">{plano.calorias_dia}</p><p className="text-xs text-zinc-500">kcal</p></div>
          <div className="flex flex-col gap-2">{plano.macros && <>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Proteína</span><span className="font-semibold text-zinc-200">{plano.macros.proteina_g}g</span></div>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Carboidrato</span><span className="font-semibold text-zinc-200">{plano.macros.carboidrato_g}g</span></div>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Gordura</span><span className="font-semibold text-zinc-200">{plano.macros.gordura_g}g</span></div>
          </>}</div>
        </div>
        <div className="mt-3 pt-3 border-t border-green-500/15"><Badge variant="green">{plano.objetivo}</Badge></div>
      </Card>
      <Card>
        <p className="font-semibold text-zinc-100 flex items-center gap-2"><Sparkles className="w-4 h-4 text-green-400" />Ajustar com IA</p>
        <p className="text-xs text-zinc-500 mt-1">Ex.: “troque o frango do almoço por peixe”, “sem lactose”, “diminua para 1.800 kcal”.</p>
        <Textarea value={pedidoIA} onChange={e => setPedidoIA(e.target.value)} rows={2} placeholder="O que você quer mudar?" className="mt-3" aria-label="Pedido de ajuste para a IA" />
        {erro && <p className="text-sm text-red-400 mt-2">{erro}</p>}
        <Button className="w-full mt-3" loading={ajustando} disabled={!pedidoIA.trim()} onClick={ajustarComIA}><Sparkles className="w-4 h-4" />Ajustar plano</Button>
      </Card>
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Refeições ({plano.refeicoes?.length ?? 0})</h2>
        <div className="flex flex-col gap-3">{plano.refeicoes?.map((r, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between mb-3">
              <div><p className="font-semibold text-zinc-100">{r.nome}</p><p className="text-xs text-zinc-500">{r.horario}</p></div>
              <Badge variant="green">{r.calorias} kcal</Badge>
            </div>
            <div className="flex flex-col gap-1.5">{r.alimentos?.map((a, j) => (
              <div key={j} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{a.nome}</span>
                <div className="flex items-center gap-2 text-xs text-zinc-500"><span>{a.quantidade}</span><span className="text-zinc-600">·</span><span>{a.calorias}kcal</span></div>
              </div>
            ))}</div>
          </Card>
        ))}</div>
      </div>
      {plano.dicas && plano.dicas.length > 0 && <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Dicas</h2>
        <Card><ul className="flex flex-col gap-2">{plano.dicas.map((d, i) => <li key={i} className="flex items-start gap-2 text-sm text-zinc-300"><span className="text-green-500 mt-0.5">✓</span><span>{d}</span></li>)}</ul></Card>
      </div>}
    </div>
  )
}

export default function DietPage() {
  const { id } = useParams<{ id?: string }>()
  const [view, setView] = useState<'menu' | 'planos' | 'contador'>('menu')
  if (id) return <DietDetail id={id} />
  if (view === 'planos') return <DietList onBack={() => setView('menu')} />
  if (view === 'contador') return <Navigate to="/calorias" />
  return <DietMenu onSelect={setView} />
}
