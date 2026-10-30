// Cliente mínimo da API do Asaas (a chave nunca sai do servidor).
import { ErroHttp, log } from './http.ts'

const chave = () => Deno.env.get('ASAAS_API_KEY') ?? ''
export const asaasConfigurado = () => chave().startsWith('$aact_')
/** Chaves de homologação (sandbox) usam outro endereço. */
const base = () => (chave().includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3')

// deno-lint-ignore no-explicit-any
export async function asaas<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  if (!asaasConfigurado()) throw new ErroHttp(503, 'Pagamentos ainda não configurados. Tente novamente mais tarde.', 'asaas_nao_configurado')
  let resp: Response
  try {
    resp = await fetch(base() + caminho, {
      method: metodo,
      headers: { access_token: chave(), 'Content-Type': 'application/json', 'User-Agent': 'r2-fit-pro' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20000),
    })
  } catch (e) {
    log('error', 'asaas_indisponivel', { caminho, erro: String(e) })
    throw new ErroHttp(502, 'Asaas indisponível no momento. Tente novamente em instantes.', 'asaas_indisponivel')
  }
  const texto = await resp.text()
  // deno-lint-ignore no-explicit-any
  let dados: any = null
  try { dados = texto ? JSON.parse(texto) : null } catch { dados = { bruto: texto.slice(0, 300) } }
  if (!resp.ok) {
    const msg = dados?.errors?.[0]?.description ?? dados?.message ?? `Erro ${resp.status} no Asaas`
    log('warn', 'asaas_erro', { caminho, status: resp.status, mensagem: msg, codigo: dados?.errors?.[0]?.code })
    throw new ErroHttp(resp.status >= 500 ? 502 : resp.status === 404 ? 404 : 400, msg, resp.status === 404 ? 'asaas_nao_encontrado' : 'asaas_erro')
  }
  return dados as T
}
