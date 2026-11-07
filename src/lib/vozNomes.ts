// Voz com o nome de cada exercício, para o treino completo anunciar o próximo ("Próximo exercício: Supino...").
// Os nomes do catálogo já vêm gravados no app (public/audio/nomes, gerados por scripts/gen-voice.mjs --nomes).
// Nomes fora do catálogo são gerados uma vez pelo servidor (/api/voz, mesma voz) e guardados no aparelho.
import { supabase } from './supabase'
import { chaveNome, prepararVoz, type Clipes } from './workoutAudio'

const CACHE = 'r2-voz-nomes-v1'
const memoria = new Map<string, Promise<Float32Array | null>>()

/** Mesmo nome de arquivo do script que grava as vozes. */
export const slugNome = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function baixar(nome: string): Promise<ArrayBuffer | null> {
  // 1) Gravado no app (nomes do catálogo)
  try {
    const r = await fetch(`/audio/nomes/${slugNome(nome)}.mp3`)
    if (r.ok && (r.headers.get('content-type') ?? '').includes('audio')) return await r.arrayBuffer()
  } catch { /* segue para o servidor */ }
  const chave = `/voz-nome/${encodeURIComponent(nome.toLowerCase())}`
  try {
    const salvo = await caches?.open(CACHE).then(c => c.match(chave))
    if (salvo) return await salvo.arrayBuffer()
  } catch { /* sem Cache Storage */ }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  const r = await fetch('/api/voz', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: nome }),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) return null
  const dados = await r.arrayBuffer()
  try { await caches?.open(CACHE).then(c => c.put(chave, new Response(dados.slice(0), { headers: { 'Content-Type': 'audio/wav' } }))) } catch { /* sem Cache Storage */ }
  return dados
}

function carregarNome(nome: string): Promise<Float32Array | null> {
  const k = nome.trim().toLowerCase()
  let p = memoria.get(k)
  if (!p) {
    p = baixar(nome.trim()).then(d => (d ? prepararVoz(d) : null)).then(v => (v?.length ? v : null)).catch(() => null)
    memoria.set(k, p)
    // falhou: tenta de novo numa próxima vez
    p.then(v => { if (!v) memoria.delete(k) })
  }
  return p
}

/** Clipes `nome:<exercício>` que já estão prontos (os que falharem ficam de fora; o aviso sai sem o nome). */
export async function carregarNomes(nomes: string[]): Promise<Clipes> {
  const unicos = [...new Set(nomes.map(n => n.trim()).filter(n => n && n.length <= 80))].slice(0, 20)
  const pares = await Promise.all(unicos.map(async n => [chaveNome(n), await carregarNome(n)] as const))
  return Object.fromEntries(pares.filter(([, v]) => v)) as Clipes
}
