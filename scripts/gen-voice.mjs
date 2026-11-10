// Gera as vozes (pt-BR) do contador de séries com a mesma voz de personal (OpenAI gpt-4o-mini-tts, "coral").
// Os arquivos ficam versionados em public/audio — o build só gera o que faltar, então a voz não muda
// a cada publicação.
//   node scripts/gen-voice.mjs              → falas fixas que faltarem (public/audio/<chave>.wav) e anúncios de série (public/audio/serie_*.mp3)
//   node scripts/gen-voice.mjs --nomes      → também os nomes do catálogo (public/audio/nomes/<nome>.mp3)
//   node scripts/gen-voice.mjs --refazer    → gera tudo de novo (troca de voz ou de estilo)
// Precisa de OPENAI_API_KEY. Atrás de proxy: NODE_USE_ENV_PROXY=1. Sem chave, o build continua.
import { mkdir, writeFile, access, readFile } from 'node:fs/promises'

const CLIPES = {
  '5': 'Cinco!', '4': 'Quatro!', '3': 'Três!', '2': 'Dois!', '1': 'Um!',
  trabalho: 'Trabalho!', repouso: 'Repouso!',
  fim: 'Exercício concluído! Todas as séries finalizadas.',
  // Treino completo: anúncio antes do nome do próximo exercício e aviso final
  proximo: 'Exercício finalizado! Próximo exercício:',
  treino_fim: 'Treino completo! Parabéns, todos os exercícios finalizados.',
}
// Anúncio da série depois da contagem regressiva (MP3, curtos): primeira, do meio pelo número, última; única se for 1 série
const NUM = ['', '', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
export const SERIES = {
  serie_unica: 'Série única!', serie_primeira: 'Primeira série!', serie_ultima: 'Última série!',
  ...Object.fromEntries(NUM.map((n, i) => [`serie_${i}`, `Série ${n}!`]).filter((_, i) => i >= 2)),
}
// Mesmo estilo da amostra escolhida (voz 1, coral)
export const INSTRUCOES = 'Você é uma personal trainer brasileira, nascida e criada em São Paulo, falando com seu aluno na academia. Fale em português do Brasil com sotaque paulistano natural, nunca com sotaque estrangeiro ou de Portugal. Voz feminina firme, clara, enérgica e motivadora, animada, sem gritar. Pronuncie cada palavra por inteiro, articulando bem a última sílaba.'
const MODELO = 'gpt-4o-mini-tts'
const VOZ = 'coral'
const DIR = new URL('../public/audio/', import.meta.url)
const DIR_NOMES = new URL('nomes/', DIR)
const key = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
const args = new Set(process.argv.slice(2))
const refazer = args.has('--refazer')

/** Mesmo nome de arquivo usado pelo app (src/lib/vozNomes.ts). */
export const slugNome = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function existe(u) { try { await access(u); return true } catch { return false } }

async function falar(texto, formato) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELO, voice: VOZ, input: texto, instructions: INSTRUCOES, response_format: formato }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return Buffer.from(await r.arrayBuffer())
}

function comoWav(pcm, sr = 24000) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24)
  h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

/** Roda em lotes para não estourar o limite da API. */
async function emLotes(itens, n, fn) {
  for (let i = 0; i < itens.length; i += n) await Promise.all(itens.slice(i, i + n).map(fn))
}

async function nomesDoCatalogo() {
  const src = await readFile(new URL('../src/data/exercicios.ts', import.meta.url), 'utf8')
  const corpo = src.slice(src.indexOf('const RAW'), src.indexOf('export const CATALOGO'))
  return [...corpo.matchAll(/^\s*\['([^']+)'/gm)].map(m => m[1])
}

async function main() {
  await mkdir(DIR, { recursive: true })
  const faltando = []
  for (const k of Object.keys(CLIPES)) if (refazer || !(await existe(new URL(`${k}.wav`, DIR)))) faltando.push(k)
  const series = []
  for (const k of Object.keys(SERIES)) if (refazer || !(await existe(new URL(`${k}.mp3`, DIR)))) series.push(k)
  let nomes = []
  if (args.has('--nomes')) {
    await mkdir(DIR_NOMES, { recursive: true })
    for (const n of await nomesDoCatalogo()) if (refazer || !(await existe(new URL(`${slugNome(n)}.mp3`, DIR_NOMES)))) nomes.push(n)
  }
  if (!faltando.length && !nomes.length && !series.length) { console.log('[voz] tudo pronto'); return }
  if (!key) { console.warn('[voz] sem OPENAI_API_KEY — faltam', faltando.length + nomes.length + series.length, 'vozes; o app usa a voz do navegador nelas'); return }
  let erros = 0
  await emLotes(faltando, 5, async k => {
    try { await writeFile(new URL(`${k}.wav`, DIR), comoWav(await falar(CLIPES[k], 'pcm'))) } catch (e) { erros++; console.warn('[voz]', k, e.message) }
  })
  await emLotes(series, 6, async k => {
    try { await writeFile(new URL(`${k}.mp3`, DIR), await falar(SERIES[k], 'mp3')) } catch (e) { erros++; console.warn('[voz]', k, e.message) }
  })
  await emLotes(nomes, 6, async n => {
    try { await writeFile(new URL(`${slugNome(n)}.mp3`, DIR_NOMES), await falar(`${n}.`, 'mp3')) } catch (e) { erros++; console.warn('[voz]', n, e.message) }
  })
  console.log(`[voz] ${faltando.length + nomes.length + series.length - erros} vozes geradas${erros ? `, ${erros} falharam` : ''}`)
}

main().catch(e => console.warn('[voz] erro inesperado:', e?.message))
