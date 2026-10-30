// Acompanhamento com personal: chamadas ao banco (todas por funções que conferem o vínculo).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { AlunoResumo } from './acompanhamentoBase'
import type { DadosSemana } from './relatorio'

export type { AlunoResumo } from './acompanhamentoBase'

export interface Compartilhamento { ver_treinos: boolean; ver_diario: boolean; ver_peso: boolean; editar_planos: boolean }
export interface MeuPersonal extends Compartilhamento { id: string; personal_id: string; nome: string; cref: string | null; desde: string; nao_lidas: number }
export interface PerfilPersonal { codigo: string; nome_exibicao: string | null; cref: string | null }
export interface Mensagem { id: string; acompanhamento_id: string; autor_id: string; tipo: 'texto' | 'treino' | 'dieta' | 'meta' | 'aviso'; texto: string; ref_id: string | null; lida_em: string | null; created_at: string }
export interface TreinoAluno { id: string; nome: string; objetivo: string | null; nivel: string | null; frequencia_semanal: number | null; created_at: string; enviado_por_mim: boolean }
export interface SessaoAluno { treino_nome: string | null; dia_index: number; data_inicio: string; data_fim: string | null; concluido: boolean }
export interface MetaAluno { calorias: number; proteina_g: number; carboidrato_g: number; gordura_g: number; agua_ml: number | null; meta_peso_kg: number | null; somar_exercicio: boolean; personalizada: boolean; peso_kg: number; objetivo: string }
export interface DadosAluno extends Compartilhamento {
  id: string; aluno_id: string; nome: string; desde: string
  meta: MetaAluno | null
  alimentos: (DadosSemana['alimentos'][number] & { refeicao: string | null; quantidade: string | null })[] | null
  agua: DadosSemana['agua'] | null
  exercicios: (DadosSemana['exercicios'][number] & { nome: string })[] | null
  pesos: DadosSemana['pesos'] | null
  treinos: TreinoAluno[] | null
  sessoes: SessaoAluno[] | null
}

async function rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args)
  if (error) throw new Error(error.message)
  return data as T
}

const num = (v: unknown) => Number(v ?? 0)

// --- Personal ---
export async function meuPerfilPersonal(userId: string): Promise<PerfilPersonal | null> {
  const { data } = await supabase.from('personais').select('codigo, nome_exibicao, cref').eq('user_id', userId).maybeSingle()
  return (data as PerfilPersonal) ?? null
}
export const ativarPersonal = (nome: string | null, cref: string | null, novoCodigo = false) =>
  rpc<PerfilPersonal>('acomp_ativar_personal', { p_nome: nome, p_cref: cref, p_novo_codigo: novoCodigo })
export const meusAlunos = (hoje: string) => rpc<AlunoResumo[]>('acomp_meus_alunos', { p_hoje: hoje }).then(l => (l ?? []).map(a => ({
  ...a, kcal_hoje: a.kcal_hoje == null ? null : num(a.kcal_hoje), peso: a.peso ? { ...a.peso, peso_kg: num(a.peso.peso_kg) } : null,
})))
export async function dadosAluno(alunoId: string, inicio: string, fim: string): Promise<DadosAluno> {
  const d = await rpc<DadosAluno>('acomp_dados_aluno', { p_aluno: alunoId, p_inicio: inicio, p_fim: fim })
  return {
    ...d,
    meta: d.meta ? { ...d.meta, peso_kg: num(d.meta.peso_kg), meta_peso_kg: d.meta.meta_peso_kg == null ? null : num(d.meta.meta_peso_kg) } : null,
    alimentos: d.alimentos?.map(a => ({ ...a, calorias: num(a.calorias), proteina_g: num(a.proteina_g), carboidrato_g: num(a.carboidrato_g), gordura_g: num(a.gordura_g) })) ?? null,
    pesos: d.pesos?.map(p => ({ ...p, peso_kg: num(p.peso_kg) })) ?? null,
  }
}
export const copiarTreinoDoAluno = (alunoId: string, treinoId: string) => rpc<string>('acomp_copiar_treino', { p_aluno: alunoId, p_treino: treinoId })
export const enviarTreino = (alunoId: string, origem: string, substituir: string | null) =>
  rpc<string>('acomp_enviar_treino', { p_aluno: alunoId, p_origem: origem, p_substituir: substituir })
export const enviarDieta = (alunoId: string, origem: string) => rpc<string>('acomp_enviar_dieta', { p_aluno: alunoId, p_origem: origem })
export const definirMeta = (alunoId: string, m: { calorias: number; proteina_g: number; carboidrato_g: number; gordura_g: number; agua_ml: number | null; meta_peso_kg: number | null }) =>
  rpc<void>('acomp_definir_meta', {
    p_aluno: alunoId, p_calorias: m.calorias, p_proteina: m.proteina_g, p_carboidrato: m.carboidrato_g, p_gordura: m.gordura_g,
    p_agua_ml: m.agua_ml, p_meta_peso: m.meta_peso_kg,
  })

// --- Aluno ---
export const verConvite = (codigo: string) => rpc<{ nome: string; cref: string | null; proprio: boolean; ja_vinculado: boolean }>('acomp_ver_convite', { p_codigo: codigo })
export const aceitarConvite = (codigo: string, c: Compartilhamento) => rpc<string>('acomp_aceitar', {
  p_codigo: codigo, p_ver_treinos: c.ver_treinos, p_ver_diario: c.ver_diario, p_ver_peso: c.ver_peso, p_editar_planos: c.editar_planos,
})
export const meusPersonais = () => rpc<MeuPersonal[]>('acomp_meus_personais').then(l => l ?? [])
export const atualizarCompartilhamento = (id: string, c: Compartilhamento) => rpc<void>('acomp_atualizar', {
  p_id: id, p_ver_treinos: c.ver_treinos, p_ver_diario: c.ver_diario, p_ver_peso: c.ver_peso, p_editar_planos: c.editar_planos,
})
export const encerrarAcompanhamento = (id: string) => rpc<void>('acomp_encerrar', { p_id: id })

// --- Mensagens ---
export async function listarMensagens(acompanhamentoId: string): Promise<Mensagem[]> {
  const { data, error } = await supabase.from('acomp_mensagens').select('id, acompanhamento_id, autor_id, tipo, texto, ref_id, lida_em, created_at')
    .eq('acompanhamento_id', acompanhamentoId).order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return ((data as Mensagem[]) ?? []).reverse()
}
export const enviarMensagem = (acompanhamentoId: string, texto: string) => rpc<Mensagem>('acomp_enviar_mensagem', { p_id: acompanhamentoId, p_texto: texto })
export const marcarLidas = (acompanhamentoId: string) => rpc<void>('acomp_marcar_lidas', { p_id: acompanhamentoId })

/** Mensagens não lidas (para o menu); atualiza ao voltar para a aba. */
export function useNaoLidas(ativo: boolean) {
  const [estado, setEstado] = useState<{ como_aluno: number; como_personal: number; personal: boolean } | null>(null)
  const recarregar = useCallback(() => {
    if (!ativo) return
    rpc<{ como_aluno: number; como_personal: number; personal: boolean }>('acomp_nao_lidas').then(setEstado).catch(() => setEstado(null))
  }, [ativo])
  useEffect(() => {
    recarregar()
    const aoVoltar = () => { if (document.visibilityState === 'visible') recarregar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [recarregar])
  return estado
}
