import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTreino } from '../lib/treinoApi'
import { concluirExercicio } from '../lib/sessoes'
import { TreinoPlayer, carregarClipes, estadoEm, type ClipKey, type FaseTipo, type ModoSom } from '../lib/workoutAudio'
import { Spinner } from '../components/UI'
import { carregarPreferencias, salvarPreferencias } from '../lib/preferencias'
import type { PrefsAudio } from '../lib/preferencias'
import { detectarSistema } from '../lib/instalacao'

type Tela = 'pronto' | 'rodando' | 'concluido' | 'interrompido'
interface CfgContador { series: number; exec: number; desc: number }

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Circulo({ restante, total, tipo }: { restante: number; total: number; tipo: FaseTipo }) {
  const r = 54, circ = 2 * Math.PI * r
  const trabalho = tipo === 'work'
  const off = total > 0 ? circ * (1 - restante / total) : 0
  return (
    <div className="relative w-56 h-56 max-w-[70vw] max-h-[70vw] flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#27272a" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={trabalho ? '#22c55e' : '#3b82f6'} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 0.15s linear' }} />
      </svg>
      <div className="text-center">
        <p className="text-5xl font-bold text-zinc-100 tabular-nums">{mmss(Math.ceil(restante))}</p>
        <p className={`text-sm font-semibold mt-1 ${trabalho ? 'text-green-400' : 'text-blue-400'}`}>{trabalho ? 'TRABALHO' : 'REPOUSO'}</p>
      </div>
    </div>
  )
}

export default function WorkoutTimerPage() {
  const { treinoId, diaIndex, exId } = useParams<{ treinoId: string; diaIndex: string; exId?: string }>()
  const diaIdx = Number(diaIndex ?? 0)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { treino, loading } = useTreino(treinoId)
  const estadoNav = location.state as { config?: CfgContador; exercicioIndex?: number } | null

  const [tela, setTela] = useState<Tela>('pronto')
  const [vozes, setVozes] = useState<'carregando' | 'ok' | 'fallback'>('carregando')
  const [clips, setClips] = useState<Record<ClipKey, Float32Array> | null>(null)
  const [t, setT] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [mudo, setMudo] = useState(false)
  const [volume, setVolume] = useState(1)
  const [registro, setRegistro] = useState<'salvando' | 'ok' | 'erro' | null>(null)
  const [treinoCompleto, setTreinoCompleto] = useState(false)
  const [erroAudio, setErroAudio] = useState('')
  const playerRef = useRef<TreinoPlayer | null>(null)
  const [precisaToque, setPrecisaToque] = useState(false)
  const recuperando = useRef(false)

  const [modoSom, setModoSom] = useState<ModoSom>('musica')
  const prefsAudio = useRef<PrefsAudio | null>(null)
  const sistema = detectarSistema()

  // Volume, modo silencioso e modo de som padrão definidos em Configurações
  useEffect(() => {
    if (!user) return
    carregarPreferencias(user.id).then(p => { prefsAudio.current = p.audio; setVolume(p.audio.volume); setMudo(p.audio.mudo); setModoSom(p.audio.modo) }).catch(() => {})
  }, [user])
  const escolherModo = (m: ModoSom) => {
    setModoSom(m)
    if (user) salvarPreferencias(user.id, { audio: { ...(prefsAudio.current ?? { volume, mudo }), modo: m } }).catch(() => {})
  }
  const wakeRef = useRef<WakeLockSentinel | null>(null)

  const dia = treino?.plano.dias[diaIdx]
  const ex = dia?.exercicios.find(e => e.id === exId) ?? (exId ? undefined : dia?.exercicios[estadoNav?.exercicioIndex ?? 0])
  const cfg: CfgContador | null = ex
    ? estadoNav?.config ?? { series: ex.series, exec: ex.tempo_execucao_segundos, desc: ex.tempo_descanso_segundos }
    : null

  useEffect(() => {
    carregarClipes().then(c => { setClips(c); setVozes(c ? 'ok' : 'fallback') })
  }, [])

  const liberarWakeLock = () => { wakeRef.current?.release().catch(() => {}); wakeRef.current = null }
  const pedirWakeLock = async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }).wakeLock
      if (wl && !wakeRef.current) wakeRef.current = await wl.request('screen')
    } catch { /* não suportado ou negado */ }
  }

  // encerra tudo ao sair da página
  useEffect(() => () => {
    playerRef.current?.parar()
    liberarWakeLock()
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  }, [])

  const registrar = useCallback(async () => {
    if (!user || !treino || !dia || !ex || !cfg) return
    setRegistro('salvando')
    try {
      const s = await concluirExercicio({
        userId: user.id, treinoId: treino.id, treinoNome: treino.nome, dia: diaIdx,
        exercicioId: ex.id, series: cfg.series, exerciciosDoTreino: dia.exercicios.map(e => e.id),
      })
      setTreinoCompleto(s.concluido)
      setRegistro('ok')
    } catch { setRegistro('erro') }
  }, [user, treino, dia, ex, cfg, diaIdx])

  // atualização da tela (o tempo vem da faixa de áudio, então não acumula atraso)
  useEffect(() => {
    if (tela !== 'rodando') return
    const tick = () => {
      const p = playerRef.current
      if (!p) return
      // O sistema pausou o áudio (tela bloqueada, ligação): ao voltar, segue do ponto certo
      if (p.interrompido && document.visibilityState === 'visible' && !recuperando.current) {
        recuperando.current = true
        // Se o navegador não deixar retomar sozinho em 2 s, pede um toque
        const limite = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tempo')), 2000))
        Promise.race([p.recuperar(), limite]).then(() => setPrecisaToque(false)).catch(() => setPrecisaToque(true)).finally(() => { recuperando.current = false })
      }
      setT(p.tempo())
      setPausado(p.pausado)
      p.verificar()
    }
    const id = setInterval(tick, 100)
    const vis = () => {
      if (document.visibilityState === 'visible') { tick(); if (!playerRef.current?.pausado) pedirWakeLock() }
    }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [tela])

  // informações na tela de bloqueio / central de controle
  const estado = playerRef.current && tela === 'rodando' ? estadoEm(playerRef.current.crono, t) : null
  const serieAtual = estado?.fase.serie ?? 1
  useEffect(() => {
    if (tela !== 'rodando' || !ex || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ex.nome, artist: `R2 Fit Pro · ${dia?.dia ?? ''}`, album: `Série ${serieAtual} de ${cfg?.series ?? 1}`,
    })
  }, [tela, ex, dia, serieAtual, cfg?.series])

  const iniciar = () => {
    if (!cfg || !ex) return
    setErroAudio('')
    playerRef.current?.parar()
    const p = new TreinoPlayer({ series: cfg.series, execSeg: cfg.exec, descansoSeg: cfg.desc }, clips, {
      onSeriesConcluidas: () => { registrar() },
      onFim: () => { setTela('concluido'); liberarWakeLock() },
    }, modoSom)
    p.setVolume(volume)
    p.setMudo(mudo)
    playerRef.current = p
    setRegistro(null)
    setT(0)
    setPausado(false)
    // play() precisa acontecer dentro do toque do usuário (exigência do iOS/Android)
    p.iniciar().then(() => {
      setTela('rodando')
      pedirWakeLock()
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => { p.retomar().catch(() => setPrecisaToque(true)); setPausado(false) })
        navigator.mediaSession.setActionHandler('pause', () => { p.pausar(); setPausado(true) })
      }
    }).catch(() => {
      setErroAudio('O navegador bloqueou o áudio. Toque em Iniciar novamente.')
      p.parar()
      playerRef.current = null
    })
  }

  const alternarPausa = () => {
    const p = playerRef.current
    if (!p) return
    if (p.pausado) { p.retomar().catch(() => setPrecisaToque(true)); pedirWakeLock() } else { p.pausar(); liberarWakeLock() }
    setPausado(!pausado)
  }

  const encerrar = () => {
    if (tela === 'rodando' && !confirm('Encerrar agora? O exercício não será marcado como concluído.')) return
    playerRef.current?.parar()
    playerRef.current = null
    liberarWakeLock()
    setTela(tela === 'rodando' ? 'interrompido' : tela)
  }

  const voltar = () => {
    if (tela === 'rodando' && !confirm('Sair do contador? O exercício não será marcado como concluído.')) return
    playerRef.current?.parar()
    navigate(`/treino/${treinoId}/dia/${diaIdx}`)
  }

  if (loading) return <div className="min-h-dvh bg-zinc-950 flex items-center justify-center"><Spinner size="lg" /></div>
  if (!ex || !cfg || !dia) return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col items-center justify-center gap-3 text-center p-6">
      <p className="text-lg font-semibold text-zinc-300">Exercício não encontrado</p>
      <button onClick={() => navigate(`/treino/${treinoId ?? ''}`)} className="text-green-400 underline text-sm">Voltar ao plano</button>
    </div>
  )

  if (tela === 'concluido' || tela === 'interrompido') {
    const ok = tela === 'concluido'
    return (
      <div className="min-h-dvh bg-zinc-950 flex flex-col items-center justify-center p-6 text-center gap-6" translate="no">
        <div className="text-6xl">{ok ? (treinoCompleto ? '🏆' : '🎉') : '⏹'}</div>
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${ok ? 'text-green-400' : 'text-zinc-200'}`}>{ok ? 'Exercício concluído!' : 'Exercício interrompido'}</h1>
          <p className="text-zinc-300 font-semibold">{ex.nome}</p>
          <p className="text-zinc-500 text-sm mt-1">
            {ok ? `${cfg.series} ${cfg.series === 1 ? 'série finalizada' : 'séries finalizadas'}` : 'Não foi marcado como concluído.'}
          </p>
          {ok && registro === 'salvando' && <p className="text-xs text-zinc-500 mt-3">Registrando conclusão...</p>}
          {ok && registro === 'ok' && <p className="text-xs text-green-400 mt-3">✓ Conclusão registrada{treinoCompleto ? ` · ${dia.dia} completo!` : ''}</p>}
          {ok && registro === 'erro' && <p className="text-xs text-red-400 mt-3">Não foi possível registrar a conclusão.</p>}
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {ok && registro === 'erro' && (
            <button onClick={registrar} className="w-full bg-zinc-800 text-zinc-100 font-semibold py-3 rounded-xl">Tentar registrar de novo</button>
          )}
          <button onClick={() => navigate(`/treino/${treinoId}/dia/${diaIdx}`)}
            className="w-full bg-green-500 hover:bg-green-400 text-zinc-950 font-bold py-3.5 rounded-xl active:scale-95 transition">
            Voltar ao {dia.dia}
          </button>
          <button onClick={() => { setTela('pronto'); setT(0) }}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold py-3 rounded-xl active:scale-95 transition">
            {ok ? 'Repetir exercício' : 'Recomeçar'}
          </button>
        </div>
      </div>
    )
  }

  const fase = estado?.fase
  const isContagem = fase?.tipo === 'countdown' || fase?.tipo === 'rest_countdown'
  const seriesFeitas = !estado ? 0 : estado.fase.tipo === 'final' ? cfg.series
    : estado.fase.tipo === 'rest_countdown' || estado.fase.tipo === 'rest' ? serieAtual : serieAtual - 1

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col" translate="no">
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/60 px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={voltar} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">{ex.nome}</p>
            <p className="text-xs text-zinc-500 truncate">{dia.dia}{dia.foco ? ` · ${dia.foco}` : ''}</p>
          </div>
          <button onClick={() => { const m = !mudo; setMudo(m); playerRef.current?.setMudo(m) }}
            className={`p-2 rounded-lg text-lg ${mudo ? 'text-zinc-600 bg-zinc-900' : 'text-zinc-300 bg-zinc-800'}`}
            aria-label={mudo ? 'Ativar som' : 'Silenciar'}>{mudo ? '🔇' : '🔊'}</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6 gap-6 items-center">
        <div className="flex gap-2 flex-wrap justify-center">
          {Array.from({ length: cfg.series }).map((_, i) => (
            <div key={i} className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border transition ${
              i < seriesFeitas ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : i + 1 === serieAtual && tela === 'rodando' ? 'bg-zinc-700 text-zinc-100 border-zinc-500'
                  : 'bg-zinc-900 text-zinc-600 border-zinc-800'}`}>{i < seriesFeitas ? '✓' : i + 1}</div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 min-h-60 justify-center">
          {tela === 'pronto' && (
            <div className="text-center">
              <p className="text-6xl mb-3">💪</p>
              <p className="text-zinc-300 font-semibold">{cfg.series} séries · {mmss(cfg.exec)} de execução · {mmss(cfg.desc)} de descanso</p>
              {vozes === 'fallback' ? (
                <p className="text-xs text-zinc-500 mt-2 max-w-xs mx-auto">Vozes gravadas indisponíveis: usando a voz do navegador. Neste modo, mantenha a tela ligada.</p>
              ) : (
                <div className="mt-4 w-full max-w-sm mx-auto text-left">
                  <p className="text-xs font-semibold text-zinc-400 mb-1.5">Som do contador</p>
                  <div className="grid grid-cols-2 gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1" role="radiogroup" aria-label="Som do contador">
                    {([['musica', '🎵 Por cima da música'], ['bloqueio', '🔒 Tela bloqueada']] as const).map(([m, r]) => (
                      <button key={m} type="button" role="radio" aria-checked={modoSom === m} onClick={() => escolherModo(m)}
                        className={`py-2 rounded-lg text-xs font-semibold transition ${modoSom === m ? 'bg-green-500 text-zinc-950' : 'text-zinc-400'}`}>{r}</button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                    {modoSom === 'musica'
                      ? sistema === 'iphone'
                        ? 'A voz toca junto com a sua música. No iPhone, a tela fica ligada durante o exercício e o modo silencioso precisa estar desligado. Se bloquear, ao voltar o treino continua do ponto certo.'
                        : 'A voz toca junto com a sua música, sem pausar. Pode trocar de app ou bloquear a tela.'
                      : 'Segue tocando com a tela bloqueada, mas o celular pausa a sua música durante o exercício.'}
                  </p>
                </div>
              )}
            </div>
          )}
          {tela === 'rodando' && isContagem && estado && (
            <div className="w-56 h-56 flex flex-col items-center justify-center">
              {estado.numero > 0
                ? <p key={estado.numero} className="text-8xl font-black text-purple-400 tabular-nums animate-pulse">{estado.numero}</p>
                : <p className="text-4xl font-black text-zinc-100">{fase?.tipo === 'countdown' ? 'TRABALHO!' : 'REPOUSO!'}</p>}
              <p className="text-sm text-zinc-500 mt-3">{fase?.tipo === 'countdown' ? `prepare-se · série ${serieAtual}` : 'fim da série · prepare o descanso'}</p>
            </div>
          )}
          {tela === 'rodando' && (fase?.tipo === 'work' || fase?.tipo === 'rest') && estado && (
            <>
              <Circulo restante={estado.restante} total={fase.fim - fase.inicio} tipo={fase.tipo} />
              <p className="text-zinc-400 text-sm">Série {serieAtual} de {cfg.series}</p>
            </>
          )}
          {tela === 'rodando' && fase?.tipo === 'final' && (
            <div className="text-center"><p className="text-6xl">🎉</p><p className="text-green-400 font-semibold mt-3">Todas as séries finalizadas!</p></div>
          )}
          {precisaToque && tela === 'rodando' && (
            <button onClick={() => playerRef.current?.recuperar().then(() => setPrecisaToque(false)).catch(() => {})}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-green-500 text-zinc-950 animate-pulse">Toque para continuar o áudio</button>
          )}
          {pausado && tela === 'rodando' && <span className="text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-400">Pausado</span>}
        </div>

        <div className="w-full flex flex-col gap-3">
          {tela === 'pronto' && (
            <button onClick={iniciar} disabled={vozes === 'carregando'}
              className="w-full bg-green-500 hover:bg-green-400 text-zinc-950 font-bold text-lg py-4 rounded-2xl transition active:scale-[0.98] shadow-lg shadow-green-500/20 disabled:opacity-60 flex items-center justify-center gap-2">
              {vozes === 'carregando' ? <><Spinner size="sm" /> Preparando áudio...</> : '▶ Iniciar treino'}
            </button>
          )}
          {erroAudio && <p className="text-center text-sm text-red-400">{erroAudio}</p>}
          {tela === 'rodando' && fase?.tipo !== 'final' && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={alternarPausa}
                className={`font-semibold py-4 rounded-2xl transition active:scale-[0.98] ${pausado ? 'bg-green-500 text-zinc-950' : 'bg-zinc-800 text-zinc-100 border border-zinc-700'}`}>
                {pausado ? '▶ Retomar' : '⏸ Pausar'}
              </button>
              <button onClick={encerrar}
                className="bg-zinc-900 text-zinc-400 font-semibold py-4 rounded-2xl border border-zinc-800 active:scale-[0.98]">
                ✕ Encerrar
              </button>
            </div>
          )}
        </div>

        <div className="w-full flex items-center gap-3 px-1">
          <span className="text-xs text-zinc-500 shrink-0">🔊</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume"
            onChange={e => { const v = +e.target.value; setVolume(v); playerRef.current?.setVolume(v) }}
            className="flex-1 h-1 accent-green-500 cursor-pointer" />
          <span className="text-xs text-zinc-500 w-9 text-right">{Math.round(volume * 100)}%</span>
        </div>

        <div className="w-full grid grid-cols-3 gap-2 text-center">
          {[['Séries', String(cfg.series)], ['Execução', mmss(cfg.exec)], ['Descanso', mmss(cfg.desc)]].map(([r, v]) => (
            <div key={r} className="bg-zinc-900 border border-zinc-800/60 rounded-xl p-3">
              <p className="text-xs text-zinc-500">{r}</p>
              <p className="font-bold text-zinc-100 text-sm mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        {(ex.instrucoes || ex.dica || ex.carga) && (
          <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm">
            {ex.carga && <p className="text-zinc-300 mb-1.5">Carga: <b>{ex.carga}</b> · {ex.repeticoes} reps</p>}
            {ex.instrucoes && <p className="text-zinc-400 leading-relaxed">{ex.instrucoes}</p>}
            {ex.dica && <p className="text-xs text-yellow-500/80 mt-2">💡 {ex.dica}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
