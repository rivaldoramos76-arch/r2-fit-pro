import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTreino } from '../lib/treinoApi'
import { descreverGrupos, equipamentosCobertos, type ExercicioPlano, type PlanoTreino } from '../lib/treinoModel'
import { concluirExercicio, desmarcarExercicio, emAndamento, exercicioConcluido, novaSessao, seriesFeitas, sessaoAtual, type Sessao } from '../lib/sessoes'
import ExercicioPicker from '../components/treino/ExercicioPicker'
import AjustesExercicio from '../components/treino/AjustesExercicio'
import { Spinner } from '../components/UI'
import CompartilharCartao from '../components/CompartilharCartao'
import { cartaoTreino } from '../lib/cartoesBase'
import { useContadorTreino } from '../components/treino/ContadorTreino'
import { ExecucaoAmpliada, MiniExecucao, animacaoDe } from '../components/treino/ExecucaoAnimada'

/** Chave deslizante "Concluído". */
function ChaveConcluido({ ligado, ocupado, onTrocar }: { ligado: boolean; ocupado: boolean; onTrocar: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label="Concluído" onClick={onTrocar} disabled={ocupado}
      className="flex flex-col items-center gap-0.5 px-1 shrink-0 disabled:opacity-60">
      <span className={`relative w-9 h-5 rounded-full transition-colors ${ligado ? 'bg-green-500' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-4' : ''}`} />
      </span>
      <span className={`text-[9px] leading-none ${ligado ? 'text-green-400 font-semibold' : 'text-zinc-500'}`}>Concluído</span>
    </button>
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
  const [aviso, setAviso] = useState('')
  const [execucao, setExecucao] = useState<string | null>(null)
  const [marcando, setMarcando] = useState<string | null>(null)
  const aoRegistrar = useCallback((s: Sessao) => setSessao(s), [])
  const contador = useContadorTreino({
    user, treino: treino ? { id: treino.id, nome: treino.nome } : null, diaIdx,
    dia: treino?.plano.dias[diaIdx] ?? null, onSessao: aoRegistrar,
  })

  useEffect(() => {
    if (!id) return
    // Treino incompleto parado há horas já foi contado: a tela começa uma sessão nova
    sessaoAtual(id, diaIdx).then(s => setSessao(s && !s.concluido && !emAndamento(s) && Object.keys(s.series_realizadas ?? {}).length > 0 ? null : s))
  }, [id, diaIdx])

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  const treinoDia = treino?.plano.dias[diaIdx]
  if (!treino || !treinoDia) return <div className="text-center py-16 text-zinc-500">Treino não encontrado.</div>

  const exercicios = treinoDia.exercicios
  // Concluído = todas as séries feitas; com menos, o exercício mostra quantas foram (já estão no diário)
  const feitos = new Set(exercicios.filter(e => exercicioConcluido(sessao, e)).map(e => e.id))
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

  // Chave "Concluído": liga sozinha quando todas as séries são feitas; à mão, marca todas as séries (vai para o diário) ou desfaz
  const alternarConcluido = async (ex: ExercicioPlano) => {
    if (!user || marcando) return
    setMarcando(ex.id)
    try {
      if (feitos.has(ex.id)) { if (sessao) setSessao(await desmarcarExercicio(sessao, ex.id)) }
      else setSessao(await concluirExercicio({
        userId: user.id, treinoId: treino.id, treinoNome: treino.nome, dia: diaIdx, exercicioId: ex.id, series: ex.series,
        exerciciosDoTreino: exercicios.map(e => ({ id: e.id, series: e.series })),
      }))
    } catch { setAviso('Não foi possível salvar. Verifique sua conexão.') }
    setMarcando(null)
  }

  const remover = (ex: ExercicioPlano) => {
    if (confirm(`Remover "${ex.nome}" deste treino?`)) atualizarExercicios(l => l.filter(e => e.id !== ex.id))
  }

  // Treino completo: faz em sequência os exercícios que faltam (ou todos, se não falta nenhum)
  const pendentes = exercicios.filter(e => !feitos.has(e.id))
  const sequencia = pendentes.length > 0 && !sessaoFinalizada ? pendentes : exercicios

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
          {exercicios.length > 1 && (
            <>
              <button onClick={() => contador.iniciar(sequencia)} disabled={contador.preparando}
                className="w-full mt-3 py-3 rounded-xl bg-green-500 text-zinc-950 font-bold hover:bg-green-400 active:scale-[0.98] transition disabled:opacity-60">
                {contador.preparando ? 'Preparando áudio...' : `▶ Treino completo · ${sequencia.length} exercícios`}
              </button>
              <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                Faz {sequencia.length < exercicios.length ? 'os que faltam' : 'todos'} em sequência: ao terminar um, a voz anuncia o próximo, conta o descanso e já começa o seguinte.
              </p>
            </>
          )}
          {(sessaoFinalizada || concluidos > 0) && (
            <button onClick={recomecar} className="mt-3 text-xs font-semibold text-green-400 hover:text-green-300">
              ↻ Começar nova sessão deste treino
            </button>
          )}
        </div>
      )}

      {exercicios.length > 0 && contador.opcoesSom}

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
            const parcial = ok ? 0 : seriesFeitas(sessao, ex.id)
            return (
              <div key={ex.id} className={`rounded-2xl border p-2.5 ${ok ? 'bg-green-500/5 border-green-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0 ${ok ? 'bg-green-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>
                    {ok ? '✓' : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 leading-tight truncate">{ex.nome}</p>
                    {parcial > 0 && <p className="text-[10px] font-semibold text-amber-400 truncate leading-tight">{parcial} de {ex.series} séries feitas · treino incompleto</p>}
                  </div>
                  {!contador.rodando && (animacaoDe(ex.nome)
                    ? execucao !== ex.id && <MiniExecucao nome={ex.nome} onAbrir={() => setExecucao(ex.id)} />
                    : (ex.instrucoes || ex.dica) && (
                      <button onClick={() => setExecucao(x => (x === ex.id ? null : ex.id))} aria-label={`Como fazer ${ex.nome}`}
                        className="w-8 h-8 shrink-0 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 text-sm">ⓘ</button>
                    ))}
                </div>
                {execucao === ex.id && !contador.rodando && (
                  <div className="mt-2">
                    <ExecucaoAmpliada nome={ex.nome} onFechar={() => setExecucao(null)} />
                    {ex.instrucoes && <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{ex.instrucoes}</p>}
                    {ex.dica && <p className="text-xs text-yellow-500/80 mt-1">💡 {ex.dica}</p>}
                  </div>
                )}
                <AjustesExercicio ex={ex} onSalvar={e => atualizarExercicios(l => l.map(x => (x.id === e.id ? e : x)))} />
                <div className="flex items-center gap-1.5 mt-2">
                  <button onClick={() => contador.iniciar([ex])} disabled={contador.preparando}
                    className={`flex-1 h-8 rounded-lg text-sm font-bold transition active:scale-[0.98] disabled:opacity-60 ${ok ? 'bg-zinc-800 text-zinc-200 border border-zinc-700' : 'bg-green-500 text-zinc-950 hover:bg-green-400'}`}>
                    ▶ {ok ? 'Refazer' : 'Iniciar'}
                  </button>
                  <ChaveConcluido ligado={ok} ocupado={marcando === ex.id} onTrocar={() => alternarConcluido(ex)} />
                  <button onClick={() => mover(i, -1)} disabled={i === 0} className="w-8 h-8 rounded-lg text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-30" aria-label="Mover para cima">↑</button>
                  <button onClick={() => mover(i, 1)} disabled={i === exercicios.length - 1} className="w-8 h-8 rounded-lg text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-30" aria-label="Mover para baixo">↓</button>
                  <button onClick={() => remover(ex)} className="w-8 h-8 rounded-lg text-sm bg-zinc-900 text-red-400/80 border border-zinc-800" aria-label="Remover">🗑</button>
                </div>
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
      {contador.overlay}
    </div>
  )
}
