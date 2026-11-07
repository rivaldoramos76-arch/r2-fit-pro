// Vercel Function: voz com o nome de um exercício, para o treino completo anunciar o próximo.
// Mesma voz dos avisos do contador (scripts/gen-voice.mjs). Exige sessão válida e Premium.
// O app guarda o áudio no aparelho, então cada nome é gerado uma única vez por pessoa.

const INSTRUCOES = 'Você é uma treinadora de academia brasileira. Fale em português do Brasil, com sotaque brasileiro, voz feminina firme, clara, enérgica e motivadora, sem gritar. É o nome de um exercício de musculação: pronuncie com clareza, sem pausas no início nem no fim. Diga apenas o texto.'
const VOZ = { 'gpt-4o-mini-tts': 'coral', 'tts-1-hd': 'nova' }

const erro = (status, mensagem) =>
  new Response(JSON.stringify({ erro: mensagem }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

function comoWav(pcm, sr = 24000) {
  const h = new DataView(new ArrayBuffer(44))
  const w = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVEfmt ')
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, sr, true)
  h.setUint32(28, sr * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true)
  w(36, 'data'); h.setUint32(40, pcm.byteLength, true)
  const out = new Uint8Array(44 + pcm.byteLength)
  out.set(new Uint8Array(h.buffer), 0); out.set(new Uint8Array(pcm), 44)
  return out
}

export async function POST(request) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
  if (!supabaseUrl || !anonKey || !openaiKey) return erro(503, 'Voz não configurada.')

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return erro(401, 'Faça login.')
  let corpo
  try { corpo = JSON.parse((await request.text()).slice(0, 2000)) } catch { return erro(400, 'Requisição inválida.') }
  const texto = typeof corpo?.texto === 'string' ? corpo.texto.trim().replace(/\s+/g, ' ') : ''
  if (!texto || texto.length > 80 || !/^[\p{L}\p{N} ,.()/'+-]+$/u.test(texto)) return erro(400, 'Nome inválido.')

  // Sessão e Premium verificados no banco com o JWT do próprio usuário
  try {
    const h = { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const u = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: h, signal: AbortSignal.timeout(8000) })
    if (!u.ok) return erro(401, 'Sessão expirada.')
    const { id } = await u.json()
    const p = await fetch(`${supabaseUrl}/rest/v1/rpc/tem_premium`, { method: 'POST', headers: h, body: JSON.stringify({ uid: id }), signal: AbortSignal.timeout(8000) })
    if (!p.ok || (await p.json()) !== true) return erro(402, 'Recurso Premium.')
  } catch (e) {
    console.error(JSON.stringify({ evento: 'voz_verificacao_falhou', erro: String(e) }))
    return erro(503, 'Tente novamente.')
  }

  for (const modelo of ['gpt-4o-mini-tts', 'tts-1-hd']) {
    try {
      const body = { model: modelo, voice: VOZ[modelo], input: `${texto}.`, response_format: 'pcm', speed: 1.0 }
      if (modelo.startsWith('gpt-4o')) body.instructions = INSTRUCOES
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      })
      if (!r.ok) { console.error(JSON.stringify({ evento: 'voz_openai_erro', modelo, status: r.status })); continue }
      return new Response(comoWav(await r.arrayBuffer()), { status: 200, headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=31536000' } })
    } catch (e) {
      console.error(JSON.stringify({ evento: 'voz_indisponivel', modelo, erro: String(e) }))
    }
  }
  return erro(502, 'Voz indisponível no momento.')
}
