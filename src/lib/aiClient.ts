import { supabase } from './supabase'

// Cliente da IA: chama a função do servidor (/api/ai), que guarda a chave da OpenAI,
// valida a sessão e a assinatura Premium. Mantém o formato de resposta usado pelo app.
export interface ChatParams {
  model: string
  messages: unknown[]
  response_format?: { type: 'json_object' }
  temperature?: number
}

export class ErroIA extends Error {
  constructor(message: string, public codigo?: string, public status?: number) { super(message) }
}

export async function chatCompletion(params: ChatParams): Promise<{ choices: { message: { content: string | null } }[] }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErroIA('Faça login para usar a IA.', 'sem_sessao', 401)
  let resp: Response
  try {
    resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
  } catch {
    throw new ErroIA('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 'rede')
  }
  const corpo = await resp.json().catch(() => null)
  if (!resp.ok) throw new ErroIA(corpo?.erro ?? `Erro ${resp.status} ao consultar a IA`, corpo?.codigo, resp.status)
  return corpo
}
