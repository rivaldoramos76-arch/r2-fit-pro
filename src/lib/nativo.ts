// App instalado (Android, Capacitor): o site roda dentro do app e ganha recursos nativos.
// Sem dependência no site: usa a ponte window.Capacitor que o app injeta.

export interface ContadorNativo {
  preparar(o: { clipes: Record<string, { wav: string; dur: number }> }): Promise<void>
  tocar(o: { cues: { t: number; clip: string }[]; desde: number; volume: number; mudo: boolean; titulo: string; avisos?: { t: number; titulo: string; texto: string; dur: number }[] }): Promise<void>
  pausar(): Promise<void>
  parar(): Promise<void>
  volume(o: { volume: number; mudo: boolean }): Promise<void>
  telaLigada(o: { ligada: boolean }): Promise<void>
  /** App 1.3+: notificação de teste igual à de uma fase */
  testarRelogio(): Promise<void>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  isPluginAvailable?: (nome: string) => boolean
  registerPlugin?: <T>(nome: string) => T
  Plugins?: Record<string, unknown>
}
const cap = (): CapacitorGlobal | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor

/** Aberto dentro do app instalado (não no navegador). */
export const ehAppNativo = (): boolean => !!cap()?.isNativePlatform?.()

let plugin: ContadorNativo | null | undefined
/** Contador nativo do app Android: segue com a tela bloqueada e abaixa a música só durante a fala. */
export function contadorNativo(): ContadorNativo | null {
  if (plugin !== undefined) return plugin
  const c = cap()
  if (!c?.isNativePlatform?.() || !c.isPluginAvailable?.('ContadorNativo')) return (plugin = null)
  plugin = (c.registerPlugin?.<ContadorNativo>('ContadorNativo') ?? (c.Plugins?.ContadorNativo as ContadorNativo | undefined)) ?? null
  return plugin
}

/** Bytes para base64 em blocos (sem estourar a pilha com arquivos grandes). */
export async function blobParaBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export interface LembretesNativo {
  estado(): Promise<EstadoLembretesApp>
  ativar(): Promise<EstadoLembretesApp>
  desativar(): Promise<EstadoLembretesApp>
  agendar(o: { itens: { id: string; tipo: string; hora: number; minuto: number; dias: number[] }[] }): Promise<EstadoLembretesApp>
  testar(): Promise<void>
}
export interface EstadoLembretesApp { permissao: 'granted' | 'denied' | 'prompt'; ativo: boolean; token: string }

let pluginLembretes: LembretesNativo | null | undefined
/** Lembretes do app Android: alarmes no próprio celular (o Web Push não funciona dentro do app). */
export function lembretesNativo(): LembretesNativo | null {
  if (pluginLembretes !== undefined) return pluginLembretes
  const c = cap()
  if (!c?.isNativePlatform?.() || !c.isPluginAvailable?.('LembretesNativo')) return (pluginLembretes = null)
  pluginLembretes = (c.registerPlugin?.<LembretesNativo>('LembretesNativo') ?? (c.Plugins?.LembretesNativo as LembretesNativo | undefined)) ?? null
  return pluginLembretes
}
