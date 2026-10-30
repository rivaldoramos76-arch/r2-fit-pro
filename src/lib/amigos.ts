// Amigos: chamadas ao banco (todas por funções que conferem a amizade).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { LinhaRanking } from './amigosBase'

export type { LinhaRanking } from './amigosBase'
export interface PerfilSocial { codigo: string; apelido: string | null; mostrar_treinos: boolean; entrar_ranking: boolean; nome: string }
export interface Amigo { id: string; user_id: string; nome: string; desde: string }
export interface Pedido { id: string; nome: string; em: string }
export interface DadosAmigos { perfil: PerfilSocial | null; amigos?: Amigo[]; recebidos?: Pedido[]; enviados?: Pedido[] }
export interface ItemFeed {
  sessao_id: string; user_id: string; nome: string; eu: boolean; treino_nome: string | null; dia_index: number; data_fim: string
  minutos: number | null; exercicios: number; curtidas: number; curti: boolean; quem_curtiu: string[] | null
}

async function rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const meusAmigos = () => rpc<DadosAmigos>('social_amigos')
export const ativarAmigos = (apelido: string | null, opcoes: { mostrar_treinos?: boolean; entrar_ranking?: boolean } = {}) =>
  rpc<PerfilSocial>('social_ativar', { p_apelido: apelido, p_mostrar_treinos: opcoes.mostrar_treinos ?? null, p_entrar_ranking: opcoes.entrar_ranking ?? null })
export const adicionarAmigo = (codigo: string) => rpc<{ status: 'enviado' | 'aceita' | 'pendente' | 'ja_amigos'; nome: string }>('social_adicionar', { p_codigo: codigo })
export const responderPedido = (id: string, aceitar: boolean) => rpc<void>('social_responder', { p_id: id, p_aceitar: aceitar })
export const removerAmizade = (id: string) => rpc<void>('social_remover', { p_id: id })
export const feedAmigos = (antes?: string) => rpc<ItemFeed[]>('social_feed', { p_antes: antes ?? null }).then(l => l ?? [])
export const curtir = (sessaoId: string, curtirAgora: boolean) => rpc<void>('social_curtir', { p_sessao: sessaoId, p_curtir: curtirAgora })
export const rankingAmigos = (inicio: string, fim: string) => rpc<LinhaRanking[]>('social_ranking', { p_inicio: inicio, p_fim: fim }).then(l => l ?? [])

/** Pedidos de amizade recebidos (para o menu). */
export function usePedidosAmizade(ativo: boolean) {
  const [n, setN] = useState(0)
  const recarregar = useCallback(() => { if (ativo) rpc<number>('social_pendentes').then(v => setN(Number(v) || 0)).catch(() => setN(0)) }, [ativo])
  useEffect(() => { recarregar() }, [recarregar])
  return n
}
