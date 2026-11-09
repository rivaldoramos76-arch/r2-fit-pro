import { useEffect, useRef } from 'react'
import { slugNome } from '../../lib/vozNomes'

/**
 * Exercícios com animação 3D da execução, gravadas em public/animacoes/<slug>.mp4 (+ .jpg de capa).
 * Geradas fora do app (personagem 3D com aparelhos fixos); para incluir outra, gravar os dois arquivos
 * e acrescentar o nome aqui.
 */
const COM_ANIMACAO = new Set([
  'agachamento-livre-com-barra',
  'supino-reto-com-barra',
  'supino-inclinado-com-halteres',
  'leg-press-45',
])

/** Caminho base da animação do exercício (sem extensão) ou null se não houver. */
export function animacaoDe(nome: string): string | null {
  const s = slugNome(nome)
  return COM_ANIMACAO.has(s) ? `/animacoes/${s}` : null
}

function Video({ base, nome, className }: { base: string; nome: string; className: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = true // iOS só toca sozinho se estiver mudo
    v.play().catch(() => {})
  }, [base])
  return (
    <video ref={ref} src={`${base}.mp4`} poster={`${base}.jpg`} muted loop autoPlay playsInline preload="auto"
      aria-label={`Execução: ${nome}`} className={className} />
  )
}

/** Miniatura discreta ao lado do nome; um toque abre a animação maior. */
export function MiniExecucao({ nome, onAbrir }: { nome: string; onAbrir: () => void }) {
  const base = animacaoDe(nome)
  if (!base) return null
  return (
    <button type="button" onClick={onAbrir} aria-label={`Ver execução de ${nome}`}
      className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 opacity-90 hover:opacity-100">
      <Video base={base} nome={nome} className="w-full h-full object-cover pointer-events-none" />
    </button>
  )
}

/** Animação ampliada dentro do card; um toque fecha. */
export function ExecucaoAmpliada({ nome, onFechar }: { nome: string; onFechar: () => void }) {
  const base = animacaoDe(nome)
  if (!base) return null
  return (
    <button type="button" onClick={onFechar} aria-label="Fechar execução"
      className="block w-full max-w-xs mx-auto mt-3 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
      <Video base={base} nome={nome} className="w-full aspect-square object-cover pointer-events-none" />
    </button>
  )
}
