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
  testarRelogio(o?: { atraso?: number }): Promise<void>
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

/** Tela sempre ligada no app (1.7+). App antigo sem o método: ignora em vez de quebrar o contador. */
export function telaLigadaNativa(ligada: boolean) {
  const n = contadorNativo()
  if (!n || typeof n.telaLigada !== 'function') return
  try { Promise.resolve(n.telaLigada({ ligada })).catch(() => {}) } catch { /* app antigo */ }
}

// --- Botão voltar do Android ---
let bloqueioVoltar: (() => boolean) | null = null
/** Tela que não pode ser deixada sem confirmar (ex.: contador rodando): devolve true para sair. null tira o bloqueio. */
export function bloquearVoltar(f: (() => boolean) | null) { bloqueioVoltar = f }

interface AppPlugin {
  addListener(ev: 'backButton', cb: (e: { canGoBack: boolean }) => void): unknown
  exitApp(): Promise<void>
  minimizeApp?: () => Promise<void>
}
/** Liga o botão voltar do app: volta uma tela; na primeira tela minimiza o app; no contador pede confirmação. */
export function escutarVoltar() {
  const c = cap()
  if (!c?.isNativePlatform?.()) return
  const app = (c.registerPlugin?.<AppPlugin>('App') ?? (c.Plugins?.App as AppPlugin | undefined))
  if (!app?.addListener) return
  app.addListener('backButton', ({ canGoBack }) => {
    if (bloqueioVoltar && !bloqueioVoltar()) return
    if (canGoBack && window.history.length > 1) window.history.back()
    else if (typeof app.minimizeApp === 'function') app.minimizeApp().catch(() => app.exitApp())
    else app.exitApp().catch(() => {})
  })
}

// --- Arquivos (PDF, imagem, exportação) ---
interface ArquivosNativo { compartilhar(o: { base64: string; nome: string; mime: string; titulo?: string }): Promise<void> }
function arquivosNativo(): ArquivosNativo | null {
  const c = cap()
  if (!c?.isNativePlatform?.() || !c.isPluginAvailable?.('ArquivosNativo')) return null
  return (c.registerPlugin?.<ArquivosNativo>('ArquivosNativo') ?? (c.Plugins?.ArquivosNativo as ArquivosNativo | undefined)) ?? null
}

/**
 * Entrega um arquivo para a pessoa: no app Android abre "Compartilhar/Salvar" (o WebView não baixa arquivos);
 * no iPhone usa a folha de compartilhar quando dá (salvar em Arquivos); senão, baixa.
 * Retorna 'compartilhado' | 'baixado' | 'cancelado' | 'sem_suporte' (app Android antigo).
 */
export async function entregarArquivo(blob: Blob, nome: string, titulo = 'Salvar ou enviar'): Promise<'compartilhado' | 'baixado' | 'cancelado' | 'sem_suporte'> {
  if (ehAppNativo()) {
    const a = arquivosNativo()
    if (!a) return 'sem_suporte'
    await a.compartilhar({ base64: await blobParaBase64(blob), nome, mime: blob.type || 'application/octet-stream', titulo })
    return 'compartilhado'
  }
  const arquivo = new File([blob], nome, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && nav.canShare?.({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: titulo }); return 'compartilhado' } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = nome
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'baixado'
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
  /** App 1.8+: avisos com data e texto prontos. Grupo "rotina" (ergogênicos, padrão: repete no dia seguinte até marcar)
   *  ou "semana" (treino perdido: uma vez só). Cada chamada troca a lista inteira do grupo. */
  agendarRotina(o: { grupo?: 'rotina' | 'semana'; itens: { id: string; data: string; hora: number; minuto: number; titulo: string; corpo: string; url?: string }[] }): Promise<void>
  /** App 1.8+: notificação na hora (antes/depois do treino) */
  avisarAgora(o: { titulo: string; corpo: string; url: string }): Promise<void>
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

/** Versão do app instalado (versionCode do Android), pelo plugin App do Capacitor. */
export async function versaoDoApp(): Promise<{ codigo: number; nome: string } | null> {
  const c = cap()
  if (!c?.isNativePlatform?.()) return null
  if (!c.isPluginAvailable?.('App')) throw new Error('plugin App não encontrado')
  const app = (c.registerPlugin?.<{ getInfo(): Promise<{ build: string; version: string }> }>('App')
    ?? (c.Plugins?.App as { getInfo(): Promise<{ build: string; version: string }> } | undefined))
  if (!app) throw new Error('plugin App indisponível')
  const info = await app.getInfo()
  return { codigo: Number(info.build) || 0, nome: info.version }
}
