// Motor do contador de séries.
//
// Modo "com tela bloqueada": todo o exercício (contagens, "Trabalho!", "Repouso!", silêncio dos cronômetros e o
// aviso final) é renderizado como UMA faixa de áudio contínua e tocado por um
// <audio>. Navegadores mantêm a reprodução de mídia iniciada pelo usuário mesmo com
// a aba em segundo plano/tela bloqueada, enquanto timers JavaScript são suspensos.
// O tempo da faixa (audio.currentTime) é também a referência de tempo do cronômetro,
// então áudio e tela nunca dessincronizam e a pausa congela ambos.
//
// Se as vozes pré-gravadas não puderem ser carregadas, usamos o modo "voz"
// (speechSynthesis + relógio performance.now), que funciona com a tela ativa.

export type ClipKey = '5' | '4' | '3' | '2' | '1' | 'trabalho' | 'repouso' | 'fim'
export const CLIP_KEYS: ClipKey[] = ['5', '4', '3', '2', '1', 'trabalho', 'repouso', 'fim']
export const CLIP_TEXTO: Record<ClipKey, string> = {
  '5': 'Cinco', '4': 'Quatro', '3': 'Três', '2': 'Dois', '1': 'Um',
  trabalho: 'Trabalho!', repouso: 'Repouso!', fim: 'Exercício concluído! Todas as séries finalizadas.',
}

export type FaseTipo = 'countdown' | 'work' | 'rest_countdown' | 'rest' | 'final'
export interface Cue { t: number; clip: ClipKey }
export interface Fase { tipo: FaseTipo; serie: number; inicio: number; fim: number; cues: Cue[] }
export interface Cronograma { fases: Fase[]; cues: Cue[]; total: number; fimUltimaSerie: number }
export interface ConfigCrono { series: number; execSeg: number; descansoSeg: number }

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Monta a linha do tempo completa. `dur` = duração real de cada clipe (s), quando conhecida. */
export function montarCronograma(cfg: ConfigCrono, dur: Partial<Record<ClipKey, number>> = {}): Cronograma {
  const series = Math.max(1, Math.round(cfg.series))
  const exec = Math.max(1, cfg.execSeg)
  const desc = Math.max(0, cfg.descansoSeg)
  const maxNum = Math.max(...(['5', '4', '3', '2', '1'] as ClipKey[]).map(k => dur[k] ?? 0.7))
  const passo = Math.max(1, r3(maxNum + 0.12)) // nunca sobrepõe dois números
  const fases: Fase[] = []
  const cues: Cue[] = []
  let t = 0

  const contagem = (tipo: 'countdown' | 'rest_countdown', serie: number, comando: ClipKey) => {
    const inicio = t
    const fc: Cue[] = (['5', '4', '3', '2', '1'] as ClipKey[]).map((clip, i) => ({ t: r3(inicio + i * passo), clip }))
    const tCmd = r3(inicio + 5 * passo)
    fc.push({ t: tCmd, clip: comando })
    const fim = r3(tCmd + Math.max(0.9, (dur[comando] ?? 0.8) + 0.15))
    fases.push({ tipo, serie, inicio, fim, cues: fc })
    cues.push(...fc)
    t = fim
  }

  for (let s = 1; s <= series; s++) {
    contagem('countdown', s, 'trabalho')
    fases.push({ tipo: 'work', serie: s, inicio: t, fim: r3(t + exec), cues: [] })
    t = r3(t + exec)
    if (s < series) {
      contagem('rest_countdown', s, 'repouso')
      fases.push({ tipo: 'rest', serie: s, inicio: t, fim: r3(t + desc), cues: [] })
      t = r3(t + desc)
    }
  }
  const fimUltimaSerie = t
  const cueFim: Cue = { t: r3(t + 0.25), clip: 'fim' }
  cues.push(cueFim)
  const total = r3(cueFim.t + (dur.fim ?? 3.5) + 0.6)
  fases.push({ tipo: 'final', serie: series, inicio: t, fim: total, cues: [cueFim] })
  return { fases, cues, total, fimUltimaSerie }
}

export interface Estado {
  fase: Fase
  indice: number
  restante: number // segundos restantes na fase
  numero: number // número da contagem regressiva (5..1) ou 0 quando o comando é falado
}

export function estadoEm(c: Cronograma, t: number): Estado {
  let idx = c.fases.findIndex(f => t < f.fim)
  if (idx < 0) idx = c.fases.length - 1
  const fase = c.fases[idx]
  let numero = 0
  if (fase.tipo === 'countdown' || fase.tipo === 'rest_countdown') {
    const ultimo = [...fase.cues].reverse().find(cu => cu.t <= t) ?? fase.cues[0]
    numero = /^[0-9]$/.test(ultimo.clip) ? Number(ultimo.clip) : 0
  }
  return { fase, indice: idx, restante: Math.max(0, fase.fim - t), numero }
}

// --- Renderização da faixa (WAV PCM 16 bits mono) ---

export function renderizarFaixa(c: Cronograma, clips: Record<ClipKey, Float32Array>, sr: number): Blob {
  const n = Math.ceil(c.total * sr)
  const buf = new ArrayBuffer(44 + n * 2)
  const dv = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, n * 2, true)
  const pcm = new Int16Array(buf, 44, n)
  for (const cue of c.cues) {
    const clip = clips[cue.clip]
    if (!clip) continue
    const off = Math.round(cue.t * sr)
    for (let i = 0; i < clip.length && off + i < n; i++) {
      const v = pcm[off + i] + clip[i] * 32767
      pcm[off + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** Remove silêncio do início/fim e normaliza o pico, para o som começar exatamente no tempo marcado. */
export function aparar(s: Float32Array, sr: number, limiar = 0.012): Float32Array {
  let pico = 0
  for (const v of s) pico = Math.max(pico, Math.abs(v))
  if (pico < limiar) return new Float32Array(0)
  // Detecta a fala por janelas de 10 ms. O fim das palavras ("cincO", "quatrO") é fraco,
  // então o corte é baixo (2,5% do pico) e sobra uma folga de 150 ms antes da saída suave.
  const jan = Math.max(1, Math.round(sr * 0.01))
  const corte = Math.max(limiar * 0.5, pico * 0.025)
  const nj = Math.ceil(s.length / jan)
  const rmsJ = (j: number) => {
    let x = 0, n = 0
    for (let i = j * jan; i < Math.min(s.length, (j + 1) * jan); i++) { x += s[i] * s[i]; n++ }
    return Math.sqrt(x / Math.max(1, n))
  }
  let ja = 0, jb = nj - 1
  while (ja < nj && rmsJ(ja) < corte) ja++
  while (jb > ja && rmsJ(jb) < corte) jb--
  if (ja >= jb && rmsJ(ja) < corte) return new Float32Array(0)
  const ini = Math.max(0, ja * jan - 2 * jan)
  const fim = Math.min(s.length, (jb + 1) * jan + 15 * jan)
  const out = s.slice(ini, fim)
  const fadeIn = Math.min(out.length, Math.round(sr * 0.005)), fadeOut = Math.min(out.length, Math.round(sr * 0.1))
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= Math.sin((i / fadeOut) * Math.PI / 2)
  let p = 0
  for (const v of out) p = Math.max(p, Math.abs(v))
  if (p > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / p) * 0.92
  return out
}

/** Deixa a fala mais alta e uniforme para ser ouvida por cima da música, sem distorcer:
 *  1) ganho automático lento (pela média de energia, sobe no máximo `ganhoMax` vezes e só
 *     onde há voz), 2) limitador de picos com olhar à frente, que reduz o volume antes de
 *     um pico em vez de achatar a onda. O pico final fica em 0,97. */
export function maximizar(s: Float32Array, sr: number, { alvo = 0.55, ganhoMax = 6 } = {}): Float32Array {
  const n = s.length
  if (!n) return s
  let picoIn = 0
  for (const v of s) picoIn = Math.max(picoIn, Math.abs(v))
  if (picoIn === 0) return s
  // 1) Envelope de energia (RMS) suave, olhando 10 ms à frente
  const adiante = Math.round(sr * 0.01)
  const ataque = Math.exp(-1 / (sr * 0.02)), soltura = Math.exp(-1 / (sr * 0.15))
  // Envelope rápido só para o portão de ruído: fecha logo que a voz acaba,
  // para não aumentar o chiado/respiração logo depois da palavra
  const ataqueR = Math.exp(-1 / (sr * 0.005)), solturaR = Math.exp(-1 / (sr * 0.03))
  const env = new Float32Array(n), envR = new Float32Array(n)
  let e2 = 0, r2 = 0
  for (let i = 0; i < n; i++) {
    const x = s[Math.min(n - 1, i + adiante)]
    const q = x * x
    e2 = q > e2 ? ataque * e2 + (1 - ataque) * q : soltura * e2 + (1 - soltura) * q
    r2 = q > r2 ? ataqueR * r2 + (1 - ataqueR) * q : solturaR * r2 + (1 - solturaR) * q
    env[i] = Math.sqrt(e2); envR[i] = Math.sqrt(r2)
  }
  const portao = picoIn * 0.03 // abaixo disso não é voz: não amplifica
  const y = new Float32Array(n)
  let g = 1
  const suav = Math.exp(-1 / (sr * 0.03))
  for (let i = 0; i < n; i++) {
    const abertura = Math.min(1, Math.max(0, (envR[i] - portao) / portao))
    const alvoG = 1 + (Math.min(ganhoMax, Math.max(1, alvo / Math.max(env[i], 1e-5))) - 1) * abertura
    g = suav * g + (1 - suav) * alvoG
    y[i] = s[i] * g
  }
  // 2) Limitador com olhar à frente de 5 ms (ganho mínimo da janela, soltura de 80 ms)
  const L = Math.max(1, Math.round(sr * 0.005))
  const teto = 0.97
  const req = new Float32Array(n)
  for (let i = 0; i < n; i++) req[i] = Math.min(1, teto / Math.max(Math.abs(y[i]), 1e-9))
  const out = new Float32Array(n)
  const rel = Math.exp(-1 / (sr * 0.08))
  let gl = 1
  for (let i = 0; i < n; i++) {
    let mn = 1
    for (let k = i; k < Math.min(n, i + L); k++) if (req[k] < mn) mn = req[k]
    gl = mn < gl ? mn : rel * gl + (1 - rel) * mn
    out[i] = y[i] * Math.min(gl, mn)
  }
  return out
}

// --- Carregamento das vozes ---

export const TAXA = 24000
let cacheClipes: Promise<Record<ClipKey, Float32Array> | null> | null = null

function decodificar(dados: ArrayBuffer): Promise<AudioBuffer> {
  const W = window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }
  const Ctor = W.OfflineAudioContext ?? W.webkitOfflineAudioContext
  if (!Ctor) return Promise.reject(new Error('Sem OfflineAudioContext'))
  const ctx = new Ctor(1, TAXA, TAXA)
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(dados, res, rej) as unknown as Promise<AudioBuffer> | undefined
    p?.then?.(res, rej)
  })
}

export function carregarClipes(): Promise<Record<ClipKey, Float32Array> | null> {
  if (cacheClipes) return cacheClipes
  cacheClipes = (async () => {
    try {
      const pares = await Promise.all(CLIP_KEYS.map(async k => {
        const r = await fetch(`/audio/${k}.wav`)
        if (!r.ok) throw new Error(`clip ${k}: ${r.status}`)
        const ab = await decodificar(await r.arrayBuffer())
        const dados = maximizar(aparar(ab.getChannelData(0), ab.sampleRate), ab.sampleRate)
        if (!dados.length) throw new Error(`clip ${k} vazio`)
        return [k, dados] as const
      }))
      return Object.fromEntries(pares) as Record<ClipKey, Float32Array>
    } catch (e) {
      console.warn('[R2] vozes indisponíveis, usando síntese de voz do navegador', e)
      return null
    }
  })()
  const atual = cacheClipes
  // permite nova tentativa em uma próxima abertura se falhou
  atual.then(r => { if (!r && cacheClipes === atual) cacheClipes = null })
  return atual
}

export function duracoes(clips: Record<ClipKey, Float32Array>): Record<ClipKey, number> {
  return Object.fromEntries(CLIP_KEYS.map(k => [k, clips[k].length / TAXA])) as Record<ClipKey, number>
}

/** WAV silencioso (usado para pedir ao Android que abaixe a música durante os avisos). */
export function silencioWav(seg: number, sr = 8000): Blob {
  const n = Math.round(seg * sr)
  const buf = new ArrayBuffer(44 + n * 2)
  const dv = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, n * 2, true)
  return new Blob([buf], { type: 'audio/wav' })
}

// --- Player ---
//
// Três modos:
// - "mix" (padrão quando a pessoa escolhe "por cima da música"): os clipes são agendados
//   no Web Audio. Não pede o foco de áudio do sistema, então Spotify/Apple Music continuam
//   tocando por baixo. No iPhone usa a sessão "ambient" (mistura, mas para com a tela
//   bloqueada); ao voltar, o treino continua do ponto certo.
// - "audio" ("com tela bloqueada"): uma faixa contínua num <audio>, que segue com a tela
//   bloqueada, mas assume o som do aparelho e pausa a música.
// - "voz": sem as vozes gravadas, usa a síntese de voz do navegador (tela ligada).

export type ModoSom = 'musica' | 'bloqueio'

export interface Ouvintes {
  onSeriesConcluidas: () => void // todas as séries terminaram (antes do aviso final)
  onFim: () => void // aviso final terminou
}

type Ctx = AudioContext

function definirSessaoAudio(tipo: 'ambient' | 'playback') {
  // Safari 16.4+: "ambient" mistura com outros apps; "playback" segue em segundo plano
  const sessao = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (sessao) { try { sessao.type = tipo } catch { /* não suportado */ } }
}

export class TreinoPlayer {
  readonly modo: 'mix' | 'audio' | 'voz'
  readonly crono: Cronograma
  private ouv: Ouvintes
  private concluidoAvisado = false
  private fimAvisado = false
  private parado = false
  private volume = 1
  private mudo = false
  // Relógio de parede: se o sistema pausar o som (tela bloqueada, ligação, outro app),
  // ao voltar o treino continua do ponto em que deveria estar, sem "congelar".
  private baseParede = 0
  private pausaPedida = false
  /** O som foi pausado pelo sistema, não pela pessoa. */
  interrompido = false
  // modo audio
  private audio: HTMLAudioElement | null = null
  private url: string | null = null
  // modo mix
  private clips: Record<ClipKey, Float32Array> | null = null
  private ctx: Ctx | null = null
  private ganho: GainNode | null = null
  private entrada: AudioNode | null = null
  private buffers: Partial<Record<ClipKey, AudioBuffer>> = {}
  private fontes: AudioBufferSourceNode[] = []
  private t0Ctx = 0
  private pausadoMix = false
  // Android: durante cada aviso toca um áudio curto e silencioso (< 5 s). O Chrome pede ao
  // sistema um "foco de áudio passageiro", e o Android abaixa a música por um instante,
  // como no GPS. O relógio vem do próprio Web Audio (funciona em segundo plano).
  private abaixarMusica = false
  private duckCurto: HTMLAudioElement | null = null
  private duckLongo: HTMLAudioElement | null = null
  private urlsDuck: string[] = []
  private relogio: ScriptProcessorNode | null = null
  private proximoDuck = 0
  // modo voz
  private t0 = 0
  private pausadoEm: number | null = null
  private acumuladoPausa = 0
  private proximoCue = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(cfg: ConfigCrono, clips: Record<ClipKey, Float32Array> | null, ouv: Ouvintes, modoSom: ModoSom = 'musica',
    opcoes: { abaixarMusica?: boolean } = {}) {
    this.ouv = ouv
    this.abaixarMusica = !!opcoes.abaixarMusica
    this.modo = !clips ? 'voz' : modoSom === 'musica' ? 'mix' : 'audio'
    this.crono = montarCronograma(cfg, clips ? duracoes(clips) : {})
    if (this.modo === 'mix') this.clips = clips
    if (this.modo === 'audio' && clips) {
      const blob = renderizarFaixa(this.crono, clips, TAXA)
      this.url = URL.createObjectURL(blob)
      const a = new Audio()
      a.preload = 'auto'
      a.src = this.url
      a.setAttribute('playsinline', '')
      a.addEventListener('timeupdate', () => this.verificar())
      a.addEventListener('ended', () => this.verificar(true))
      a.addEventListener('pause', () => {
        if (!this.pausaPedida && !a.ended && !this.parado) this.interrompido = true
        this.pausaPedida = false
      })
      a.addEventListener('playing', () => { this.interrompido = false })
      this.audio = a
    }
  }

  /** Deve ser chamado dentro do gesto do usuário (toque em "Iniciar"). */
  iniciar(): Promise<void> {
    if (this.modo === 'mix') return this.iniciarMix()
    if (this.audio) { definirSessaoAudio('playback'); return this.tocarDe(0) }
    this.t0 = Date.now()
    this.timer = setInterval(() => this.tickVoz(), 80)
    this.tickVoz()
    return Promise.resolve()
  }

  private async iniciarMix() {
    definirSessaoAudio('ambient')
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctor = W.AudioContext ?? W.webkitAudioContext
    if (!Ctor || !this.clips) throw new Error('Web Audio indisponível')
    const ctx = new Ctor()
    this.ctx = ctx
    // Voz → realce de presença (nitidez sobre a música) → corte de graves → limitador → volume
    const presenca = ctx.createBiquadFilter()
    presenca.type = 'peaking'; presenca.frequency.value = 3000; presenca.Q.value = 0.8; presenca.gain.value = 3
    const graves = ctx.createBiquadFilter()
    graves.type = 'highpass'; graves.frequency.value = 100
    const limitador = ctx.createDynamicsCompressor()
    limitador.threshold.value = -3; limitador.knee.value = 3; limitador.ratio.value = 12
    limitador.attack.value = 0.003; limitador.release.value = 0.25
    this.ganho = ctx.createGain()
    this.entrada = presenca
    presenca.connect(graves); graves.connect(limitador); limitador.connect(this.ganho)
    this.ganho.connect(ctx.destination)
    this.aplicarVolume()
    for (const k of CLIP_KEYS) {
      const dados = this.clips[k]
      const b = ctx.createBuffer(1, dados.length, TAXA)
      b.getChannelData(0).set(dados)
      this.buffers[k] = b
    }
    ctx.addEventListener('statechange', () => {
      if (this.parado) return
      if (ctx.state !== 'running' && !this.pausaPedida && !this.pausadoMix) this.interrompido = true
    })
    if (this.abaixarMusica) this.prepararAbaixar(ctx)
    await ctx.resume()
    this.agendarDe(0)
  }

  private prepararAbaixar(ctx: Ctx) {
    const criar = (seg: number) => {
      const url = URL.createObjectURL(silencioWav(seg))
      this.urlsDuck.push(url)
      const a = new Audio(url)
      a.preload = 'auto'
      a.setAttribute('playsinline', '')
      return a
    }
    this.duckCurto = criar(1.4)
    this.duckLongo = criar(4.5)
    // Batida do relógio de áudio: dispara no tempo certo mesmo com a tela bloqueada
    const relogio = ctx.createScriptProcessor(2048, 1, 1)
    const mudo = ctx.createGain()
    mudo.gain.value = 0
    relogio.connect(mudo); mudo.connect(ctx.destination)
    relogio.onaudioprocess = () => this.marcarAbaixar()
    this.relogio = relogio
  }

  /** Abaixa a música (Android) quando um aviso está para começar. */
  private marcarAbaixar() {
    if (!this.ctx || this.parado || this.pausadoMix || this.interrompido || !this.duckCurto) return
    const t = this.ctx.currentTime - this.t0Ctx
    const cues = this.crono.cues
    while (this.proximoDuck < cues.length && cues[this.proximoDuck].t - 0.3 <= t) {
      const cue = cues[this.proximoDuck++]
      if (t > cue.t + 0.3) continue
      const el = cue.clip === 'fim' ? this.duckLongo! : this.duckCurto
      try { el.currentTime = 0 } catch { /* ainda carregando */ }
      el.play().catch(() => {})
    }
  }

  /** Agenda no Web Audio todos os avisos a partir da posição `pos` (s). */
  private agendarDe(pos: number) {
    const ctx = this.ctx!
    for (const f of this.fontes) { try { f.stop() } catch { /* já parou */ } }
    this.fontes = []
    this.t0Ctx = ctx.currentTime + 0.05 - pos
    this.baseParede = Date.now() - pos * 1000
    this.proximoDuck = this.crono.cues.findIndex(c => c.t >= pos - 0.05)
    if (this.proximoDuck < 0) this.proximoDuck = this.crono.cues.length
    for (const cue of this.crono.cues) {
      if (cue.t < pos - 0.05) continue
      const b = this.buffers[cue.clip]
      if (!b) continue
      const src = ctx.createBufferSource()
      src.buffer = b
      src.connect(this.entrada ?? this.ganho!)
      src.start(this.t0Ctx + cue.t)
      this.fontes.push(src)
    }
    this.interrompido = false
  }

  tempo(): number {
    if (this.modo === 'mix') {
      if (!this.ctx) return 0
      if (this.interrompido) return Math.min(this.crono.total, this.posicaoEsperada())
      return Math.min(this.crono.total, Math.max(0, this.ctx.currentTime - this.t0Ctx))
    }
    if (this.audio) {
      if (this.audio.ended) return this.crono.total
      // Enquanto o sistema segura o áudio, a tela mostra o tempo real do treino
      return this.interrompido ? Math.min(this.crono.total, this.posicaoEsperada()) : this.audio.currentTime
    }
    if (!this.t0) return 0
    const agora = this.pausadoEm ?? Date.now()
    return (agora - this.t0 - this.acumuladoPausa) / 1000
  }

  get pausado(): boolean {
    if (this.modo === 'mix') return this.pausadoMix
    return this.audio ? this.audio.paused && !this.audio.ended && !this.interrompido : this.pausadoEm !== null
  }

  pausar() {
    if (this.modo === 'mix') {
      if (!this.ctx || this.pausadoMix) return
      this.pausadoMix = true
      this.pausaPedida = true
      this.interrompido = false
      this.ctx.suspend().finally(() => { this.pausaPedida = false })
      return
    }
    if (this.audio) { this.pausaPedida = !this.audio.paused; this.interrompido = false; this.audio.pause(); return }
    if (this.pausadoEm === null) { this.pausadoEm = Date.now(); window.speechSynthesis?.pause() }
  }

  /** Posição em que o treino deveria estar pelo relógio (só faz sentido após interrupção do sistema). */
  private posicaoEsperada(): number {
    return Math.max(0, (Date.now() - this.baseParede) / 1000)
  }

  private tocarDe(seg: number): Promise<void> {
    const a = this.audio!
    if (Math.abs(a.currentTime - seg) > 0.25) a.currentTime = seg
    this.baseParede = Date.now() - seg * 1000
    return a.play()
  }

  /** Depois de uma interrupção do sistema, pula para onde o treino deveria estar e volta a tocar. */
  async recuperar(): Promise<void> {
    if (!this.interrompido || this.parado) return
    const pos = this.posicaoEsperada()
    if (pos >= this.crono.total) {
      this.interrompido = false
      if (this.audio) this.audio.currentTime = this.crono.total
      this.verificar(true)
      return
    }
    if (this.modo === 'mix' && this.ctx) {
      await this.ctx.resume()
      this.agendarDe(pos)
      return
    }
    if (this.audio) return this.tocarDe(pos)
  }

  async retomar(): Promise<void> {
    if (this.modo === 'mix') {
      if (!this.ctx) return
      if (this.interrompido) return this.recuperar()
      if (!this.pausadoMix) return
      await this.ctx.resume()
      this.pausadoMix = false
      this.baseParede = Date.now() - this.tempo() * 1000
      return
    }
    if (this.audio) return this.interrompido ? this.recuperar() : this.tocarDe(this.audio.currentTime)
    if (this.pausadoEm !== null) {
      this.acumuladoPausa += Date.now() - this.pausadoEm
      this.pausadoEm = null
      window.speechSynthesis?.resume()
    }
  }

  private aplicarVolume() {
    if (this.ganho) this.ganho.gain.value = this.mudo ? 0 : this.volume
  }

  setVolume(v: number) {
    this.volume = v
    if (this.audio) this.audio.volume = v
    this.aplicarVolume()
  }

  setMudo(m: boolean) {
    this.mudo = m
    if (this.audio) this.audio.muted = m
    else if (m && this.modo === 'voz') window.speechSynthesis?.cancel()
    this.aplicarVolume()
  }

  parar() {
    this.parado = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const f of this.fontes) { try { f.stop() } catch { /* já parou */ } }
    this.fontes = []
    if (this.relogio) { this.relogio.onaudioprocess = null; this.relogio.disconnect() }
    for (const d of [this.duckCurto, this.duckLongo]) d?.pause()
    for (const u of this.urlsDuck) URL.revokeObjectURL(u)
    this.urlsDuck = []
    this.ctx?.close().catch(() => {})
    this.ctx = null
    if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load() }
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    window.speechSynthesis?.cancel()
  }

  /** Reavalia o estado (chamado em timeupdate, ao voltar para o app e pelo tick da interface). */
  verificar(terminou = false) {
    if (this.parado) return
    const t = terminou ? this.crono.total : this.tempo()
    if (!this.concluidoAvisado && t >= this.crono.fimUltimaSerie) {
      this.concluidoAvisado = true
      this.ouv.onSeriesConcluidas()
    }
    if (!this.fimAvisado && (terminou || t >= this.crono.total)) {
      this.fimAvisado = true
      if (this.timer) clearInterval(this.timer)
      this.ouv.onFim()
    }
  }

  private tickVoz() {
    if (this.pausadoEm !== null || this.parado) return
    const t = this.tempo()
    const cues = this.crono.cues
    while (this.proximoCue < cues.length && cues[this.proximoCue].t <= t) {
      const cue = cues[this.proximoCue++]
      // só fala o cue se não estiver muito atrasado (ex.: aba suspensa)
      if (t - cue.t < 0.8 || cue.clip === 'fim') this.falar(cue.clip)
    }
    this.verificar()
  }

  private falar(clip: ClipKey) {
    const ss = window.speechSynthesis
    if (!ss || this.mudo) return
    const numero = /^[0-9]$/.test(clip)
    if (numero) ss.cancel()
    const u = new SpeechSynthesisUtterance(CLIP_TEXTO[clip])
    u.lang = 'pt-BR'
    u.rate = numero ? 1.15 : 1.0
    u.volume = this.volume
    ss.speak(u)
  }
}
