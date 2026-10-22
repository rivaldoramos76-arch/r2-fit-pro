// Motor do contador de séries.
//
// Estratégia para funcionar em segundo plano e com a tela bloqueada:
// todo o exercício (contagens, "Trabalho!", "Repouso!", silêncio dos cronômetros e o
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
  trabalho: 'Trabalho!', repouso: 'Repouso!', fim: 'Treino concluído! Todas as séries finalizadas.',
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
  let a = 0, b = s.length - 1
  while (a < s.length && Math.abs(s[a]) < limiar) a++
  while (b > a && Math.abs(s[b]) < limiar) b--
  if (a >= b) return new Float32Array(0)
  const pad = Math.round(sr * 0.01)
  const out = s.slice(Math.max(0, a - pad), Math.min(s.length, b + pad * 4))
  let pico = 0
  for (const v of out) pico = Math.max(pico, Math.abs(v))
  if (pico > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / pico) * 0.92
  return out
}

// --- Carregamento das vozes ---

export const TAXA = 16000
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
        const r = await fetch(`/audio/${k}.mp3`)
        if (!r.ok) throw new Error(`clip ${k}: ${r.status}`)
        const ab = await decodificar(await r.arrayBuffer())
        const dados = aparar(ab.getChannelData(0), ab.sampleRate)
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

// --- Player ---

export interface Ouvintes {
  onSeriesConcluidas: () => void // todas as séries terminaram (antes do aviso final)
  onFim: () => void // aviso final terminou
}

export class TreinoPlayer {
  readonly modo: 'audio' | 'voz'
  readonly crono: Cronograma
  private audio: HTMLAudioElement | null = null
  private url: string | null = null
  private ouv: Ouvintes
  private concluidoAvisado = false
  private fimAvisado = false
  private parado = false
  // modo voz
  private t0 = 0
  private pausadoEm: number | null = null
  private acumuladoPausa = 0
  private proximoCue = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private volume = 1
  private mudo = false

  constructor(cfg: ConfigCrono, clips: Record<ClipKey, Float32Array> | null, ouv: Ouvintes) {
    this.ouv = ouv
    this.modo = clips ? 'audio' : 'voz'
    this.crono = montarCronograma(cfg, clips ? duracoes(clips) : {})
    if (clips) {
      const blob = renderizarFaixa(this.crono, clips, TAXA)
      this.url = URL.createObjectURL(blob)
      const a = new Audio()
      a.preload = 'auto'
      a.src = this.url
      a.setAttribute('playsinline', '')
      a.addEventListener('timeupdate', () => this.verificar())
      a.addEventListener('ended', () => this.verificar(true))
      this.audio = a
    }
  }

  /** Deve ser chamado dentro do gesto do usuário (toque em "Iniciar"). */
  iniciar(): Promise<void> {
    if (this.audio) return this.audio.play()
    this.t0 = performance.now()
    this.timer = setInterval(() => this.tickVoz(), 80)
    this.tickVoz()
    return Promise.resolve()
  }

  tempo(): number {
    if (this.audio) return this.audio.ended ? this.crono.total : this.audio.currentTime
    if (!this.t0) return 0
    const agora = this.pausadoEm ?? performance.now()
    return (agora - this.t0 - this.acumuladoPausa) / 1000
  }

  get pausado(): boolean {
    return this.audio ? this.audio.paused && !this.audio.ended : this.pausadoEm !== null
  }

  pausar() {
    if (this.audio) { this.audio.pause(); return }
    if (this.pausadoEm === null) { this.pausadoEm = performance.now(); window.speechSynthesis?.pause() }
  }

  retomar(): Promise<void> {
    if (this.audio) return this.audio.play()
    if (this.pausadoEm !== null) {
      this.acumuladoPausa += performance.now() - this.pausadoEm
      this.pausadoEm = null
      window.speechSynthesis?.resume()
    }
    return Promise.resolve()
  }

  setVolume(v: number) {
    this.volume = v
    if (this.audio) this.audio.volume = v
  }

  setMudo(m: boolean) {
    this.mudo = m
    if (this.audio) this.audio.muted = m
    else if (m) window.speechSynthesis?.cancel()
  }

  parar() {
    this.parado = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
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
