import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Dieta, Treino } from '../types'
import { Card, Badge, Spinner } from '../components/UI'

export default function DashboardPage() {
  const { user } = useAuth()
  const [lastDieta, setLastDieta] = useState<Dieta | null>(null)
  const [lastTreino, setLastTreino] = useState<Treino | null>(null)
  const [loading, setLoading] = useState(true)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const nomeUsuario = user?.user_metadata?.nome ?? user?.email?.split('@')[0] ?? 'Atleta'

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [{ data: dietas }, { data: treinos }] = await Promise.all([
        supabase.from('dietas').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('treinos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
      ])
      setLastDieta(dietas?.[0] ?? null)
      setLastTreino(treinos?.[0] ?? null)
      setLoading(false)
    }
    load()
  }, [user])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div>
        <p className="text-zinc-500 text-sm">{greeting()},</p>
        <h1 className="text-2xl font-bold text-zinc-100 mt-0.5 capitalize">{nomeUsuario} 👋</h1>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/dieta" className="block">
          <div className="bg-gradient-to-br from-green-500/20 to-green-600/5 border border-green-500/20 rounded-2xl p-4 hover:border-green-500/40 transition-all active:scale-[0.98]">
            <div className="w-9 h-9 bg-green-500/20 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-100">Nova Dieta</p>
            <p className="text-xs text-zinc-500 mt-0.5">Gerada por IA</p>
          </div>
        </Link>

        <Link to="/treino" className="block">
          <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/5 border border-blue-500/20 rounded-2xl p-4 hover:border-blue-500/40 transition-all active:scale-[0.98]">
            <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-100">Novo Treino</p>
            <p className="text-xs text-zinc-500 mt-0.5">Gerado por IA</p>
          </div>
        </Link>
      </div>

      {/* Last diet */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Última Dieta</h2>
          <Link to="/dieta" className="text-xs text-green-400 hover:text-green-300">Ver todas →</Link>
        </div>
        {lastDieta ? (
          <Link to={`/dieta/${lastDieta.id}`}>
            <Card className="hover:border-zinc-700 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-100 truncate">{lastDieta.nome}</p>
                  <p className="text-xs text-zinc-500 mt-1">{new Date(lastDieta.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-green-400">{lastDieta.calorias_dia}</p>
                  <p className="text-xs text-zinc-500">kcal/dia</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="green">{lastDieta.objetivo}</Badge>
                <Badge variant="zinc">{lastDieta.plano?.refeicoes?.length ?? 0} refeições</Badge>
              </div>
            </Card>
          </Link>
        ) : (
          <Card>
            <p className="text-zinc-500 text-sm text-center py-4">
              Nenhuma dieta criada ainda.{' '}
              <Link to="/dieta" className="text-green-400 hover:underline">Criar agora →</Link>
            </p>
          </Card>
        )}
      </div>

      {/* Last workout */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Último Treino</h2>
          <Link to="/treino" className="text-xs text-green-400 hover:text-green-300">Ver todos →</Link>
        </div>
        {lastTreino ? (
          <Link to={`/treino/${lastTreino.id}`}>
            <Card className="hover:border-zinc-700 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-100 truncate">{lastTreino.nome}</p>
                  <p className="text-xs text-zinc-500 mt-1">{new Date(lastTreino.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-blue-400">{lastTreino.frequencia_semanal}x</p>
                  <p className="text-xs text-zinc-500">por semana</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="blue">{lastTreino.objetivo}</Badge>
                <Badge variant="zinc">{lastTreino.nivel}</Badge>
                <Badge variant="zinc">{lastTreino.plano?.dias?.length ?? 0} dias</Badge>
              </div>
            </Card>
          </Link>
        ) : (
          <Card>
            <p className="text-zinc-500 text-sm text-center py-4">
              Nenhum treino criado ainda.{' '}
              <Link to="/treino" className="text-green-400 hover:underline">Criar agora →</Link>
            </p>
          </Card>
        )}
      </div>

      {/* Tips */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">💡</span>
          <p className="text-sm font-semibold text-zinc-300">Dica do dia</p>
        </div>
        <p className="text-sm text-zinc-500 leading-relaxed">
          A consistência é mais importante que a perfeição. Treinar 3 vezes por semana todo mês
          é melhor do que treinar todos os dias por uma semana.
        </p>
      </div>
    </div>
  )
}
