import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Target, Dumbbell, Salad, ChevronRight, Pencil } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Dieta, Treino } from '../types'
import { Spinner } from '../components/UI'
import { useAcesso } from '../context/AcessoContext'
import { useMeta, registrosDoDia, somarTotais } from '../lib/nutricao'
import type { RegistroAlimento } from '../lib/nutricao'
import { REFEICOES, grupoRefeicao, hojeLocal } from '../lib/diario'
import type { Refeicao } from '../lib/diario'
import { AnelCalorias, BarraMacro, fmt } from '../components/nutricao/Graficos'
import InstalarApp from '../components/InstalarApp'
import CartaoAgua from '../components/progresso/CartaoAgua'
import GraficoPeso from '../components/progresso/GraficoPeso'
import { exerciciosDoDia, historicoPeso } from '../lib/progresso'
import type { Exercicio } from '../lib/progresso'
import { resumoPeso } from '../lib/exercicios'
import type { PontoPeso } from '../lib/exercicios'
import { somarDias } from '../lib/diario'
import { Flame, Scale } from 'lucide-react'

const ICONE_REFEICAO: Record<Refeicao, string> = { 'Café da manhã': '☕', Almoço: '🍽️', Jantar: '🌙', Lanches: '🍎' }

export default function DashboardPage() {
  const { user } = useAuth()
  const { premium, carregando: carregandoAcesso } = useAcesso()
  const { meta, carregando: carregandoMeta, recarregar: recarregarMeta } = useMeta(user?.id)
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [pesos, setPesos] = useState<PontoPeso[]>([])
  const [lastDieta, setLastDieta] = useState<Dieta | null>(null)
  const [lastTreino, setLastTreino] = useState<Treino | null>(null)
  const [registros, setRegistros] = useState<RegistroAlimento[]>([])
  const [loading, setLoading] = useState(true)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const primeiroNome = (user?.user_metadata?.nome ?? user?.email?.split('@')[0] ?? 'Atleta').split(' ')[0]
  const nomeUsuario = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [{ data: dietas }, { data: treinos }, regs, exs, ps] = await Promise.all([
        supabase.from('dietas').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('treinos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        registrosDoDia(user.id, hojeLocal()),
        exerciciosDoDia(user.id, hojeLocal()).catch(() => [] as Exercicio[]),
        historicoPeso(user.id, somarDias(hojeLocal(), -30)).catch(() => [] as PontoPeso[]),
      ])
      setExercicios(exs)
      setPesos(ps)
      setLastDieta(dietas?.[0] ?? null)
      setLastTreino(treinos?.[0] ?? null)
      setRegistros(regs)
      setLoading(false)
    }
    load()
  }, [user])

  if (loading || carregandoMeta) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    )
  }

  const totais = somarTotais(registros)
  const queimado = exercicios.reduce((s, e) => s + e.calorias, 0)
  const somar = !!meta?.somar_exercicio
  const resumo = resumoPeso(pesos, meta?.meta_peso_kg)
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <p className="text-zinc-500 text-sm first-letter:uppercase">{hoje}</p>
        <h1 className="text-2xl font-bold text-zinc-50 mt-0.5">{greeting()}, {nomeUsuario}</h1>
      </div>

      <InstalarApp />

      {!carregandoAcesso && !premium && (
        <Link to="/assinatura" className="block bg-gradient-to-br from-green-500/20 to-zinc-900 border border-green-500/30 rounded-2xl p-4 animate-fade-up">
          <p className="font-semibold">Ative o R2 Fit Pro Premium</p>
          <p className="text-sm text-zinc-400 mt-1">Libere treinos com IA, contador com áudio, dietas personalizadas e contador de calorias.</p>
          <span className="inline-block mt-3 text-sm font-semibold text-green-400">Ver planos →</span>
        </Link>
      )}

      {/* Calorias do dia */}
      <section aria-label="Calorias de hoje" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-zinc-50">Calorias</h2>
            <p className="text-xs text-zinc-500">Restante = Meta − Alimentos{somar ? ' + Exercício' : ''}</p>
          </div>
          {meta && <Link to="/meta" aria-label="Editar meta" className="p-2 -mr-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><Pencil className="w-4 h-4" /></Link>}
        </div>
        {meta ? (
          <div className="mt-4 flex items-center gap-5">
            <AnelCalorias meta={meta.calorias + (somar ? queimado : 0)} consumido={totais.calorias} tamanho={152} />
            <dl className="flex-1 flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0"><Target className="w-4 h-4 text-zinc-300" /></span>
                <div><dt className="text-xs text-zinc-500">Meta</dt><dd className="font-bold tabular-nums text-zinc-100">{fmt(meta.calorias)}</dd></div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0 text-base" aria-hidden>🍴</span>
                <div><dt className="text-xs text-zinc-500">Alimentos</dt><dd className="font-bold tabular-nums text-zinc-100">{fmt(totais.calorias)}</dd></div>
              </div>
              <Link to="/calorias#exercicio" className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0"><Flame className="w-4 h-4 text-orange-400" /></span>
                <div><dt className="text-xs text-zinc-500">Exercício</dt><dd className="font-bold tabular-nums text-zinc-100">{fmt(queimado)}</dd></div>
              </Link>
            </dl>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-green-500/15 to-transparent border border-green-500/20 p-4">
            <p className="font-semibold text-zinc-100">Defina sua meta diária</p>
            <p className="text-sm text-zinc-400 mt-1">Em 1 minuto calculamos suas calorias e macros pelo seu objetivo.</p>
            <Link to="/meta" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold text-sm px-4 py-2.5 transition active:scale-95">
              <Target className="w-4 h-4" />Calcular minha meta
            </Link>
            {totais.calorias > 0 && <p className="text-xs text-zinc-500 mt-3">Hoje você registrou {fmt(totais.calorias)} kcal.</p>}
          </div>
        )}
        {meta && (
          <div className="mt-5 pt-4 border-t border-zinc-800 flex gap-4">
            <BarraMacro rotulo="Carbo" atual={totais.carboidrato_g} meta={meta.carboidrato_g} cor="carboidrato" />
            <BarraMacro rotulo="Proteína" atual={totais.proteina_g} meta={meta.proteina_g} cor="proteina" />
            <BarraMacro rotulo="Gordura" atual={totais.gordura_g} meta={meta.gordura_g} cor="gordura" />
          </div>
        )}
      </section>

      {user && <div className="animate-fade-up" style={{ animationDelay: '90ms' }}><CartaoAgua userId={user.id} data={hojeLocal()} meta={meta} onMetaMudou={recarregarMeta} /></div>}

      {/* Refeições de hoje */}
      <section aria-label="Refeições de hoje" className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-bold text-zinc-50">Refeições de hoje</h2>
          <Link to="/calorias" className="text-xs font-semibold text-green-400 hover:text-green-300">Ver diário →</Link>
        </div>
        <ul className="divide-y divide-zinc-800/70">
          {REFEICOES.map(r => {
            const itens = registros.filter(i => grupoRefeicao(i.refeicao) === r)
            const kcal = itens.reduce((s, i) => s + i.calorias, 0)
            return (
              <li key={r} className="flex items-center gap-3 px-5 py-3">
                <span className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-lg shrink-0" aria-hidden>{ICONE_REFEICAO[r]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">{r}</p>
                  <p className="text-xs text-zinc-500 truncate">{itens.length ? itens.map(i => i.nome).join(', ') : 'Nada registrado'}</p>
                </div>
                {kcal > 0 && <span className="text-sm font-semibold tabular-nums text-zinc-300">{fmt(kcal)}</span>}
                <Link to={`/calorias?adicionar=${encodeURIComponent(r)}`} aria-label={`Adicionar em ${r}`}
                  className="w-9 h-9 rounded-full bg-green-500/15 text-green-400 hover:bg-green-500/25 flex items-center justify-center shrink-0 transition active:scale-90">
                  <Plus className="w-5 h-5" />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Peso */}
      <Link to="/peso" aria-label="Peso" className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-3xl p-5 animate-fade-up transition" style={{ animationDelay: '150ms' }}>
        <span className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0"><Scale className="w-5 h-5 text-green-400" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-zinc-50">Peso</p>
          {resumo
            ? <p className="text-sm text-zinc-400 tabular-nums">{resumo.atual.toLocaleString('pt-BR')} kg{resumo.variacao !== 0 && pesos.length > 1 ? ` · ${resumo.variacao > 0 ? '+' : ''}${resumo.variacao.toLocaleString('pt-BR')} kg em 30 dias` : ''}</p>
            : <p className="text-sm text-green-400">Registre seu peso →</p>}
        </div>
        {pesos.length > 1 ? <GraficoPeso pontos={pesos} mini /> : <ChevronRight className="w-5 h-5 text-zinc-600" />}
      </Link>

      {/* Treino e dieta */}
      <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '180ms' }}>
        <Link to={lastTreino ? `/treino/${lastTreino.id}` : '/treino'} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition active:scale-[0.98]">
          <span className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center"><Dumbbell className="w-5 h-5 text-green-400" /></span>
          <p className="text-sm font-semibold text-zinc-100 mt-3 truncate">{lastTreino ? lastTreino.nome : 'Criar treino'}</p>
          <p className="text-xs text-zinc-500 mt-0.5 flex items-center">{lastTreino ? 'Seu treino' : 'Gerado por IA'}<ChevronRight className="w-3.5 h-3.5" /></p>
        </Link>
        <Link to={lastDieta ? `/dieta/${lastDieta.id}` : '/dieta'} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition active:scale-[0.98]">
          <span className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center"><Salad className="w-5 h-5 text-green-400" /></span>
          <p className="text-sm font-semibold text-zinc-100 mt-3 truncate">{lastDieta ? lastDieta.nome : 'Criar dieta'}</p>
          <p className="text-xs text-zinc-500 mt-0.5 flex items-center">{lastDieta ? 'Seu plano alimentar' : 'Gerada por IA'}<ChevronRight className="w-3.5 h-3.5" /></p>
        </Link>
      </div>
    </div>
  )
}
