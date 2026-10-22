import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { gerarDieta } from '../lib/openai'
import type { DietaFormData } from '../lib/openai'
import type { Dieta } from '../types'
import { Button, Input, Select, Textarea, Card, Badge, Spinner, EmptyState, SectionHeader } from '../components/UI'
import CalorieCounter from './CalorieCounter'

function DietMenu({ onSelect }: { onSelect: (v: 'planos' | 'contador') => void }) {
  return (
    <div className="flex flex-col gap-5" translate="no">
      <div><h1 className="text-2xl font-bold text-zinc-100">Dieta</h1><p className="text-sm text-zinc-500">Escolha uma opção</p></div>
      <button onClick={() => onSelect('planos')} className="text-left">
        <Card className="hover:border-green-500/40 transition active:scale-[0.99]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/15 rounded-2xl flex items-center justify-center shrink-0 text-2xl">✨</div>
            <div className="flex-1">
              <p className="font-semibold text-zinc-100">Plano de Dieta com IA</p>
              <p className="text-xs text-zinc-500 mt-0.5">Gera plano personalizado com refeições e macros</p>
            </div>
            <span className="text-zinc-500">→</span>
          </div>
        </Card>
      </button>
      <button onClick={() => onSelect('contador')} className="text-left">
        <Card className="hover:border-blue-500/40 transition active:scale-[0.99]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/15 rounded-2xl flex items-center justify-center shrink-0 text-2xl">🍽️</div>
            <div className="flex-1">
              <p className="font-semibold text-zinc-100">Contador de Calorias</p>
              <p className="text-xs text-zinc-500 mt-0.5">Registra por foto ou texto, IA estima nutrientes</p>
            </div>
            <span className="text-zinc-500">→</span>
          </div>
        </Card>
      </button>
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
  useEffect(() => {
    supabase.from('dietas').select('*').eq('id', id).single().then(({ data }) => { setDieta(data); setLoading(false) })
  }, [id])
  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!dieta) return <div className="text-center py-16 text-zinc-500">Dieta não encontrada</div>
  const plano = dieta.plano ?? {}
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
        <button onClick={del} className="text-red-500/60 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10">🗑</button>
      </div>
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
  if (view === 'contador') return <CalorieCounter onBack={() => setView('menu')} />
  return <DietMenu onSelect={setView} />
}
