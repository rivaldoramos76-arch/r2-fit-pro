// Vercel Function: proxy seguro para a OpenAI.
// - A chave da OpenAI fica apenas no servidor (variável de ambiente).
// - Exige sessão válida do Supabase e assinatura Premium ativa (verificadas no banco).
// - Limite diário de chamadas por usuário (registrar_uso_ia) e validação do payload.

const MODELOS = new Set(['gpt-4o', 'gpt-4o-mini'])
const MAX_CORPO = 3_000_000
const LIMITE_DIARIO = Number(process.env.AI_LIMITE_DIARIO || 80)

const resposta = (status, corpo) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

function validarMensagens(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 6) return false
  return messages.every(m => {
    if (!m || !['system', 'user', 'assistant'].includes(m.role)) return false
    if (typeof m.content === 'string') return m.content.length <= 20_000
    if (!Array.isArray(m.content) || m.content.length > 4) return false
    return m.content.every(p =>
      (p?.type === 'text' && typeof p.text === 'string' && p.text.length <= 20_000) ||
      (p?.type === 'image_url' && typeof p.image_url?.url === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.image_url.url) && p.image_url.url.length <= 2_000_000))
  })
}

export async function POST(request) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
  if (!supabaseUrl || !anonKey || !openaiKey) return resposta(503, { erro: 'Serviço de IA não configurado.' })

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return resposta(401, { erro: 'Faça login para usar a IA.' })

  const bruto = await request.text()
  if (bruto.length > MAX_CORPO) return resposta(413, { erro: 'Conteúdo muito grande. Use uma foto menor.' })
  let corpo
  try { corpo = JSON.parse(bruto) } catch { return resposta(400, { erro: 'Requisição inválida.' }) }

  const model = MODELOS.has(corpo.model) ? corpo.model : 'gpt-4o'
  if (!validarMensagens(corpo.messages)) return resposta(400, { erro: 'Requisição inválida.' })
  const temperature = Math.min(Math.max(Number(corpo.temperature ?? 0.5), 0), 1.2)

  // Autenticação + Premium + limite diário, verificados no banco com o JWT do próprio usuário
  let uso
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/registrar_uso_ia`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limite: LIMITE_DIARIO }),
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 401 || r.status === 403) return resposta(401, { erro: 'Sessão expirada. Faça login novamente.' })
    if (!r.ok) throw new Error(`supabase ${r.status}`)
    uso = await r.json()
  } catch (e) {
    console.error(JSON.stringify({ evento: 'ia_verificacao_falhou', erro: String(e) }))
    return resposta(503, { erro: 'Não foi possível verificar sua assinatura agora. Tente novamente.' })
  }
  if (!uso?.permitido) {
    if (uso?.motivo === 'sem_premium') return resposta(402, { erro: 'Recurso disponível para assinantes Premium.', codigo: 'sem_premium' })
    if (uso?.motivo === 'limite_teste') return resposta(429, { erro: 'Você atingiu o limite diário de uso da IA do teste grátis. Assine o Premium para usar mais, ou tente de novo amanhã.', codigo: 'limite_teste' })
    if (uso?.motivo === 'limite_diario') return resposta(429, { erro: 'Limite diário de uso da IA atingido. Tente novamente amanhã.', codigo: 'limite_diario' })
    return resposta(401, { erro: 'Faça login para usar a IA.' })
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature, messages: corpo.messages, max_tokens: 4000,
        ...(corpo.response_format?.type === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(55000),
    })
    const dados = await r.json().catch(() => null)
    if (!r.ok) {
      console.error(JSON.stringify({ evento: 'openai_erro', status: r.status, tipo: dados?.error?.type }))
      return resposta(502, { erro: 'A IA está indisponível no momento. Tente novamente em instantes.' })
    }
    return resposta(200, { choices: [{ message: { content: dados?.choices?.[0]?.message?.content ?? null } }] })
  } catch (e) {
    console.error(JSON.stringify({ evento: 'openai_indisponivel', erro: String(e) }))
    return resposta(504, { erro: 'A IA demorou para responder. Tente novamente.' })
  }
}
