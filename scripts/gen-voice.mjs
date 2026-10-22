// Gera os clipes de voz (pt-BR) usados pelo contador de séries.
// Roda antes do build: grava public/audio/*.mp3. Se não houver chave da OpenAI
// ou a geração falhar, o build continua e o app usa a voz do navegador.
import { mkdir, writeFile, access } from 'node:fs/promises'

const CLIPES = {
  '5': 'Cinco!', '4': 'Quatro!', '3': 'Três!', '2': 'Dois!', '1': 'Um!',
  trabalho: 'Trabalho!', repouso: 'Repouso!',
  fim: 'Treino concluído! Todas as séries finalizadas.',
}
const INSTRUCOES = 'Você é um treinador de academia brasileiro. Fale em português do Brasil, com sotaque brasileiro, voz firme, clara e enérgica. Diga apenas o texto, sem pausas no início.'
const DIR = new URL('../public/audio/', import.meta.url)
const key = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY

async function existe(f) { try { await access(new URL(f, DIR)); return true } catch { return false } }

async function falar(texto, modelo) {
  const body = { model: modelo, voice: 'onyx', input: texto, response_format: 'mp3', speed: 1.0 }
  if (modelo.startsWith('gpt-4o')) body.instructions = INSTRUCOES
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${modelo}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return Buffer.from(await r.arrayBuffer())
}

async function main() {
  await mkdir(DIR, { recursive: true })
  const faltando = []
  for (const k of Object.keys(CLIPES)) if (!(await existe(`${k}.mp3`))) faltando.push(k)
  if (!faltando.length) { console.log('[voz] clipes já existem'); return }
  if (!key) { console.warn('[voz] sem OPENAI_API_KEY — o app usará a voz do navegador'); return }
  for (const modelo of ['gpt-4o-mini-tts', 'tts-1-hd']) {
    try {
      const audios = await Promise.all(faltando.map(k => falar(CLIPES[k], modelo)))
      await Promise.all(faltando.map((k, i) => writeFile(new URL(`${k}.mp3`, DIR), audios[i])))
      console.log(`[voz] ${faltando.length} clipes gerados com ${modelo}`)
      return
    } catch (e) {
      console.warn('[voz] falhou:', e.message)
    }
  }
  console.warn('[voz] não foi possível gerar os clipes — o app usará a voz do navegador')
}

main().catch(e => console.warn('[voz] erro inesperado:', e?.message))
