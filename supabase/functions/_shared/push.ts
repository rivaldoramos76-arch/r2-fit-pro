// Envio de notificações Web Push (chaves VAPID guardadas em push_config, só a chave de serviço lê).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'
import webpush from 'npm:web-push@3.6.7'
import { log } from './http.ts'
import { siteUrl } from './email.ts'
import type { MensagemPush } from './lembretesLogic.ts'

interface Chaves { publica: string; privada: string }
interface Inscricao { id: string; endpoint: string; p256dh: string; auth: string }

let cache: Chaves | null = null

/** Chaves VAPID do app; geradas uma única vez no primeiro uso. */
export async function chavesVapid(admin: SupabaseClient): Promise<Chaves> {
  if (cache) return cache
  const ler = async () => (await admin.from('push_config').select('vapid_publica, vapid_privada').eq('id', true).maybeSingle()).data
  let linha = await ler()
  if (!linha) {
    const novas = webpush.generateVAPIDKeys()
    await admin.from('push_config').upsert({ id: true, vapid_publica: novas.publicKey, vapid_privada: novas.privateKey }, { onConflict: 'id', ignoreDuplicates: true })
    linha = await ler()
  }
  if (!linha) throw new Error('push_config indisponível')
  cache = { publica: linha.vapid_publica, privada: linha.vapid_privada }
  return cache
}

/** Envia uma notificação; inscrições que o navegador descartou (404/410) são apagadas. */
export async function enviarPush(admin: SupabaseClient, chaves: Chaves, i: Inscricao, msg: MensagemPush): Promise<'ok' | 'expirada' | 'erro'> {
  try {
    const req = webpush.generateRequestDetails(
      { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
      JSON.stringify(msg),
      { vapidDetails: { subject: siteUrl(), publicKey: chaves.publica, privateKey: chaves.privada }, TTL: 4 * 3600, urgency: 'normal' },
    )
    const resp = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: req.body, signal: AbortSignal.timeout(10000) })
    if (resp.status === 404 || resp.status === 410) {
      await admin.from('push_inscricoes').delete().eq('id', i.id)
      return 'expirada'
    }
    if (!resp.ok) {
      log('warn', 'push_falhou', { status: resp.status, servico: new URL(i.endpoint).host, resposta: (await resp.text()).slice(0, 200) })
      return 'erro'
    }
    await admin.from('push_inscricoes').update({ ultimo_uso: new Date().toISOString() }).eq('id', i.id)
    return 'ok'
  } catch (e) {
    log('warn', 'push_erro', { erro: String(e) })
    return 'erro'
  }
}
