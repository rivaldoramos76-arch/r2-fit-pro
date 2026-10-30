import { supabase } from './supabase'
import { chamarApi } from './api'
import { detectarSistema, estaInstalado } from './instalacao'
import { normalizarLembrete, type Lembrete } from './lembretesBase'

// Lembretes por notificação: horários no banco (RLS) e inscrição do aparelho via Edge Function.

export async function listarLembretes(userId: string): Promise<Lembrete[]> {
  const { data, error } = await supabase.from('lembretes').select('id, tipo, horario, dias, ativo').eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data ?? []).map(l => ({ ...l, horario: String(l.horario).slice(0, 5) })) as Lembrete[]
}

/** Grava a lista da tela: apaga os removidos, atualiza os existentes e cria os novos. */
export async function salvarLembretes(userId: string, lista: Lembrete[], removidos: string[]) {
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
  const validos = lista.map(normalizarLembrete)
  if (validos.some(l => !l)) throw new Error('Confira os horários: use o formato 00:00 e escolha pelo menos um dia.')
  const linhas = (validos as Lembrete[]).map(l => ({ ...l, user_id: userId, fuso }))
  if (removidos.length) {
    const { error } = await supabase.from('lembretes').delete().in('id', removidos)
    if (error) throw new Error(error.message)
  }
  const existentes = linhas.filter(l => l.id)
  const novos = linhas.filter(l => !l.id).map(({ id: _id, ...l }) => l)
  if (existentes.length) {
    const { error } = await supabase.from('lembretes').upsert(existentes)
    if (error) throw new Error(error.message)
  }
  if (novos.length) {
    const { error } = await supabase.from('lembretes').insert(novos)
    if (error) throw new Error(error.message)
  }
}

// --- Notificações neste aparelho ---

export type EstadoPush = 'sem_suporte' | 'instalar' | 'negado' | 'inativo' | 'ativo'

const suporta = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registro(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js')
}

export async function estadoPush(): Promise<EstadoPush> {
  // No iPhone, notificação só funciona com o app adicionado à Tela de Início (iOS 16.4+)
  if (detectarSistema() === 'iphone' && !estaInstalado()) return 'instalar'
  if (!suporta()) return 'sem_suporte'
  if (Notification.permission === 'denied') return 'negado'
  if (Notification.permission !== 'granted') return 'inativo'
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ? 'ativo' : 'inativo'
}

function chaveParaBytes(base64url: string): Uint8Array {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

/** Pede permissão, inscreve o aparelho no serviço de notificações e avisa o servidor. */
export async function ativarPush(): Promise<EstadoPush> {
  if (!suporta()) return 'sem_suporte'
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'inativo'
  const reg = await registro()
  await navigator.serviceWorker.ready
  const { chave } = await chamarApi<{ chave: string }>('lembretes', { acao: 'chave' })
  let inscricao = await reg.pushManager.getSubscription()
  if (!inscricao) {
    inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) as BufferSource })
  }
  await chamarApi('lembretes', { acao: 'inscrever', inscricao: inscricao.toJSON() })
  return 'ativo'
}

export async function desativarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const inscricao = await reg?.pushManager.getSubscription()
  if (!inscricao) return
  await chamarApi('lembretes', { acao: 'desinscrever', endpoint: inscricao.endpoint }).catch(() => {})
  await inscricao.unsubscribe()
}

export const testarPush = () => chamarApi<{ enviados: number; falhas: number }>('lembretes', { acao: 'testar' })
