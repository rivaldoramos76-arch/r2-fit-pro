import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Pause, Play, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTreino } from '../lib/treinoApi'
import { concluirExercicio } from '../lib/sessoes'
import { TreinoPlayer, carregarClipes, estadoEm, type ClipKey, type ModoSom } from '../lib/workoutAudio'
import { Spinner } from '../components/UI'
import { carregarPreferencias, salvarPreferencias } from '../lib/preferencias'
import type { PrefsAudio } from '../lib/preferencias'
import { detectarSistema } from '../lib/instalacao'

type Tela = 'pronto' | 'rodando' | 'concluido' | 'interrompido'
interface CfgContador { series: number; exec: number; desc: number }

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Limite do iPhone para sites: som misturado à música só com a tela desbloqueada. */
function AvisoIphone() {
  return (
    <div role="note" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 leading-relaxed">
      <p className="font-semibold text-amber-300">Só para iPhone</p>
      <ul className="mt-1 list-disc pl-4 flex flex-col gap-0.5">
        <li>Funciona com a <b>tela desbloqueada</b>: ela fica ligada sozinha durante o exercício.</li>
        <li>Desligue o <b>modo silencioso</b> (chave na lateral do iPhone), senão a voz fica muda.</li>
        <li>Se bloquear a tela, a voz para; ao desbloquear, o treino continua do ponto certo.</li>
      </ul>
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
    const audio = { ...(prefsAudio.current ?? { volume, mudo, abaixar_musica: true }), modo: m }
    prefsAudio.current = audio
    if (user) salvarPreferencias(user.id, { audio }).catch(() => {})
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
  // Tela inteira durante a contagem (onde o navegador permitir; no app instalado já não há barras)
  const entrarTelaCheia = () => { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {}) }
  const sairTelaCheia = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) }
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
    sairTelaCheia()
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
      onFim: () => { setTela('concluido'); liberarWakeLock(); sairTelaCheia() },
    }, modoSom, { abaixarMusica: sistema === 'android' && prefsAudio.current?.abaixar_musica !== false })
    p.setVolume(volume)
    p.setMudo(mudo)
    playerRef.current = p
    setRegistro(null)
    setT(0)
    setPausado(false)
    entrarTelaCheia()
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
      sairTelaCheia()
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
    sairTelaCheia()
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

  // Durante a contagem: tela inteira escura e mínima (a tela fica ligada sozinha, sem precisar bloquear)
  if (tela === 'rodando') {
    const trabalho = fase?.tipo === 'work' || fase?.tipo === 'countdown'
    const total = fase && (fase.tipo === 'work' || fase.tipo === 'rest') ? fase.fim - fase.inicio : 0
    return (
      <div className="fixed inset-0 bg-black flex flex-col select-none" translate="no"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-center flex-wrap gap-1.5 pt-6 px-6" aria-label={`Série ${serieAtual} de ${cfg.series}`}>
          {Array.from({ length: cfg.series }).map((_, i) => (
            <span key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold border ${
              i < seriesFeitas ? 'border-green-900 text-green-700' : i + 1 === serieAtual ? 'border-zinc-600 text-zinc-400' : 'border-zinc-900 text-zinc-700'}`}>
              {i < seriesFeitas ? '✓' : i + 1}
            </span>
          ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          {isContagem && estado && (
            estado.numero > 0
              ? <p key={estado.numero} className="text-[34vw] sm:text-[12rem] leading-none font-light text-purple-400/60 tabular-nums">{estado.numero}</p>
              : <p className="text-5xl font-light tracking-wide text-zinc-400">{fase?.tipo === 'countdown' ? 'TRABALHO' : 'DESCANSO'}</p>
          )}
          {(fase?.tipo === 'work' || fase?.tipo === 'rest') && estado && (
            <>
              <p className={`text-[26vw] sm:text-[10rem] leading-none font-light tabular-nums ${trabalho ? 'text-green-500/70' : 'text-sky-400/60'}`}>{mmss(Math.ceil(estado.restante))}</p>
              <div className="w-40 h-0.5 bg-zinc-900 rounded-full overflow-hidden" aria-hidden>
                <div className={`h-full ${trabalho ? 'bg-green-800' : 'bg-sky-900'}`} style={{ width: `${total > 0 ? (estado.restante / total) * 100 : 0}%`, transition: 'width 0.15s linear' }} />
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-600">{trabalho ? 'trabalho' : 'descanso'}</p>
            </>
          )}
          {fase?.tipo === 'final' && <p className="text-3xl font-light text-green-500/70">Séries finalizadas</p>}
          {precisaToque && (
            <button onClick={() => playerRef.current?.recuperar().then(() => setPrecisaToque(false)).catch(() => {})}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-green-500 text-zinc-950 animate-pulse">Toque para continuar o áudio</button>
          )}
          {pausado && <span className="text-xs font-semibold uppercase tracking-widest text-yellow-500/70">Pausado</span>}
        </div>

        {fase?.tipo !== 'final' && (
          <div className="flex justify-center gap-12 pb-10">
            <button onClick={alternarPausa} aria-label={pausado ? 'Retomar' : 'Pausar'}
              className={`w-14 h-14 rounded-full border flex items-center justify-center active:scale-95 transition ${pausado ? 'border-green-800 text-green-600' : 'border-zinc-800 text-zinc-500'}`}>
              {pausado ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
            </button>
            <button onClick={encerrar} aria-label="Encerrar" className="w-14 h-14 rounded-full border border-zinc-800 text-zinc-600 flex items-center justify-center active:scale-95 transition">
              <X className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col" translate="no">
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/60 px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={voltar} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">{ex.nome}</p>
            <p className="text-xs text-zinc-500 truncate">{dia.dia}{dia.foco ? ` · ${dia.foco}` : ''}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6 gap-6 items-center">
        <div className="flex gap-2 flex-wrap justify-center">
          {Array.from({ length: cfg.series }).map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border bg-zinc-900 text-zinc-600 border-zinc-800">{i + 1}</div>
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
                        ? 'A voz toca junto com a sua música enquanto a tela estiver desbloqueada.'
                        : 'A voz toca junto com a sua música, que abaixa um pouco só durante os avisos. Pode trocar de app ou bloquear a tela.'
                      : 'Segue tocando com a tela bloqueada, mas o celular pausa a sua música durante o exercício.'}
                  </p>
                  {sistema === 'iphone' && modoSom === 'musica' && <AvisoIphone />}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-full flex flex-col gap-3">
          {tela === 'pronto' && (
            <button onClick={iniciar} disabled={vozes === 'carregando'}
              className="w-full bg-green-500 hover:bg-green-400 text-zinc-950 font-bold text-lg py-4 rounded-2xl transition active:scale-[0.98] shadow-lg shadow-green-500/20 disabled:opacity-60 flex items-center justify-center gap-2">
              {vozes === 'carregando' ? <><Spinner size="sm" /> Preparando áudio...</> : '▶ Iniciar treino'}
            </button>
          )}
          {tela === 'pronto' && <p className="text-center text-xs text-zinc-500">Durante a contagem a tela fica ligada e escurecida, só com o tempo. Não precisa bloquear o celular.</p>}
          {erroAudio && <p className="text-center text-sm text-red-400">{erroAudio}</p>}
        </div>

        <div className="w-full flex items-center gap-3 px-1" aria-label="Volume do contador">
          <button onClick={() => { const m = !mudo; setMudo(m); playerRef.current?.setMudo(m) }} className="text-sm shrink-0"
            aria-label={mudo ? 'Ativar som' : 'Silenciar'}>{mudo ? '🔇' : '🔊'}</button>
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
