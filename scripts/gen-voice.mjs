// Gera os clipes de voz (pt-BR) usados pelo contador de séries.
// Roda antes do build: grava public/audio/*.wav (sem compressão, 24 kHz, voz feminina).
// Se não houver chave da OpenAI ou a geração falhar, o build continua e o app usa a voz do navegador.
import { mkdir, writeFile, access } from 'node:fs/promises'

const CLIPES = {
  '5': 'Cinco!', '4': 'Quatro!', '3': 'Três!', '2': 'Dois!', '1': 'Um!',
  trabalho: 'Trabalho!', repouso: 'Repouso!',
  fim: 'Exercício concluído! Todas as séries finalizadas.',
}
const INSTRUCOES = 'Você é uma treinadora de academia brasileira. Fale em português do Brasil, com sotaque brasileiro, voz feminina firme, clara, enérgica e motivadora, sem gritar. Pronuncie cada palavra por inteiro, articulando bem a última sílaba (por exemplo: cin-co, qua-tro, três, dois, um). Diga apenas o texto, sem pausas no início nem no fim.'
// Voz feminina: "coral" no gpt-4o-mini-tts (aceita instruções de estilo); "nova" no tts-1-hd
const VOZ = { 'gpt-4o-mini-tts': 'coral', 'tts-1-hd': 'nova' }
const DIR = new URL('../public/audio/', import.meta.url)
const key = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY

async function existe(f) { try { await access(new URL(f, DIR)); return true } catch { return false } }

async function falar(texto, modelo) {
  // PCM cru (24 kHz, 16 bits, mono) e cabeçalho WAV montado aqui, com tamanhos corretos
  const body = { model: modelo, voice: VOZ[modelo], input: texto, response_format: 'pcm', speed: 1.0 }
  if (modelo.startsWith('gpt-4o')) body.instructions = INSTRUCOES
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${modelo}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return comoWav(Buffer.from(await r.arrayBuffer()))
}

function comoWav(pcm, sr = 24000) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24)
  h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

async function main() {
  await mkdir(DIR, { recursive: true })
  const faltando = []
  for (const k of Object.keys(CLIPES)) if (!(await existe(`${k}.wav`))) faltando.push(k)
  if (!faltando.length) { console.log('[voz] clipes já existem'); return }
  if (!key) { console.warn('[voz] sem OPENAI_API_KEY — o app usará a voz do navegador'); return }
  for (const modelo of ['gpt-4o-mini-tts', 'tts-1-hd']) {
    try {
      const audios = await Promise.all(faltando.map(k => falar(CLIPES[k], modelo)))
      await Promise.all(faltando.map((k, i) => writeFile(new URL(`${k}.wav`, DIR), audios[i])))
      console.log(`[voz] ${faltando.length} clipes gerados com ${modelo}`)
      return
    } catch (e) {
      console.warn('[voz] falhou:', e.message)
    }
  }
  console.warn('[voz] não foi possível gerar os clipes — o app usará a voz do navegador')
}

main().catch(e => console.warn('[voz] erro inesperado:', e?.message))
