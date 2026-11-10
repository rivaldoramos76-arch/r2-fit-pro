// Contador de séries aberto direto da tela do treino: "Iniciar" (um exercício) ou "Treino completo"
// (todos em sequência). O som é preparado antes, então a contagem começa no próprio toque — o que o
// iPhone e o Android exigem para tocar áudio e entrar em tela cheia.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Pause, Play, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { concluirExercicio, type Sessao } from '../../lib/sessoes'
import { TreinoPlayer, carregarClipes, estadoEm, type Clipes, type ModoSom } from '../../lib/workoutAudio'
import { carregarNomes } from '../../lib/vozNomes'
import { carregarPreferencias, salvarPreferencias, type PrefsAudio } from '../../lib/preferencias'
import { detectarSistema } from '../../lib/instalacao'
import type { ExercicioPlano } from '../../lib/treinoModel'

type Tela = 'parado' | 'rodando' | 'concluido' | 'interrompido'
interface TreinoInfo { id: string; nome: string }
interface DiaInfo { dia: string; exercicios: ExercicioPlano[] }

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

export function useContadorTreino({ user, treino, diaIdx, dia, onSessao }: {
  user: User | null; treino: TreinoInfo | null; diaIdx: number; dia: DiaInfo | null; onSessao: (s: Sessao) => void
}) {
  const sistema = detectarSistema()
  const [vozes, setVozes] = useState<'carregando' | 'ok' | 'fallback'>('carregando')
  const clipsRef = useRef<Clipes | null>(null)
  const nomesRef = useRef<Clipes>({})
  const [modoSom, setModoSom] = useState<ModoSom>('musica')
  const [volume, setVolume] = useState(1)
  const [mudo, setMudo] = useState(false)
  const prefsAudio = useRef<PrefsAudio | null>(null)

  const [tela, setTela] = useState<Tela>('parado')
  const [itens, setItens] = useState<ExercicioPlano[]>([])
  const [t, setT] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [precisaToque, setPrecisaToque] = useState(false)
  const [erroAudio, setErroAudio] = useState('')
  const [registrados, setRegistrados] = useState<number[]>([])
  const [seriesSalvas, setSeriesSalvas] = useState(0)
  const [erroRegistro, setErroRegistro] = useState(false)
  const [treinoCompleto, setTreinoCompleto] = useState(false)
  const playerRef = useRef<TreinoPlayer | null>(null)
  const wakeRef = useRef<WakeLockSentinel | null>(null)
  const recuperando = useRef(false)

  // Vozes gravadas e preferências de som (as mesmas de Configurações)
  useEffect(() => {
    carregarClipes().then(c => { clipsRef.current = c; setVozes(c ? 'ok' : 'fallback') })
  }, [])
  useEffect(() => {
    if (!user) return
    carregarPreferencias(user.id).then(p => { prefsAudio.current = p.audio; setVolume(p.audio.volume); setMudo(p.audio.mudo); setModoSom(p.audio.modo) }).catch(() => {})
  }, [user])
  // Nome de cada exercício para o anúncio do próximo no treino completo (gerado uma vez e guardado)
  const nomesDia = dia?.exercicios.map(e => e.nome).join('|') ?? ''
  useEffect(() => {
    if (!nomesDia || vozes !== 'ok') return
    let vivo = true
    carregarNomes(nomesDia.split('|')).then(n => { if (vivo) nomesRef.current = { ...nomesRef.current, ...n } })
    return () => { vivo = false }
  }, [nomesDia, vozes])

  const salvarAudio = (parcial: Partial<PrefsAudio>) => {
    const audio = { ...(prefsAudio.current ?? { volume, mudo, modo: modoSom, abaixar_musica: true }), ...parcial }
    prefsAudio.current = audio
    if (user) salvarPreferencias(user.id, { audio }).catch(() => {})
  }
  const escolherModo = (m: ModoSom) => { setModoSom(m); salvarAudio({ modo: m }) }
  const mudarVolume = (v: number) => { setVolume(v); playerRef.current?.setVolume(v) }
  const alternarMudo = () => { const m = !mudo; setMudo(m); playerRef.current?.setMudo(m); salvarAudio({ mudo: m }) }

  // Tela sempre ligada e tela cheia enquanto o contador está aberto
  const pedirWakeLock = async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }).wakeLock
      if (wl && (!wakeRef.current || wakeRef.current.released)) {
        wakeRef.current = await wl.request('screen')
      }
    } catch { /* não suportado ou negado */ }
  }
  const liberarWakeLock = () => { wakeRef.current?.release().catch(() => {}); wakeRef.current = null }
  const entrarTelaCheia = () => { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {}) }
  const sairTelaCheia = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) }
  /** Solta os controles de mídia do sistema (a música volta a ser a dona do som e do volume). */
  const limparMidia = () => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = null
    for (const a of ['play', 'pause'] as const) { try { navigator.mediaSession.setActionHandler(a, null) } catch { /* sem suporte */ } }
  }

  useEffect(() => () => {
    playerRef.current?.parar()
    liberarWakeLock()
    sairTelaCheia()
    limparMidia()
  }, [])

  // Cada série terminada já vai para o banco (e para o diário): se a pessoa pausar e sair, o feito fica.
  // As gravações vão em fila para uma não sobrescrever a outra.
  const fila = useRef<Promise<void>>(Promise.resolve())
  const registrar = useCallback((ex: ExercicioPlano, series: number) => {
    if (!user || !treino || !dia) return
    fila.current = fila.current.then(async () => {
      try {
        const s = await concluirExercicio({
          userId: user.id, treinoId: treino.id, treinoNome: treino.nome, dia: diaIdx,
          exercicioId: ex.id, series, exerciciosDoTreino: dia.exercicios.map(e => ({ id: e.id, series: e.series })),
        })
        setTreinoCompleto(s.concluido)
        onSessao(s)
      } catch { setErroRegistro(true) }
    })
  }, [user, treino, dia, diaIdx, onSessao])

  // Atualização da tela (o tempo vem do áudio, então não acumula atraso)
  useEffect(() => {
    if (tela !== 'rodando') return
    const tick = () => {
      const p = playerRef.current
      if (!p) return
      // O sistema pausou o áudio (tela bloqueada, ligação): ao voltar, segue do ponto certo
      if (p.interrompido && document.visibilityState === 'visible' && !recuperando.current) {
        recuperando.current = true
        const limite = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tempo')), 2000))
        Promise.race([p.recuperar(), limite]).then(() => setPrecisaToque(false)).catch(() => setPrecisaToque(true)).finally(() => { recuperando.current = false })
      }
      setT(p.tempo())
      setPausado(p.pausado)
      p.verificar()
    }
    const id = setInterval(tick, 100)
    // O sistema solta o "tela ligada" quando o app sai da frente: pede de novo ao voltar
    const vis = () => { if (document.visibilityState === 'visible') { tick(); pedirWakeLock() } }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [tela])

  const estado = playerRef.current && tela === 'rodando' ? estadoEm(playerRef.current.crono, t) : null
  const idxAtual = estado?.fase.exercicio ?? 0
  const exAtual = itens[idxAtual]

  // Informações na tela de bloqueio / central de controle
  useEffect(() => {
    // Só no modo "tela bloqueada": no modo música, os controles do fone e da tela de bloqueio ficam com o app de música
    if (tela !== 'rodando' || modoSom !== 'bloqueio' || !exAtual || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: exAtual.nome, artist: `R2 Fit Pro · ${dia?.dia ?? ''}`,
      album: itens.length > 1 ? `Exercício ${idxAtual + 1} de ${itens.length}` : `${exAtual.series} séries`,
    })
  }, [tela, modoSom, exAtual, dia, idxAtual, itens.length])

  /** Começa a contagem. Chamar direto no toque do botão. */
  const iniciar = (lista: ExercicioPlano[]) => {
    if (!lista.length || vozes === 'carregando') return
    setErroAudio('')
    playerRef.current?.parar()
    const base = clipsRef.current
    const clips = base ? { ...base, ...nomesRef.current } : null
    const cfg = lista.map(e => ({ series: e.series, execSeg: Math.max(5, e.tempo_execucao_segundos), descansoSeg: e.tempo_descanso_segundos, nome: e.nome }))
    const p = new TreinoPlayer(cfg, clips, {
      onSerieConcluida: (i, serie) => { setSeriesSalvas(n => n + 1); registrar(lista[i], serie) },
      onExercicioConcluido: i => { setRegistrados(r => [...r, i]) },
      onSeriesConcluidas: () => {},
      // Fim da última fala: desliga o som do contador na hora, para a música voltar ao volume normal
      onFim: () => { setTela('concluido'); liberarWakeLock(); sairTelaCheia(); p.parar(); limparMidia() },
    }, modoSom, { abaixarMusica: sistema === 'android' && prefsAudio.current?.abaixar_musica !== false })
    p.setVolume(volume)
    p.setMudo(mudo)
    playerRef.current = p
    setItens(lista)
    setRegistrados([])
    setSeriesSalvas(0)
    setErroRegistro(false)
    setTreinoCompleto(false)
    setT(0)
    setPausado(false)
    entrarTelaCheia()
    pedirWakeLock()
    // play() precisa acontecer dentro do toque do usuário (exigência do iOS/Android)
    p.iniciar().then(() => {
      setTela('rodando')
      if ('mediaSession' in navigator && modoSom === 'bloqueio') {
        navigator.mediaSession.setActionHandler('play', () => { p.retomar().catch(() => setPrecisaToque(true)); setPausado(false) })
        navigator.mediaSession.setActionHandler('pause', () => { p.pausar(); setPausado(true) })
      }
    }).catch(() => {
      setErroAudio('O navegador bloqueou o áudio. Toque de novo para iniciar.')
      sairTelaCheia()
      liberarWakeLock()
      p.parar()
      playerRef.current = null
    })
  }

  const alternarPausa = () => {
    const p = playerRef.current
    if (!p) return
    // A tela continua ligada mesmo pausado
    if (p.pausado) p.retomar().catch(() => setPrecisaToque(true)); else p.pausar()
    setPausado(!pausado)
  }

  const fechar = () => {
    playerRef.current?.parar()
    playerRef.current = null
    liberarWakeLock()
    sairTelaCheia()
    limparMidia()
    setTela('parado')
  }

  const encerrar = () => {
    const multi = itens.length > 1
    const msg = multi
      ? 'Encerrar o treino agora? Tudo o que já foi feito fica no diário como treino incompleto.'
      : 'Encerrar agora? As séries já feitas ficam no diário como treino incompleto.'
    if (!confirm(msg)) return
    playerRef.current?.parar()
    playerRef.current = null
    liberarWakeLock()
    sairTelaCheia()
    limparMidia()
    setTela('interrompido')
  }

  // --- Opções de som (ficam na tela do treino, antes de iniciar) ---
  const opcoesSom: ReactNode = (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4" aria-label="Som do contador">
      <p className="text-sm font-semibold text-zinc-200 mb-2">Som do contador</p>
      {vozes === 'fallback' ? (
        <p className="text-xs text-zinc-500">Vozes gravadas indisponíveis: usando a voz do navegador. Neste modo, mantenha a tela ligada.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 bg-zinc-950 border border-zinc-800 rounded-xl p-1" role="radiogroup" aria-label="Modo do som">
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
        </>
      )}
      <div className="flex items-center gap-3 mt-3" aria-label="Volume do contador">
        <button type="button" onClick={alternarMudo} className="text-sm shrink-0" aria-label={mudo ? 'Ativar som' : 'Silenciar'}>{mudo ? '🔇' : '🔊'}</button>
        <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume"
          onChange={e => mudarVolume(+e.target.value)} onPointerUp={() => salvarAudio({ volume })} onKeyUp={() => salvarAudio({ volume })}
          className="flex-1 h-1 accent-green-500 cursor-pointer" />
        <span className="text-xs text-zinc-500 w-9 text-right">{Math.round(volume * 100)}%</span>
      </div>
      <p className="text-[11px] text-zinc-600 mt-2">Durante a contagem a tela fica ligada e escurecida, só com o tempo. Não precisa bloquear o celular.</p>
      {erroAudio && <p className="text-sm text-red-400 mt-2">{erroAudio}</p>}
    </section>
  )

  // --- Tela da contagem (por cima de tudo) ---
  let overlay: ReactNode = null
  if (tela === 'concluido' || tela === 'interrompido') {
    const ok = tela === 'concluido'
    const multi = itens.length > 1
    const feitos = registrados.map(i => itens[i]).filter(Boolean)
    overlay = (
      <div className="fixed inset-0 z-[70] bg-zinc-950 flex flex-col items-center justify-center p-6 text-center gap-6 overflow-y-auto" translate="no">
        <div className="text-6xl">{ok ? (treinoCompleto || multi ? '🏆' : '🎉') : '⏹'}</div>
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${ok ? 'text-green-400' : 'text-zinc-200'}`}>
            {ok ? (multi ? 'Treino completo!' : 'Exercício concluído!') : multi ? 'Treino interrompido' : 'Exercício interrompido'}
          </h1>
          {!multi && itens[0] && <p className="text-zinc-300 font-semibold">{itens[0].nome}</p>}
          {multi
            ? <p className="text-zinc-500 text-sm mt-1">{feitos.length} de {itens.length} exercícios concluídos</p>
            : <p className="text-zinc-500 text-sm mt-1">{ok ? `${itens[0]?.series ?? 0} séries finalizadas` : `${seriesSalvas} de ${itens[0]?.series ?? 0} séries feitas`}</p>}
          {seriesSalvas > 0 && !erroRegistro && (
            <p className="text-xs text-green-400 mt-3">✓ {treinoCompleto ? `${dia?.dia} completo` : ok && !multi ? 'Exercício registrado' : 'Treino incompleto'} · já está no seu diário</p>
          )}
          {!ok && seriesSalvas === 0 && <p className="text-xs text-zinc-500 mt-3">Nenhuma série chegou ao fim, então nada foi para o diário.</p>}
          {erroRegistro && <p className="text-xs text-red-400 mt-3">Não foi possível registrar a conclusão de algum exercício. Confira na lista.</p>}
        </div>
        {multi && feitos.length > 0 && (
          <ul className="text-sm text-zinc-400 flex flex-col gap-1">{feitos.map(e => <li key={e.id}>✓ {e.nome}</li>)}</ul>
        )}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={fechar} className="w-full bg-green-500 hover:bg-green-400 text-zinc-950 font-bold py-3.5 rounded-xl active:scale-95 transition">
            Voltar ao {dia?.dia ?? 'treino'}
          </button>
          {!multi && itens[0] && (
            <button onClick={() => iniciar(itens)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold py-3 rounded-xl active:scale-95 transition">
              {ok ? 'Repetir exercício' : 'Recomeçar'}
            </button>
          )}
        </div>
      </div>
    )
  } else if (tela === 'rodando') {
    const fase = estado?.fase
    const ex = exAtual
    const series = ex?.series ?? 1
    const serieAtual = fase?.serie ?? 1
    const transicao = fase?.tipo === 'rest' && fase.proximo != null
    const proximo = transicao ? itens[fase!.proximo!] : null
    const isContagem = fase?.tipo === 'countdown' || fase?.tipo === 'rest_countdown'
    const seriesFeitas = !fase ? 0 : fase.tipo === 'final' || transicao ? series
      : fase.tipo === 'rest_countdown' || fase.tipo === 'rest' ? serieAtual : serieAtual - 1
    const trabalho = fase?.tipo === 'work' || fase?.tipo === 'countdown'
    const total = fase && (fase.tipo === 'work' || fase.tipo === 'rest') ? fase.fim - fase.inicio : 0
    const frac = total > 0 && estado ? Math.max(0, Math.min(1, estado.restante / total)) : isContagem ? 1 : 0
    const RAIO = 47, CIRC = 2 * Math.PI * RAIO
    const corAnel = trabalho ? 'stroke-green-600/50' : 'stroke-sky-600/45'
    const agora = new Date()
    const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
    overlay = (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col select-none" translate="no"
        // O sistema tira a tela cheia quando se troca de app ou bloqueia a tela; o navegador só deixa voltar com um toque
        onPointerDown={() => { if (!document.fullscreenElement) entrarTelaCheia() }}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <p className="text-center text-[13px] text-zinc-700 tabular-nums pt-4" aria-label={`Hora atual ${hora}`}>{hora}</p>
        {itens.length > 1 && ex && (
          <p className="text-center text-[11px] text-zinc-700 pt-1 px-6 truncate">Exercício {idxAtual + 1} de {itens.length} · {ex.nome}</p>
        )}
        <div className="flex justify-center flex-wrap gap-1.5 px-6 pt-3" aria-label={`Série ${serieAtual} de ${series}`}>
          {Array.from({ length: series }).map((_, i) => (
            <span key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-semibold border ${
              i < seriesFeitas ? 'border-green-950 text-green-800' : i + 1 === serieAtual ? 'border-zinc-700 text-zinc-500' : 'border-zinc-900 text-zinc-800'}`}>
              {i < seriesFeitas ? '✓' : i + 1}
            </span>
          ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
          {fase?.tipo !== 'final' && (
            <div className="relative w-[80vw] max-w-[24rem] aspect-square flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r={RAIO} fill="none" strokeWidth="1.2" className="stroke-zinc-900" />
                <circle cx="50" cy="50" r={RAIO} fill="none" strokeWidth="1.6" strokeLinecap="round" className={isContagem ? 'stroke-zinc-800' : corAnel}
                  strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} style={{ transition: 'stroke-dashoffset 0.15s linear' }} />
              </svg>
              <div className="flex flex-col items-center">
                {isContagem && estado && (
                  estado.numero > 0
                    ? <p key={estado.numero} className="text-[30vw] sm:text-[9rem] leading-none font-extralight text-purple-400/40 tabular-nums">{estado.numero}</p>
                    : <p className="text-3xl font-light tracking-[0.2em] text-zinc-500">{fase?.tipo === 'countdown' ? 'TRABALHO' : 'DESCANSO'}</p>
                )}
                {(fase?.tipo === 'work' || fase?.tipo === 'rest') && estado && (
                  <>
                    <p className={`text-[21vw] sm:text-[6.5rem] leading-none font-extralight tabular-nums ${trabalho ? 'text-green-500/50' : 'text-sky-400/45'}`}>{mmss(Math.ceil(estado.restante))}</p>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-700 mt-3">{trabalho ? 'trabalho' : 'descanso'}</p>
                  </>
                )}
              </div>
            </div>
          )}
          {proximo && (fase?.tipo === 'rest') && <p className="text-xs text-zinc-600 text-center px-6">Próximo: <span className="text-zinc-400">{proximo.nome}</span></p>}
          {fase?.tipo === 'final' && <p className="text-3xl font-light text-green-500/60">{itens.length > 1 ? 'Treino completo' : 'Séries finalizadas'}</p>}
          {precisaToque && (
            <button onClick={() => playerRef.current?.recuperar().then(() => setPrecisaToque(false)).catch(() => {})}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-green-600/80 text-zinc-950 animate-pulse">Toque para continuar o áudio</button>
          )}
          {pausado && <span className="text-[11px] font-semibold uppercase tracking-widest text-yellow-600/60">Pausado</span>}
        </div>

        {fase?.tipo !== 'final' && (
          <div className="flex justify-center gap-14 pb-8">
            <button onClick={alternarPausa} aria-label={pausado ? 'Retomar' : 'Pausar'}
              className={`w-12 h-12 rounded-full border flex items-center justify-center active:scale-95 transition ${pausado ? 'border-green-900 text-green-700' : 'border-zinc-900 text-zinc-700'}`}>
              {pausado ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
            <button onClick={encerrar} aria-label="Encerrar" className="w-12 h-12 rounded-full border border-zinc-900 text-zinc-700 flex items-center justify-center active:scale-95 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return { iniciar, preparando: vozes === 'carregando', rodando: tela !== 'parado', opcoesSom: tela === 'parado' ? opcoesSom : null, overlay }
}
