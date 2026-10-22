// Utilitários HTTP das Edge Functions.
const ORIGENS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://r2-fit-pro.vercel.app,http://localhost:5173,http://localhost:4173')
  .split(',').map(o => o.trim()).filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') ?? ''
  const permitida = ORIGENS.includes(origem) || /^https:\/\/r2-fit-[a-z0-9-]+\.vercel\.app$/.test(origem)
  return {
    'Access-Control-Allow-Origin': permitida ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export class ErroHttp extends Error {
  constructor(public status: number, message: string, public codigo?: string) { super(message) }
}

/** Log estruturado sem dados sensíveis (tokens, segredos, cartões). */
export function log(nivel: 'info' | 'warn' | 'error', evento: string, dados: Record<string, unknown> = {}) {
  const limpo: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(dados)) {
    limpo[k] = /token|secret|senha|password|authorization|card/i.test(k) ? '[omitido]' : v
  }
  console[nivel](JSON.stringify({ nivel, evento, ...limpo }))
}
