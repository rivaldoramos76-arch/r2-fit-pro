import { supabase } from './supabase'

// Chamadas à Edge Function r2-api (cobrança e conta). A sessão do usuário
// é enviada no cabeçalho Authorization e validada no servidor.
export class ErroApi extends Error {
  constructor(message: string, public codigo?: string, public status?: number) { super(message) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function chamarApi<T = any>(rota: 'billing' | 'conta' | 'admin' | 'lembretes', corpo: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErroApi('Sua sessão expirou. Faça login novamente.', 'sem_sessao', 401)
  let resp: Response
  try {
    resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-api/${rota}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 'rede')
  }
  const json = await resp.json().catch(() => null)
  if (!resp.ok) throw new ErroApi(json?.erro ?? `Erro ${resp.status}`, json?.codigo, resp.status)
  return json as T
}
