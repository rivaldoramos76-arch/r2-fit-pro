import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { normalizarTreino, type TreinoCarregado } from '../lib/treinoApi'
import type { Treino } from '../types'
import { Spinner } from '../components/UI'

function IconeIA() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}

function IconeManual() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 9.75h16.5m-16.5 4.5h9m-9 4.5h6m7.5-4.5v6m3-3h-6" />
    </svg>
  )
}

export default function WorkoutPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [treinos, setTreinos] = useState<TreinoCarregado[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('treinos').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        setTreinos(((data ?? []) as Treino[]).map(normalizarTreino))
        setLoading(false)
      })
  }, [user])

  const excluir = async (t: TreinoCarregado) => {
    if (!confirm(`Excluir o plano "${t.nome}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('treinos').delete().eq('id', t.id)
    if (error) { alert('Não foi possível excluir o plano.'); return }
    setTreinos(p => p.filter(x => x.id !== t.id))
  }

  return (
    <div className="flex flex-col gap-6" translate="no">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Meus Treinos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Crie, organize e execute seus planos de musculação</p>
      </div>

      {/* Opções de criação */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/treino/novo?modo=ia')}
          className="group text-left rounded-3xl p-5 min-h-[150px] flex flex-col justify-between gap-4 bg-gradient-to-br from-green-500/20 via-green-500/10 to-zinc-900 border border-green-500/30 hover:border-green-400/60 transition active:scale-[0.98]">
          <span className="w-12 h-12 rounded-2xl bg-green-500 text-zinc-950 flex items-center justify-center shadow-lg shadow-green-500/20">
            <IconeIA />
          </span>
          <span>
            <span className="block font-bold text-lg text-zinc-100 leading-tight">Criar com IA</span>
            <span className="block text-sm text-zinc-400 mt-1 leading-snug">Plano personalizado a partir dos seus objetivos</span>
          </span>
        </button>
        <button
          onClick={() => navigate('/treino/novo?modo=manual')}
          className="group text-left rounded-3xl p-5 min-h-[150px] flex flex-col justify-between gap-4 bg-zinc-900 border border-zinc-800 hover:border-green-500/40 transition active:scale-[0.98]">
          <span className="w-12 h-12 rounded-2xl bg-zinc-800 text-green-400 border border-zinc-700 flex items-center justify-center group-hover:bg-zinc-700 transition">
            <IconeManual />
          </span>
          <span>
            <span className="block font-bold text-lg text-zinc-100 leading-tight">Montar meu próprio treino</span>
            <span className="block text-sm text-zinc-400 mt-1 leading-snug">Defina a divisão e escolha cada exercício</span>
          </span>
        </button>
      </div>

      {/* Planos */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Meus planos</h2>
        {loading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : treinos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-5 py-8 text-center">
            <p className="text-3xl mb-2">🏋</p>
            <p className="font-semibold text-zinc-200">Você ainda não tem planos de treino</p>
            <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
              Escolha uma das opções acima: a IA monta tudo para você, ou você define a divisão e os exercícios.
            </p>
          </div>
        ) : (
          treinos.map(t => (
            <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <Link to={`/treino/${t.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100 truncate">{t.nome}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {t.plano.origem === 'manual' ? 'Montado por você' : 'Gerado por IA'} · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-green-400 leading-none">{t.plano.frequencia_semanal}x</p>
                    <p className="text-[11px] text-zinc-500 mt-1">por semana</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.plano.dias.map(d => (
                    <span key={d.id} className="text-[11px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/60 max-w-full truncate">
                      <b className="text-green-400">{d.letra}</b> {d.foco || 'Sem foco definido'}
                    </span>
                  ))}
                </div>
              </Link>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Link to={`/treino/${t.id}?iniciar=1`}
                  className="text-center text-sm font-semibold py-2.5 rounded-xl bg-green-500 text-zinc-950 hover:bg-green-400 transition">
                  ▶ Iniciar
                </Link>
                <Link to={`/treino/${t.id}/editar`}
                  className="text-center text-sm font-semibold py-2.5 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition">
                  Editar
                </Link>
                <button onClick={() => excluir(t)}
                  className="text-sm font-semibold py-2.5 rounded-xl bg-zinc-900 text-red-400/90 border border-zinc-800 hover:bg-red-500/10 hover:border-red-500/30 transition">
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
