// Cliente mínimo da API do Mercado Pago (o token nunca sai do servidor).
import { ErroHttp, log } from './http.ts'

const BASE = 'https://api.mercadopago.com'

export function mpConfigurado(): boolean {
  return Boolean(Deno.env.get('MP_ACCESS_TOKEN'))
}
export function mpModoTeste(): boolean {
  return (Deno.env.get('MP_ACCESS_TOKEN') ?? '').startsWith('TEST-')
}

// deno-lint-ignore no-explicit-any
export async function mp<T = any>(metodo: string, caminho: string, corpo?: unknown, idempotencia?: string): Promise<T> {
  const token = Deno.env.get('MP_ACCESS_TOKEN')
  if (!token) throw new ErroHttp(503, 'Pagamentos ainda não configurados. Tente novamente mais tarde.', 'mp_nao_configurado')
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (idempotencia) headers['X-Idempotency-Key'] = idempotencia
  let resp: Response
  try {
    resp = await fetch(BASE + caminho, {
      method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    log('error', 'mp_indisponivel', { caminho, erro: String(e) })
    throw new ErroHttp(502, 'Mercado Pago indisponível no momento. Tente novamente em instantes.', 'mp_indisponivel')
  }
  const texto = await resp.text()
  // deno-lint-ignore no-explicit-any
  let dados: any = null
  try { dados = texto ? JSON.parse(texto) : null } catch { dados = { bruto: texto.slice(0, 300) } }
  if (!resp.ok) {
    log('warn', 'mp_erro', { caminho, status: resp.status, mensagem: dados?.message, causa: dados?.cause?.[0]?.description })
    const msg = dados?.message ?? `Erro ${resp.status} no Mercado Pago`
    throw new ErroHttp(resp.status >= 500 ? 502 : resp.status === 404 ? 404 : 400, `Mercado Pago: ${msg}`, resp.status === 404 ? 'mp_nao_encontrado' : 'mp_erro')
  }
  return dados as T
}
