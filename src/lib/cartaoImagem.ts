// Desenha o cartão de compartilhar (1080×1920, formato de stories) e abre o compartilhamento do celular.
import { quebrarLinhas, SITE, type Cartao } from './cartoesBase'

const L = 1080
const A = 1920
const FONTE = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Logo: quadrado verde com o raio. */
function logo(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const g = ctx.createLinearGradient(x, y, x + t, y + t)
  g.addColorStop(0, '#4ade80'); g.addColorStop(1, '#16a34a')
  ctx.fillStyle = g
  retangulo(ctx, x, y, t, t, t * 0.26); ctx.fill()
  const s = t / 24
  ctx.fillStyle = '#052e16'
  ctx.beginPath()
  ;[[13, 2], [4, 14], [11, 14], [10, 22], [20, 9], [13, 9]].forEach(([px, py], i) => (i ? ctx.lineTo(x + px * s, y + py * s) : ctx.moveTo(x + px * s, y + py * s)))
  ctx.closePath(); ctx.fill()
}

export async function desenharCartao(c: Cartao): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = L; canvas.height = A
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu gerar a imagem.')
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {})

  // Fundo preto com brilho verde
  ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, L, A)
  const brilho = ctx.createRadialGradient(L * 0.8, A * 0.18, 40, L * 0.8, A * 0.18, 900)
  brilho.addColorStop(0, 'rgba(34,197,94,0.45)'); brilho.addColorStop(1, 'rgba(34,197,94,0)')
  ctx.fillStyle = brilho; ctx.fillRect(0, 0, L, A)
  const brilho2 = ctx.createRadialGradient(L * 0.1, A * 0.9, 40, L * 0.1, A * 0.9, 800)
  brilho2.addColorStop(0, 'rgba(132,204,22,0.22)'); brilho2.addColorStop(1, 'rgba(132,204,22,0)')
  ctx.fillStyle = brilho2; ctx.fillRect(0, 0, L, A)

  // Marca
  logo(ctx, 90, 120, 96)
  ctx.fillStyle = '#fafafa'; ctx.font = `800 54px ${FONTE}`; ctx.textBaseline = 'middle'
  ctx.fillText('R2 Fit Pro', 210, 170)

  // Etiqueta
  ctx.font = `800 34px ${FONTE}`
  const larguraEtiqueta = ctx.measureText(c.etiqueta).width + 64
  ctx.fillStyle = 'rgba(34,197,94,0.16)'; retangulo(ctx, 90, 470, larguraEtiqueta, 72, 36); ctx.fill()
  ctx.fillStyle = '#4ade80'; ctx.fillText(c.etiqueta, 122, 507)

  // Emoji e destaque
  ctx.font = `140px ${FONTE}`; ctx.fillText(c.emoji, 84, 680)
  ctx.fillStyle = '#fafafa'
  let tamanho = 150
  ctx.font = `900 ${tamanho}px ${FONTE}`
  let linhas = quebrarLinhas(c.destaque, s => ctx.measureText(s).width, L - 180, 3)
  while (tamanho > 84 && linhas.some(l => ctx.measureText(l).width > L - 180)) {
    tamanho -= 8; ctx.font = `900 ${tamanho}px ${FONTE}`
    linhas = quebrarLinhas(c.destaque, s => ctx.measureText(s).width, L - 180, 3)
  }
  if (linhas.length > 1 && tamanho > 110) { tamanho = 110; ctx.font = `900 ${tamanho}px ${FONTE}`; linhas = quebrarLinhas(c.destaque, s => ctx.measureText(s).width, L - 180, 3) }
  let y = 840
  for (const l of linhas) { ctx.fillText(l, 90, y); y += tamanho * 1.08 }
  ctx.fillStyle = '#a1a1aa'; ctx.font = `600 50px ${FONTE}`
  for (const l of quebrarLinhas(c.subtitulo, s => ctx.measureText(s).width, L - 180, 2)) { y += 10; ctx.fillText(l, 90, y); y += 60 }

  // Indicadores
  const stats = c.stats.slice(0, 3)
  if (stats.length) {
    const gap = 28
    const w = (L - 180 - gap * (stats.length - 1)) / stats.length
    const topo = Math.max(y + 80, 1260)
    stats.forEach((s, i) => {
      const x = 90 + i * (w + gap)
      ctx.fillStyle = 'rgba(39,39,42,0.85)'; retangulo(ctx, x, topo, w, 230, 40); ctx.fill()
      ctx.strokeStyle = 'rgba(63,63,70,0.9)'; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = '#4ade80'; ctx.font = `900 ${s.valor.length > 6 ? 62 : 78}px ${FONTE}`; ctx.textAlign = 'center'
      ctx.fillText(s.valor, x + w / 2, topo + 100)
      ctx.fillStyle = '#a1a1aa'; ctx.font = `600 36px ${FONTE}`
      ctx.fillText(s.rotulo, x + w / 2, topo + 170)
      ctx.textAlign = 'left'
    })
  }

  // Rodapé
  ctx.fillStyle = '#d4d4d8'; ctx.font = `700 44px ${FONTE}`; ctx.textAlign = 'center'
  ctx.fillText('Treino e dieta personalizados com IA', L / 2, A - 210)
  ctx.fillStyle = '#4ade80'; ctx.font = `800 50px ${FONTE}`
  ctx.fillText(SITE, L / 2, A - 140)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'))
}

/** Compartilha pelo menu do celular (WhatsApp, Instagram…); sem suporte, baixa a imagem. */
export async function compartilharImagem(blob: Blob, texto: string, nomeArquivo = 'r2-fit-pro.png'): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  const arquivo = new File([blob], nomeArquivo, { type: 'image/png' })
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], text: texto })
      return 'compartilhado'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
    }
  }
  baixarImagem(blob, nomeArquivo)
  return 'baixado'
}

export function baixarImagem(blob: Blob, nomeArquivo = 'r2-fit-pro.png') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nomeArquivo
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
