// Rota /admin da Edge Function r2-api: ações do painel que exigem a chave de serviço
// (hoje, excluir a conta de um cliente). O chamador precisa ser administrador.
import { corsHeaders, json, ErroHttp, log } from '../_shared/http.ts'
import { clienteAdmin, usuarioAutenticado } from '../_shared/supa.ts'
import { excluirUsuario } from './conta.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleAdmin(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { erro: 'Método não permitido' }, 405)
  const admin = clienteAdmin()
  try {
    const autor = await usuarioAutenticado(req, admin)
    const { data: ehAdmin } = await admin.from('admins').select('user_id').eq('user_id', autor.id).maybeSingle()
    if (!ehAdmin) throw new ErroHttp(403, 'Acesso negado')
    const corpo = await req.json().catch(() => ({}))

    if (corpo?.acao === 'excluir_usuario') {
      const id = String(corpo.user_id ?? '')
      if (!UUID.test(id)) throw new ErroHttp(400, 'Cliente inválido')
      if (id === autor.id) throw new ErroHttp(400, 'Você não pode excluir a própria conta pelo painel.')
      const { data: outroAdmin } = await admin.from('admins').select('user_id').eq('user_id', id).maybeSingle()
      if (outroAdmin) throw new ErroHttp(400, 'Contas de administrador não podem ser excluídas pelo painel.')
      const { data: alvo, error } = await admin.auth.admin.getUserById(id)
      if (error || !alvo?.user) throw new ErroHttp(404, 'Cliente não encontrado')
      if (String(corpo.confirmacao ?? '').trim().toLowerCase() !== (alvo.user.email ?? '').toLowerCase()) {
        throw new ErroHttp(400, 'Digite o e-mail do cliente para confirmar.')
      }
      await excluirUsuario(admin, { id, email: alvo.user.email ?? null }, autor.id, `Excluída pelo administrador ${autor.email ?? autor.id}`)
      log('info', 'conta_excluida_admin', { user: id, admin: autor.id })
      return json(req, { ok: true })
    }
    throw new ErroHttp(400, 'Ação inválida')
  } catch (e) {
    if (e instanceof ErroHttp) return json(req, { erro: e.message, codigo: e.codigo }, e.status)
    log('error', 'admin_erro', { erro: String(e) })
    return json(req, { erro: 'Erro interno. Tente novamente.' }, 500)
  }
}
