import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTreino } from '../lib/treinoApi'
import { descreverGrupos, equipamentosCobertos, type ExercicioPlano, type PlanoTreino } from '../lib/treinoModel'
import { desmarcarExercicio, novaSessao, sessaoAtual, type Sessao } from '../lib/sessoes'
import ExercicioPicker, { ExercicioForm } from '../components/treino/ExercicioPicker'
import { Spinner } from '../components/UI'
import CompartilharCartao from '../components/CompartilharCartao'
import { cartaoTreino } from '../lib/cartoesBase'

function mmss(seg: number) {
  return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`
}

// --- Configuração do contador antes de iniciar ---

function ContadorModal({ ex, onIniciar, onFechar }: {
  ex: ExercicioPlano
  onIniciar: (cfg: { series: number; exec: number; desc: number }) => void
  onFechar: () => void
}) {
  const [series, setSeries] = useState(ex.series)
  const [execMin, setExecMin] = useState(Math.floor(ex.tempo_execucao_segundos / 60))
  const [execSec, setExecSec] = useState(ex.tempo_execucao_segundos % 60)
  const [descMin, setDescMin] = useState(Math.floor(ex.tempo_descanso_segundos / 60))
  const [descSec, setDescSec] = useState(ex.tempo_descanso_segundos % 60)
  const inp = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2.5 text-center text-zinc-100 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500'
  const lim = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v) || 0))
  const exec = Math.max(5, execMin * 60 + execSec)
  const desc = descMin * 60 + descSec

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onFechar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 pb-8 flex flex-col gap-5"
        onClick={e => e.stopPropagation()} translate="no" role="dialog" aria-label="Configurar contador">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-zinc-100 text-lg">Contador de séries</h2>
            <p className="text-sm text-zinc-400 truncate">{ex.nome}</p>
          </div>
          <button onClick={onFechar} className="text-zinc-500 hover:text-zinc-300 p-1.5" aria-label="Fechar">✕</button>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Séries</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSeries(s => Math.max(1, s - 1))} className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-100 font-bold text-xl">−</button>
            <span className="text-4xl font-bold text-zinc-100 w-12 text-center tabular-nums">{series}</span>
            <button onClick={() => setSeries(s => Math.min(20, s + 1))} className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-100 font-bold text-xl">+</button>
          </div>
        </div>
        {([
          ['Tempo de execução', execMin, setExecMin, execSec, setExecSec, 'por série'],
          ['Intervalo de descanso', descMin, setDescMin, descSec, setDescSec, 'entre séries'],
        ] as const).map(([rot, m, setM, s, setS, suf]) => (
          <div key={rot}>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{rot}</p>
            <div className="flex items-center gap-2">
              <label className="flex-1"><span className="sr-only">Minutos</span>
                <input type="number" inputMode="numeric" min={0} max={59} value={m} onChange={e => setM(lim(+e.target.value, 59))} className={inp} /></label>
              <span className="text-zinc-500 text-xl font-bold">:</span>
              <label className="flex-1"><span className="sr-only">Segundos</span>
                <input type="number" inputMode="numeric" min={0} max={59} value={s} onChange={e => setS(lim(+e.target.value, 59))} className={inp} /></label>
            </div>
            <p className="text-xs text-zinc-600 mt-1">min : seg {suf}</p>
          </div>
        ))}
        <p className="text-xs text-zinc-500 -mt-1">
          Antes de cada fase há uma contagem regressiva de 5 s, falada, que não é descontada do tempo.
          O áudio continua com a tela bloqueada — mantenha o volume do aparelho ligado.
        </p>
        <button onClick={() => onIniciar({ series, exec, desc })}
          className="w-full py-4 rounded-2xl font-bold text-lg bg-green-500 text-zinc-950 hover:bg-green-400 active:scale-[0.98] transition">
          ▶ Iniciar treino · {series}× {mmss(exec)}
        </button>
      </div>
    </div>
  )
}

// --- Página ---

export default function TreinoDiaPage() {
  const { id, dia } = useParams<{ id: string; dia: string }>()
  const diaIdx = Number(dia ?? 0)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { treino, loading, salvar } = useTreino(id)
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [picker, setPicker] = useState(false)
  const [editando, setEditando] = useState<ExercicioPlano | null>(null)
  const [contador, setContador] = useState<ExercicioPlano | null>(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    if (!id) return
    sessaoAtual(id, diaIdx).then(setSessao)
  }, [id, diaIdx])

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  const treinoDia = treino?.plano.dias[diaIdx]
  if (!treino || !treinoDia) return <div className="text-center py-16 text-zinc-500">Treino não encontrado.</div>

  const exercicios = treinoDia.exercicios
  const feitos = new Set(Object.keys(sessao?.series_realizadas ?? {}))
  const concluidos = exercicios.filter(e => feitos.has(e.id)).length
  const sessaoFinalizada = !!sessao?.concluido && exercicios.length > 0
  const minutos = sessao?.data_inicio && sessao?.data_fim
    ? Math.round((new Date(sessao.data_fim).getTime() - new Date(sessao.data_inicio).getTime()) / 60000) : null
  const cartao = cartaoTreino({
    dia: treinoDia.dia, foco: treinoDia.foco || descreverGrupos(treinoDia.grupos), exercicios: exercicios.length,
    series: exercicios.reduce((s, e) => s + e.series, 0), minutos: minutos && minutos > 0 && minutos < 300 ? minutos : treinoDia.duracao_estimada_min,
  })

  const atualizarExercicios = async (fn: (lista: ExercicioPlano[]) => ExercicioPlano[]) => {
    const plano: PlanoTreino = {
      ...treino.plano,
      dias: treino.plano.dias.map((d, i) => (i === diaIdx ? { ...d, exercicios: fn(d.exercicios) } : d)),
    }
    try { await salvar(plano) } catch { setAviso('Não foi possível salvar. Verifique sua conexão.') }
  }

  const mover = (i: number, delta: number) => atualizarExercicios(l => {
    const j = i + delta
    if (j < 0 || j >= l.length) return l
    const c = [...l];[c[i], c[j]] = [c[j], c[i]]
    return c
  })

  const remover = (ex: ExercicioPlano) => {
    if (confirm(`Remover "${ex.nome}" deste treino?`)) atualizarExercicios(l => l.filter(e => e.id !== ex.id))
  }

  const iniciarContador = async (ex: ExercicioPlano, cfg: { series: number; exec: number; desc: number }) => {
    setContador(null)
    if (cfg.series !== ex.series || cfg.exec !== ex.tempo_execucao_segundos || cfg.desc !== ex.tempo_descanso_segundos) {
      await atualizarExercicios(l => l.map(e => (e.id === ex.id
        ? { ...e, series: cfg.series, tempo_execucao_segundos: cfg.exec, tempo_descanso_segundos: cfg.desc } : e)))
    }
    navigate(`/assistente/${treino.id}/${diaIdx}/${ex.id}`, { state: { config: cfg } })
  }

  const recomecar = async () => {
    if (!user) return
    setSessao(await novaSessao(user.id, treino.id, treino.nome, diaIdx))
  }

  return (
    <div className="flex flex-col gap-5" translate="no">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(`/treino/${treino.id}`)} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <span className="w-11 h-11 rounded-xl bg-green-500/15 text-green-400 text-xl font-black flex items-center justify-center shrink-0">{treinoDia.letra}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-100 leading-tight">{treinoDia.dia}</h1>
          <p className="text-sm text-zinc-500 truncate">{treinoDia.foco || descreverGrupos(treinoDia.grupos)}</p>
        </div>
      </div>

      {exercicios.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-zinc-400">{sessaoFinalizada ? 'Treino concluído 🎉' : 'Progresso desta sessão'}</span>
            <span className="font-semibold text-zinc-100 tabular-nums">{concluidos}/{exercicios.length}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${(concluidos / exercicios.length) * 100}%` }} />
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {treinoDia.duracao_estimada_min} min estimados · {exercicios.reduce((s, e) => s + e.series, 0)} séries
            {sessaoFinalizada && sessao?.data_fim && ` · finalizado em ${new Date(sessao.data_fim).toLocaleDateString('pt-BR')}`}
          </p>
          {sessaoFinalizada && cartao && <CompartilharCartao cartao={cartao} rotulo="Compartilhar treino" className="w-full mt-3" />}
          {(sessaoFinalizada || concluidos > 0) && (
            <button onClick={recomecar} className="mt-3 text-xs font-semibold text-green-400 hover:text-green-300">
              ↻ Começar nova sessão deste treino
            </button>
          )}
        </div>
      )}

      {aviso && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{aviso}</div>}

      {exercicios.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-5 py-10 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="font-semibold text-zinc-200">Este treino ainda não tem exercícios</p>
          <p className="text-sm text-zinc-500 mt-1">Busque no catálogo e defina séries, repetições, carga e descanso.</p>
          <button onClick={() => setPicker(true)} className="mt-5 px-5 py-3 rounded-xl bg-green-500 text-zinc-950 font-bold hover:bg-green-400">
            + Adicionar exercícios
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {exercicios.map((ex, i) => {
            const ok = feitos.has(ex.id)
            return (
              <div key={ex.id} className={`rounded-2xl border p-4 ${ok ? 'bg-green-500/5 border-green-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                <div className="flex items-start gap-3">
                  <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${ok ? 'bg-green-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>
                    {ok ? '✓' : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-100 leading-snug">{ex.nome}</p>
                    {ex.grupos_musculares.length > 0 && <p className="text-xs text-zinc-500 mt-0.5 truncate">{ex.grupos_musculares.join(' · ')}</p>}
                    {ok && <p className="text-xs font-semibold text-green-400 mt-1">✓ Concluído</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
                  {[
                    ['Séries', String(ex.series)], ['Reps', ex.repeticoes],
                    ['Execução', mmss(ex.tempo_execucao_segundos)], ['Descanso', mmss(ex.tempo_descanso_segundos)],
                  ].map(([r, v]) => (
                    <div key={r} className="bg-zinc-800/60 rounded-lg py-1.5 px-1">
                      <p className="text-[10px] text-zinc-500">{r}</p>
                      <p className="text-sm font-semibold text-zinc-200 truncate">{v}</p>
                    </div>
                  ))}
                </div>
                {ex.carga && <p className="text-xs text-zinc-400 mt-2">Carga: <span className="text-zinc-200">{ex.carga}</span></p>}
                {ex.instrucoes && <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{ex.instrucoes}</p>}
                {ex.dica && <p className="text-xs text-yellow-500/80 mt-1">💡 {ex.dica}</p>}
                <div className="flex items-center gap-1.5 mt-3">
                  <button onClick={() => setContador(ex)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition active:scale-[0.98] ${ok ? 'bg-zinc-800 text-zinc-200 border border-zinc-700' : 'bg-green-500 text-zinc-950 hover:bg-green-400'}`}>
                    ▶ {ok ? 'Refazer' : 'Iniciar'}
                  </button>
                  <button onClick={() => setEditando(ex)} className="px-3 py-2.5 rounded-xl text-sm bg-zinc-800 text-zinc-300 border border-zinc-700" aria-label="Editar">✎</button>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} className="px-2.5 py-2.5 rounded-xl text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-30" aria-label="Mover para cima">↑</button>
                  <button onClick={() => mover(i, 1)} disabled={i === exercicios.length - 1} className="px-2.5 py-2.5 rounded-xl text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-30" aria-label="Mover para baixo">↓</button>
                  <button onClick={() => remover(ex)} className="px-2.5 py-2.5 rounded-xl text-sm bg-zinc-900 text-red-400/80 border border-zinc-800" aria-label="Remover">🗑</button>
                </div>
                {ok && sessao && (
                  <button onClick={async () => setSessao(await desmarcarExercicio(sessao, ex.id))}
                    className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-300">Desmarcar conclusão</button>
                )}
              </div>
            )
          })}
          <button onClick={() => setPicker(true)}
            className="py-3.5 rounded-2xl border border-dashed border-green-500/40 text-green-400 font-semibold hover:bg-green-500/5">
            + Adicionar exercício
          </button>
        </div>
      )}

      {picker && (
        <ExercicioPicker
          gruposDoTreino={treinoDia.grupos}
          equipamentos={equipamentosCobertos(treino.plano.config.equipamentos)}
          onAdicionar={e => atualizarExercicios(l => [...l, e])}
          onFechar={() => setPicker(false)} />
      )}
      {editando && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setEditando(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 pb-8 max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()} translate="no">
            <ExercicioForm inicial={editando} titulo={editando.nome} subtitulo="Editar exercício" rotuloSalvar="Salvar"
              onCancelar={() => setEditando(null)}
              onSalvar={e => { setEditando(null); atualizarExercicios(l => l.map(x => (x.id === e.id ? e : x))) }} />
          </div>
        </div>
      )}
      {contador && <ContadorModal ex={contador} onFechar={() => setContador(null)} onIniciar={cfg => iniciarContador(contador, cfg)} />}
    </div>
  )
}
