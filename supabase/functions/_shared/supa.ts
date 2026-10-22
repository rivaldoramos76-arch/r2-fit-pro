import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.4'
import { ErroHttp } from './http.ts'

export function clienteAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Valida o JWT do usuário no Supabase Auth (nunca confia em ids enviados pelo navegador). */
export async function usuarioAutenticado(req: Request, admin: SupabaseClient): Promise<User> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new ErroHttp(401, 'Sessão ausente. Faça login novamente.')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new ErroHttp(401, 'Sessão inválida ou expirada. Faça login novamente.')
  return data.user
}

export async function rpc<T = unknown>(admin: SupabaseClient, nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, args)
  if (error) throw new Error(`${nome}: ${error.message}`)
  return data as T
}

export async function auditar(admin: SupabaseClient, actorId: string | null, acao: string, alvo: string | null, detalhes: Record<string, unknown> = {}) {
  await admin.from('audit_logs').insert({ actor_id: actorId, acao, alvo, detalhes })
}
