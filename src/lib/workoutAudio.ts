import { blobParaBase64, type ContadorNativo } from './nativo'
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

/** Clipes fixos gravados no build. Os nomes dos exercícios usam a chave `nome:<nome>`. */
export type ClipBase = '5' | '4' | '3' | '2' | '1' | 'trabalho' | 'repouso' | 'fim'
export type ClipKey = string
export const CLIP_KEYS: ClipBase[] = ['5', '4', '3', '2', '1', 'trabalho', 'repouso', 'fim']
/** Opcionais: se faltarem, o treino completo funciona sem eles. */
export const CLIP_EXTRAS = ['proximo', 'treino_fim'] as const
export const CLIP_TEXTO: Record<string, string> = {
  '5': 'Cinco', '4': 'Quatro', '3': 'Três', '2': 'Dois', '1': 'Um',
  trabalho: 'Trabalho!', repouso: 'Repouso!', fim: 'Exercício concluído! Todas as séries finalizadas.',
  proximo: 'Exercício finalizado! Próximo exercício:', treino_fim: 'Treino completo! Parabéns, todos os exercícios finalizados.',
}
// Anúncio da série depois da contagem regressiva (MP3 em /audio): primeira, do meio pelo número, última; única se for 1
const NUM_SERIE = ['', '', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
Object.assign(CLIP_TEXTO, { serie_unica: 'Série única!', serie_primeira: 'Primeira série!', serie_ultima: 'Última série!' },
  Object.fromEntries(NUM_SERIE.map((n, i) => [`serie_${i}`, `Série ${n}!`]).filter((_, i) => i >= 2)))
export const chaveSerie = (serie: number, total: number) =>
  total <= 1 ? 'serie_unica' : serie === 1 ? 'serie_primeira' : serie >= total ? 'serie_ultima' : `serie_${serie}`
export type Clipes = Record<string, Float32Array>
export const chaveNome = (nome: string) => `nome:${nome.trim()}`
export const textoDoClipe = (k: string) => (k.startsWith('nome:') ? k.slice(5) : CLIP_TEXTO[k] ?? k)

export type FaseTipo = 'countdown' | 'work' | 'rest_countdown' | 'rest' | 'final'
export interface Cue { t: number; clip: ClipKey }
/** `exercicio`: posição na sequência. `proximo`: no descanso de transição, o exercício que vem a seguir. */
export interface Fase { tipo: FaseTipo; serie: number; exercicio: number; proximo?: number; inicio: number; fim: number; cues: Cue[] }
/** `marcos[i]`: instante em que termina a última série do exercício i. */
export interface Cronograma { fases: Fase[]; cues: Cue[]; total: number; fimUltimaSerie: number; marcos: number[]; exercicios: number }
export interface ConfigCrono {
  series: number; execSeg: number; descansoSeg: number; nome?: string
  /** Tempo de cada série / do descanso depois de cada série, quando mudam no meio do treino (ajuste no contador) */
  execPorSerie?: number[]; descPorSerie?: number[]
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Monta a linha do tempo completa de um exercício ou de uma sequência (treino completo).
 *  `dur` = duração real de cada clipe (s), quando conhecida; `tem` diz se um clipe opcional existe.
 *  Entre dois exercícios: ao fim da última série anuncia o próximo e conta o descanso do exercício
 *  que terminou; depois a contagem regressiva começa o próximo sozinho. */
export function montarCronograma(cfg: ConfigCrono | ConfigCrono[], dur: Partial<Record<ClipKey, number>> = {},
  tem: (k: ClipKey) => boolean = () => true): Cronograma {
  const lista = Array.isArray(cfg) ? cfg : [cfg]
  const maxNum = Math.max(...(['5', '4', '3', '2', '1'] as ClipKey[]).map(k => dur[k] ?? 0.7))
  const passo = Math.max(1, r3(maxNum + 0.12)) // nunca sobrepõe dois números
  const fases: Fase[] = []
  const cues: Cue[] = []
  const marcos: number[] = []
  let t = 0

  const contagem = (tipo: 'countdown' | 'rest_countdown', serie: number, exercicio: number, comando: ClipKey) => {
    const inicio = t
    const fc: Cue[] = (['5', '4', '3', '2', '1'] as ClipKey[]).map((clip, i) => ({ t: r3(inicio + i * passo), clip }))
    const tCmd = r3(inicio + 5 * passo)
    fc.push({ t: tCmd, clip: comando })
    const fim = r3(tCmd + Math.max(0.9, (dur[comando] ?? 0.8) + 0.15))
    fases.push({ tipo, serie, exercicio, inicio, fim, cues: fc })
    cues.push(...fc)
    t = fim
  }

  lista.forEach((c, e) => {
    const series = Math.max(1, Math.round(c.series))
    const execDe = (s: number) => Math.max(1, c.execPorSerie?.[s - 1] ?? c.execSeg)
    const descDe = (s: number) => Math.max(0, c.descPorSerie?.[s - 1] ?? c.descansoSeg)
    for (let s = 1; s <= series; s++) {
      const exec = execDe(s), desc = descDe(s)
      // Depois do 5-4-3-2-1 a voz diz a série ("Primeira série!", "Série dois!", "Última série!"); sem o clipe, "Trabalho!"
      const anuncio = chaveSerie(s, series)
      contagem('countdown', s, e, tem(anuncio) ? anuncio : 'trabalho')
      fases.push({ tipo: 'work', serie: s, exercicio: e, inicio: t, fim: r3(t + exec), cues: [] })
      t = r3(t + exec)
      if (s < series) {
        contagem('rest_countdown', s, e, 'repouso')
        fases.push({ tipo: 'rest', serie: s, exercicio: e, inicio: t, fim: r3(t + desc), cues: [] })
        t = r3(t + desc)
      }
    }
    marcos.push(t)
    if (e < lista.length - 1) {
      const inicio = t
      const prox = lista[e + 1]
      const fc: Cue[] = []
      let ta = r3(t + 0.3)
      for (const k of ['proximo', prox.nome?.trim() ? chaveNome(prox.nome) : null]) {
        if (!k || !tem(k)) continue
        fc.push({ t: ta, clip: k })
        ta = r3(ta + (dur[k] ?? 2.4) + 0.25)
      }
      const fim = r3(Math.max(inicio + descDe(series), ta + 1))
      fases.push({ tipo: 'rest', serie: series, exercicio: e, proximo: e + 1, inicio, fim, cues: fc })
      cues.push(...fc)
      t = fim
    }
  })
  const fimUltimaSerie = t
  const clipFim = lista.length > 1 && tem('treino_fim') ? 'treino_fim' : 'fim'
  const cueFim: Cue = { t: r3(t + 0.25), clip: clipFim }
  cues.push(cueFim)
  const total = r3(cueFim.t + (dur[clipFim] ?? 3.5) + 0.6)
  const ultimo = lista.length - 1
  fases.push({ tipo: 'final', serie: Math.max(1, Math.round(lista[ultimo].series)), exercicio: ultimo, inicio: t, fim: total, cues: [cueFim] })
  return { fases, cues, total, fimUltimaSerie, marcos, exercicios: lista.length }
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

export function renderizarFaixa(c: Cronograma, clips: Clipes, sr: number): Blob {
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
let cacheClipes: Promise<Clipes | null> | null = null

export function decodificar(dados: ArrayBuffer): Promise<AudioBuffer> {
  const W = window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }
  const Ctor = W.OfflineAudioContext ?? W.webkitOfflineAudioContext
  if (!Ctor) return Promise.reject(new Error('Sem OfflineAudioContext'))
  const ctx = new Ctor(1, TAXA, TAXA)
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(dados, res, rej) as unknown as Promise<AudioBuffer> | undefined
    p?.then?.(res, rej)
  })
}

/** Decodifica, apara o silêncio e realça a voz de um WAV/MP3. */
export async function prepararVoz(dados: ArrayBuffer): Promise<Float32Array> {
  const ab = await decodificar(dados)
  return maximizar(aparar(ab.getChannelData(0), ab.sampleRate), ab.sampleRate)
}

export function carregarClipes(): Promise<Clipes | null> {
  if (cacheClipes) return cacheClipes
  cacheClipes = (async () => {
    try {
      const baixar = async (k: string) => {
        const r = await fetch(`/audio/${k}.wav`)
        if (!r.ok) throw new Error(`clip ${k}: ${r.status}`)
        const dados = await prepararVoz(await r.arrayBuffer())
        if (!dados.length) throw new Error(`clip ${k} vazio`)
        return [k, dados] as const
      }
      const [pares, extras] = await Promise.all([
        Promise.all(CLIP_KEYS.map(baixar)),
        Promise.all(CLIP_EXTRAS.map(k => baixar(k).catch(() => null))),
      ])
      return Object.fromEntries([...pares, ...extras.filter(x => x !== null)]) as Clipes
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

const cacheSeries = new Map<string, Promise<Float32Array | null>>()
/** Clipes de anúncio de série que um treino precisa (`totais` = nº de séries de cada exercício). Os que falharem ficam de fora (vira "Trabalho!"). */
export async function carregarSeries(totais: number[]): Promise<Clipes> {
  const chaves = new Set<string>()
  for (const n of totais) for (let s = 1; s <= Math.min(20, Math.max(1, Math.round(n))); s++) chaves.add(chaveSerie(s, n))
  const pares = await Promise.all([...chaves].map(async k => {
    let p = cacheSeries.get(k)
    if (!p) {
      p = fetch(`/audio/${k}.mp3`).then(r => (r.ok ? r.arrayBuffer() : null)).then(d => (d ? prepararVoz(d) : null)).catch(() => null)
      cacheSeries.set(k, p)
      p.then(v => { if (!v?.length) cacheSeries.delete(k) })
    }
    return [k, await p] as const
  }))
  return Object.fromEntries(pares.filter(([, v]) => v && v.length)) as Clipes
}

export function duracoes(clips: Clipes): Record<ClipKey, number> {
  return Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, v.length / TAXA]))
}

/** Um clipe de voz como WAV (PCM 16 bits mono), para tocar num <audio> curto. */
export function wavDoClipe(dados: Float32Array, sr = TAXA): Blob {
  const n = dados.length
  const buf = new ArrayBuffer(44 + n * 2)
  const dv = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, n * 2, true)
  const pcm = new Int16Array(buf, 44, n)
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, dados[i])); pcm[i] = Math.round(v * 32767) }
  return new Blob([buf], { type: 'audio/wav' })
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
  onExercicioConcluido?: (indice: number) => void // terminou a última série do exercício `indice` da sequência
  onSerieConcluida?: (exercicio: number, serie: number) => void // terminou o tempo de trabalho de uma série
}

type Ctx = AudioContext

function definirSessaoAudio(tipo: 'ambient' | 'playback') {
  // Safari 16.4+: "ambient" mistura com outros apps; "playback" segue em segundo plano
  const sessao = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (sessao) { try { sessao.type = tipo } catch { /* não suportado */ } }
}

export interface AvisoFase { t: number; titulo: string; texto: string; dur: number }
const mmssAviso = (seg: number) => `${Math.floor(seg / 60)}:${String(Math.round(seg % 60)).padStart(2, '0')}`

/**
 * Um aviso por fase (TRABALHO, DESCANSO, fim) para a notificação do app: vibra e aparece no relógio
 * pareado (smartwatch e pulseiras repassam as notificações do celular).
 */
export function avisosDasFases(crono: Cronograma, lista: ConfigCrono[]): AvisoFase[] {
  const avisos: AvisoFase[] = []
  for (const f of crono.fases) {
    const ex = lista[f.exercicio]
    const series = Math.max(1, Math.round(ex?.series ?? 1))
    const dur = r3(f.fim - f.inicio)
    const nome = ex?.nome?.trim() || 'Exercício'
    if (f.tipo === 'work') {
      avisos.push({ t: f.inicio, dur, titulo: `💪 TRABALHO · série ${f.serie} de ${series}`, texto: `${nome} · ${mmssAviso(dur)}` })
    } else if (f.tipo === 'rest') {
      const prox = f.proximo != null ? lista[f.proximo]?.nome?.trim() : null
      avisos.push({ t: f.inicio, dur, titulo: `😮‍💨 DESCANSO · ${mmssAviso(dur)}`, texto: prox ? `Próximo: ${prox}` : `Próxima: série ${f.serie + 1} de ${series}` })
    } else if (f.tipo === 'final') {
      avisos.push({ t: f.inicio, dur: 8, titulo: lista.length > 1 ? '🏆 Treino completo!' : '✅ Séries finalizadas', texto: lista.length > 1 ? `${lista.length} exercícios` : nome })
    }
  }
  return avisos
}

export class TreinoPlayer {
  /** 'nativo': app Android instalado, as falas tocam fora do navegador (tela bloqueada, por cima da música) */
  readonly modo: 'mix' | 'audio' | 'voz' | 'nativo'
  private nativo: ContadorNativo | null = null
  crono: Cronograma
  private cfgs: ConfigCrono[]
  private durClipes: Record<string, number>
  private temClipe: (k: string) => boolean
  private ouv: Ouvintes
  private concluidoAvisado = false
  private marcosAvisados = 0
  private seriesAvisadas = 0
  private fimSeries: { t: number; exercicio: number; serie: number }[] = []
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
  private clips: Clipes | null = null
  private ctx: Ctx | null = null
  private ganho: GainNode | null = null
  private entrada: AudioNode | null = null
  private buffers: Record<string, AudioBuffer> = {}
  private fontes: AudioBufferSourceNode[] = []
  private t0Ctx = 0
  private pausadoMix = false
  // Android: durante cada aviso toca um áudio curto e silencioso (< 5 s). O Chrome pede ao
  // sistema um "foco de áudio passageiro", e o Android abaixa a música por um instante,
  // como no GPS. O relógio vem do próprio Web Audio (funciona em segundo plano).
  private abaixarMusica = false
  /** Android: cada fala toca num <audio> curto próprio. O sistema abaixa a música só enquanto ela
   *  toca e devolve o volume quando acaba (o Web Audio ligado seguraria a música baixa o treino todo). */
  private vozes: Record<string, HTMLAudioElement> = {}
  private vozTocando: HTMLAudioElement | null = null
  private urlsDuck: string[] = []
  private relogio: ScriptProcessorNode | null = null
  private proximoDuck = 0
  /** App fora da frente ou tela bloqueada: as falas passam a ser agendadas direto no Web Audio. */
  private emSegundoPlano = false
  private manterVivo: AudioBufferSourceNode | null = null
  private inicioFonte = new WeakMap<AudioBufferSourceNode, number>()
  // modo voz
  private t0 = 0
  private pausadoEm: number | null = null
  private acumuladoPausa = 0
  private proximoCue = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(cfg: ConfigCrono | ConfigCrono[], clips: Clipes | null, ouv: Ouvintes, modoSom: ModoSom = 'musica',
    opcoes: { abaixarMusica?: boolean; nativo?: ContadorNativo | null; titulo?: string; avisosRelogio?: boolean } = {}) {
    this.ouv = ouv
    this.abaixarMusica = !!opcoes.abaixarMusica
    this.modo = !clips ? 'voz' : opcoes.nativo ? 'nativo' : modoSom === 'musica' ? 'mix' : 'audio'
    if (this.modo === 'nativo') {
      this.nativo = opcoes.nativo!; this.clips = clips; this.titulo = opcoes.titulo ?? 'Contador'
    }
    // Sem as vozes gravadas, o navegador fala qualquer texto; com elas, só entram os clipes que existem
    this.cfgs = (Array.isArray(cfg) ? cfg : [cfg]).map(c => ({ ...c }))
    this.durClipes = clips ? duracoes(clips) : {}
    this.temClipe = clips ? k => !!clips[k]?.length : () => true
    this.crono = montarCronograma(this.cfgs, this.durClipes, this.temClipe)
    if (this.modo === 'nativo' && opcoes.avisosRelogio !== false) this.avisos = avisosDasFases(this.crono, Array.isArray(cfg) ? cfg : [cfg])
    if (this.modo === 'mix' || this.modo === 'audio') this.clips = clips
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

  /**
   * Ajuste no meio do treino: novo tempo de trabalho e/ou de descanso do exercício `exIdx`, valendo para as
   * fases dele que ainda não começaram (a que está rodando continua como estava). Refaz a linha do tempo e
   * reagenda as falas a partir de agora; o passado não muda, então o ponto atual continua o mesmo.
   */
  atualizarTempos(exIdx: number, novo: { exec?: number; desc?: number }) {
    const c = this.cfgs[exIdx]
    if (!c || this.parado) return
    const t = this.tempo()
    const n = Math.max(1, Math.round(c.series))
    const exec = Array.from({ length: n }, (_, k) => c.execPorSerie?.[k] ?? c.execSeg)
    const desc = Array.from({ length: n }, (_, k) => c.descPorSerie?.[k] ?? c.descansoSeg)
    const futura = (tipo: FaseTipo, serie: number) => {
      const f = this.crono.fases.find(x => x.tipo === tipo && x.exercicio === exIdx && x.serie === serie)
      return !!f && f.inicio > t + 0.05
    }
    for (let k = 1; k <= n; k++) {
      if (novo.exec != null && futura('work', k)) exec[k - 1] = Math.max(1, Math.round(novo.exec))
      if (novo.desc != null && futura('rest', k)) desc[k - 1] = Math.max(0, Math.round(novo.desc))
    }
    this.cfgs[exIdx] = { ...c, execPorSerie: exec, descPorSerie: desc }
    this.crono = montarCronograma(this.cfgs, this.durClipes, this.temClipe)
    this.fimSeries = []
    if (this.modo === 'nativo' && this.avisos.length) this.avisos = avisosDasFases(this.crono, this.cfgs)
    this.reagendar(t)
  }

  /** Depois de refazer a linha do tempo, toca as falas futuras no horário novo (sem cortar a que está tocando). */
  private reagendar(t: number) {
    const cues = this.crono.cues
    const prox = (() => { const i = cues.findIndex(c => c.t > t + 0.02); return i < 0 ? cues.length : i })()
    if (this.modo === 'voz') { this.proximoCue = prox; return }
    if (this.modo === 'nativo') {
      if (this.pausadoEm === null) this.tocarNativo(t, c => c.t > t + 0.05).catch(() => {})
      return
    }
    if (this.modo === 'mix' && this.ctx) {
      const ctx = this.ctx
      const agora = ctx.currentTime
      const ficam = this.fontes.filter(f => (this.inicioFonte.get(f) ?? Infinity) <= agora + 0.02)
      for (const f of this.fontes) if (!ficam.includes(f)) { try { f.stop() } catch { /* já parou */ } }
      this.fontes = ficam
      this.proximoDuck = prox
      if (this.abaixarMusica && !this.emSegundoPlano) return // Android: as falas tocam em <audio> pelo relógio
      for (let i = prox; i < cues.length; i++) {
        const b = this.buffers[cues[i].clip]
        if (!b) continue
        const src = ctx.createBufferSource()
        src.buffer = b
        src.connect(this.entrada ?? this.ganho!)
        const quando = this.t0Ctx + cues[i].t
        src.start(Math.max(agora, quando))
        this.inicioFonte.set(src, quando)
        this.fontes.push(src)
      }
      return
    }
    if (this.modo === 'audio' && this.audio && this.clips) {
      // Faixa contínua: renderiza de novo e continua do mesmo ponto
      const a = this.audio
      const tocando = !a.paused
      const velha = this.url
      this.url = URL.createObjectURL(renderizarFaixa(this.crono, this.clips, TAXA))
      this.pausaPedida = tocando
      a.src = this.url
      const seguir = () => { try { a.currentTime = t } catch { /* ainda carregando */ } if (tocando) a.play().catch(() => { this.interrompido = true }) }
      a.addEventListener('loadedmetadata', seguir, { once: true })
      a.load()
      if (velha) URL.revokeObjectURL(velha)
    }
  }

  /** Deve ser chamado dentro do gesto do usuário (toque em "Iniciar"). */
  iniciar(): Promise<void> {
    if (this.modo === 'mix') return this.iniciarMix()
    if (this.modo === 'nativo') return this.iniciarNativo()
    if (this.audio) { definirSessaoAudio('playback'); return this.tocarDe(0) }
    this.t0 = Date.now()
    this.timer = setInterval(() => this.tickVoz(), 80)
    this.tickVoz()
    return Promise.resolve()
  }

  private titulo = 'Contador'
  private avisos: AvisoFase[] = []
  /** App Android: manda só os clipes usados e o cronograma para o contador nativo; o relógio da tela é o de parede. */
  private async iniciarNativo() {
    const n = this.nativo!
    const usados = [...new Set(this.crono.cues.map(c => c.clip))].filter(k => this.clips?.[k]?.length)
    const clipes: Record<string, { wav: string; dur: number }> = {}
    for (const k of usados) {
      const d = this.clips![k]
      clipes[k] = { wav: await blobParaBase64(wavDoClipe(d)), dur: d.length / TAXA }
    }
    await n.preparar({ clipes })
    this.t0 = Date.now()
    this.baseParede = this.t0
    await this.tocarNativo(0)
  }

  private tocarNativo(desde: number, filtro: (c: Cue) => boolean = () => true) {
    return this.nativo!.tocar({
      cues: this.crono.cues.filter(c => this.clips?.[c.clip]?.length && filtro(c)).map(c => ({ t: c.t, clip: c.clip })),
      desde, volume: this.volume, mudo: this.mudo, titulo: this.titulo,
      avisos: this.avisos.filter(a => filtro({ t: a.t, clip: '' })),
    })
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
    for (const [k, dados] of Object.entries(this.clips)) {
      if (!dados.length) continue
      const b = ctx.createBuffer(1, dados.length, TAXA)
      b.getChannelData(0).set(dados)
      this.buffers[k] = b
    }
    ctx.addEventListener('statechange', () => {
      if (this.parado) return
      if (ctx.state !== 'running' && !this.pausaPedida && !this.pausadoMix) this.interrompido = true
    })
    if (this.abaixarMusica) this.prepararAbaixar(ctx)
    this.ligarManterVivo(ctx)
    await ctx.resume()
    this.agendarDe(0)
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.segundoPlano(true)
  }

  /**
   * Um chiado muito baixo (~ -94 dBFS), inaudível e abaixo do limiar em que o navegador considera "tocando som"
   * (não pede foco de áudio nem mexe na música), mas diferente de silêncio absoluto: assim o sistema não
   * suspende o áudio do contador quando o app sai da frente ou a tela bloqueia.
   */
  private ligarManterVivo(ctx: Ctx) {
    try {
      const n = Math.round(ctx.sampleRate * 2)
      const b = ctx.createBuffer(1, n, ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 2e-5
      const s = ctx.createBufferSource()
      s.buffer = b; s.loop = true
      s.connect(ctx.destination)
      s.start()
      this.manterVivo = s
    } catch { /* sem isso o contador ainda funciona com o app na frente */ }
  }

  /**
   * Chamado quando o app sai da frente / a tela bloqueia (true) e quando volta (false).
   * Em segundo plano o navegador pode congelar a página, então as falas que o <audio> tocaria (Android)
   * passam a ser agendadas no próprio Web Audio, que segue tocando sozinho no tempo certo.
   */
  segundoPlano(oculto: boolean) {
    if (this.modo !== 'mix' || !this.abaixarMusica || !this.ctx || this.parado) return
    const ctx = this.ctx
    this.emSegundoPlano = oculto
    const agora = ctx.currentTime
    // A fala que já começou vai até o fim (não corta "Próximo exercício" ao sair ou voltar); só as futuras são refeitas
    const ficam = this.fontes.filter(f => (this.inicioFonte.get(f) ?? Infinity) <= agora + 0.02)
    for (const f of this.fontes) if (!ficam.includes(f)) { try { f.stop() } catch { /* já parou */ } }
    this.fontes = ficam
    const t = agora - this.t0Ctx
    const cues = this.crono.cues
    if (!oculto) {
      // De volta: o <audio> reassume a partir do próximo aviso que ainda não começou
      this.proximoDuck = cues.findIndex(c => c.t > t + 0.02)
      if (this.proximoDuck < 0) this.proximoDuck = cues.length
      return
    }
    // Indo para segundo plano: a fala que o <audio> está tocando termina sozinha; as que faltam vão para o Web Audio
    for (let i = this.proximoDuck; i < cues.length; i++) {
      const cue = cues[i]
      const b = this.buffers[cue.clip]
      if (!b || cue.t < t - 0.5) continue
      const src = ctx.createBufferSource()
      src.buffer = b
      src.connect(this.entrada ?? this.ganho!)
      const quando = Math.max(agora, this.t0Ctx + cue.t)
      src.start(quando)
      this.inicioFonte.set(src, quando)
      this.fontes.push(src)
    }
    this.proximoDuck = cues.length
  }

  private prepararAbaixar(ctx: Ctx) {
    for (const [k, dados] of Object.entries(this.clips ?? {})) {
      if (!dados.length) continue
      const url = URL.createObjectURL(wavDoClipe(dados))
      this.urlsDuck.push(url)
      const a = new Audio(url)
      a.preload = 'auto'
      a.setAttribute('playsinline', '')
      this.vozes[k] = a
    }
    this.aplicarVolume()
    // Batida do relógio de áudio: dispara no tempo certo mesmo com a tela bloqueada
    const relogio = ctx.createScriptProcessor(2048, 1, 1)
    const mudo = ctx.createGain()
    mudo.gain.value = 0
    relogio.connect(mudo); mudo.connect(ctx.destination)
    relogio.onaudioprocess = () => this.marcarAbaixar()
    this.relogio = relogio
  }

  /** Android: toca cada fala no seu <audio> na hora certa (o relógio é o do Web Audio, que segue com a tela bloqueada). */
  private marcarAbaixar() {
    if (!this.ctx || this.parado || this.pausadoMix || this.interrompido || !this.abaixarMusica || this.emSegundoPlano) return
    const t = this.ctx.currentTime - this.t0Ctx
    const cues = this.crono.cues
    while (this.proximoDuck < cues.length && cues[this.proximoDuck].t - 0.03 <= t) {
      const cue = cues[this.proximoDuck++]
      const final = cue.clip === 'fim' || cue.clip === 'treino_fim'
      if (t > cue.t + 0.5 && !final) continue
      const el = this.vozes[cue.clip]
      if (!el) continue
      try { el.currentTime = 0 } catch { /* ainda carregando */ }
      this.vozTocando = el
      el.play().catch(() => {})
    }
  }

  private soltarMusica() {
    const d = this.vozTocando
    this.vozTocando = null
    if (!d) return
    d.pause()
    try { d.currentTime = 0 } catch { /* ainda carregando */ }
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
      if (this.abaixarMusica && !this.emSegundoPlano) break // Android: as falas tocam em <audio> (marcarAbaixar)
      if (cue.t < pos - 0.05) continue
      const b = this.buffers[cue.clip]
      if (!b) continue
      const src = ctx.createBufferSource()
      src.buffer = b
      src.connect(this.entrada ?? this.ganho!)
      src.start(this.t0Ctx + cue.t)
      this.inicioFonte.set(src, this.t0Ctx + cue.t)
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
    if (this.modo === 'nativo') return this.pausadoEm !== null
    return this.audio ? this.audio.paused && !this.audio.ended && !this.interrompido : this.pausadoEm !== null
  }

  pausar() {
    if (this.modo === 'nativo') {
      if (this.pausadoEm === null) { this.pausadoEm = Date.now(); this.nativo?.pausar().catch(() => {}) }
      return
    }
    if (this.modo === 'mix') {
      if (!this.ctx || this.pausadoMix) return
      this.pausadoMix = true
      this.soltarMusica()
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
    if (this.modo === 'nativo') {
      if (this.pausadoEm === null) return
      this.acumuladoPausa += Date.now() - this.pausadoEm
      this.pausadoEm = null
      return this.tocarNativo(this.tempo())
    }
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
    if (this.nativo) this.nativo.volume({ volume: this.volume, mudo: this.mudo }).catch(() => {})
    if (this.ganho) this.ganho.gain.value = this.mudo ? 0 : this.volume
    for (const v of Object.values(this.vozes)) { v.volume = this.volume; v.muted = this.mudo }
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
    if (this.nativo && !this.parado) this.nativo.parar().catch(() => {})
    this.parado = true
    this.soltarMusica()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const f of this.fontes) { try { f.stop() } catch { /* já parou */ } }
    this.fontes = []
    if (this.relogio) { this.relogio.onaudioprocess = null; this.relogio.disconnect() }
    try { this.manterVivo?.stop() } catch { /* já parou */ }
    this.manterVivo = null
    for (const v of Object.values(this.vozes)) v.pause()
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
    if (!this.fimSeries.length) this.fimSeries = this.crono.fases.filter(f => f.tipo === 'work').map(f => ({ t: f.fim, exercicio: f.exercicio, serie: f.serie }))
    while (this.seriesAvisadas < this.fimSeries.length && t >= this.fimSeries[this.seriesAvisadas].t) {
      const f = this.fimSeries[this.seriesAvisadas++]
      this.ouv.onSerieConcluida?.(f.exercicio, f.serie)
    }
    const marcos = this.crono.marcos
    while (this.marcosAvisados < marcos.length && t >= marcos[this.marcosAvisados]) {
      this.ouv.onExercicioConcluido?.(this.marcosAvisados++)
    }
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
      const longo = !/^[0-9]$/.test(cue.clip) && cue.clip !== 'trabalho' && cue.clip !== 'repouso'
      if (t - cue.t < (longo ? 3 : 0.8) || cue.clip === 'fim' || cue.clip === 'treino_fim') this.falar(cue.clip)
    }
    this.verificar()
  }

  private falar(clip: ClipKey) {
    const ss = window.speechSynthesis
    if (!ss || this.mudo) return
    const numero = /^[0-9]$/.test(clip)
    if (numero) ss.cancel()
    const u = new SpeechSynthesisUtterance(textoDoClipe(clip))
    u.lang = 'pt-BR'
    u.rate = numero ? 1.15 : 1.0
    u.volume = this.volume
    ss.speak(u)
  }
}
