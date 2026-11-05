import { useEffect, useState } from 'react'

// Instalação do app na tela inicial (PWA).
// O Chrome/Android avisa uma única vez que o app pode ser instalado (beforeinstallprompt);
// guardamos o evento para oferecer um botão "Instalar" direto.
interface EventoInstalar extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let pedido: EventoInstalar | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach(f => f())

export function iniciarInstalacao() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e as EventoInstalar; avisar() })
  window.addEventListener('appinstalled', () => { pedido = null; avisar() })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
  }
}

export type Sistema = 'iphone' | 'android' | 'outro'

export function detectarSistema(ua = navigator.userAgent): Sistema {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone'
  if (/Android/i.test(ua)) return 'android'
  return 'outro'
}

/** Já está aberto como app instalado (tela inicial)? */
export function estaInstalado(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function useInstalacao() {
  const [, forcar] = useState(0)
  useEffect(() => {
    const f = () => forcar(n => n + 1)
    ouvintes.add(f)
    return () => { ouvintes.delete(f) }
  }, [])
  return {
    instalado: estaInstalado(),
    podeInstalarDireto: !!pedido,
    instalar: async () => {
      if (!pedido) return false
      await pedido.prompt()
      const { outcome } = await pedido.userChoice
      pedido = null; avisar()
      return outcome === 'accepted'
    },
  }
}

/** Navegador embutido de outro app (Instagram, Facebook, WhatsApp, TikTok…), que não instala apps. */
export function navegadorEmbutido(ua = navigator.userAgent): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|WhatsApp|TikTok|musical_ly|Snapchat|; wv\)/i.test(ua)
}

const CHAVE_NAVEGADOR = 'r2-continuar-navegador'
/** Rotas que funcionam no navegador mesmo sem o app instalado: voltar do pagamento e aceitar convites. */
const LIVRES = [/^\/assinatura\/retorno/, /^\/convite\//, /^\/amigo\//]

/** No celular, o app só é usado instalado na tela inicial (com uma saída de emergência por sessão). */
export function precisaInstalar(caminho: string, ua = navigator.userAgent): boolean {
  if (estaInstalado() || detectarSistema(ua) === 'outro') return false
  if (LIVRES.some(r => r.test(caminho))) return false
  try { if (sessionStorage.getItem(CHAVE_NAVEGADOR) === '1') return false } catch { /* sem armazenamento */ }
  return true
}
export function continuarNoNavegador() {
  try { sessionStorage.setItem(CHAVE_NAVEGADOR, '1') } catch { /* sem armazenamento */ }
}
