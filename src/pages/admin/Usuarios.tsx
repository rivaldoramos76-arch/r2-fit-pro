import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dataBR, dataHoraBR, ROTULO_ESTADO, type EstadoAcesso } from '../../lib/formatos'
import { Badge, Button, Input } from '../../components/UI'
import { Erro, Tabela, Td, msgErro } from './comum'
import Cliente from './Cliente'

interface Usuario { id: string; nome: string | null; email: string; criado_em: string; ultimo_login: string | null; email_confirmado: boolean; estado: EstadoAcesso; admin: boolean; total: number }

export default function Usuarios() {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [lista, setLista] = useState<Usuario[]>([])
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<Usuario | null>(null)
  const POR_PAGINA = 50

  const carregar = useCallback(async (b: string, p: number) => {
    const { data, error } = await supabase.rpc('admin_usuarios', { p_busca: b || null, p_limite: POR_PAGINA, p_offset: p * POR_PAGINA })
    if (error) setErro(msgErro(error)); else { setErro(''); setLista((data ?? []) as Usuario[]) }
  }, [])
  useEffect(() => { carregar('', 0) }, [carregar])

  const total = lista[0]?.total ?? 0
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={e => { e.preventDefault(); setPagina(0); carregar(busca, 0) }} className="flex gap-2 items-end">
        <div className="flex-1"><Input label="Buscar por nome ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        <Button type="submit">Buscar</Button>
      </form>
      <Erro texto={erro} />
      <p className="text-xs text-zinc-500">{total} usuário(s) · toque em um cliente para ver detalhes, liberar acesso ou registrar pagamento</p>
      <Tabela cabecalho={['Nome', 'E-mail', 'Situação', 'Cadastro', 'Último acesso', '']} vazio={lista.length === 0}>
        {lista.map(u => (
          <tr key={u.id} onClick={() => setAberto(u)} className="cursor-pointer hover:bg-zinc-800/50">
            <Td>{u.nome ?? '—'}{u.admin && <Badge variant="blue" className="ml-2">admin</Badge>}</Td>
            <Td className="break-all">{u.email}{!u.email_confirmado && <span className="text-yellow-400 text-xs block">e-mail não confirmado</span>}</Td>
            <Td><Badge variant={ROTULO_ESTADO[u.estado]?.cor ?? 'zinc'}>{ROTULO_ESTADO[u.estado]?.texto ?? u.estado}</Badge></Td>
            <Td className="whitespace-nowrap">{dataBR(u.criado_em)}</Td>
            <Td className="whitespace-nowrap">{dataHoraBR(u.ultimo_login)}</Td>
            <Td><Button size="sm" variant="secondary" onClick={e => { e.stopPropagation(); setAberto(u) }}>Gerenciar</Button></Td>
          </tr>
        ))}
      </Tabela>
      {aberto && <Cliente resumo={aberto} onClose={() => setAberto(null)} onAlterado={() => carregar(busca, pagina)} />}
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" disabled={pagina === 0} onClick={() => { setPagina(pagina - 1); carregar(busca, pagina - 1) }}>Anterior</Button>
        <Button variant="secondary" size="sm" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => { setPagina(pagina + 1); carregar(busca, pagina + 1) }}>Próxima</Button>
      </div>
    </div>
  )
}
