import { useEffect, useState } from 'react'
import type { PontoPeso } from '../../lib/exercicios'

const dataCurta = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const tempo = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime() }

/** Linha suave (curva de Catmull-Rom convertida em Bézier). */
function caminho(p: [number, number][]): string {
  if (p.length < 2) return p.length ? `M${p[0][0]},${p[0][1]}` : ''
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** Gráfico do peso no período, com linha da meta e desenho animado. `mini` vira um sparkline. */
export default function GraficoPeso({ pontos, meta, mini = false }: { pontos: PontoPeso[]; meta?: number | null; mini?: boolean }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setMontado(true)); return () => cancelAnimationFrame(r) }, [])
  const p = [...pontos].sort((a, b) => a.data.localeCompare(b.data))
  const W = mini ? 120 : 340, H = mini ? 40 : 190
  const pad = mini ? { l: 2, r: 2, t: 4, b: 4 } : { l: 36, r: 14, t: 16, b: 26 }
  if (!p.length) return null
  const valores = p.map(x => x.peso_kg).concat(meta && !mini ? [meta] : [])
  let min = Math.min(...valores), max = Math.max(...valores)
  if (max - min < 2) { const meio = (max + min) / 2; min = meio - 1; max = meio + 1 }
  min -= (max - min) * 0.08; max += (max - min) * 0.08
  const t0 = tempo(p[0].data), t1 = tempo(p[p.length - 1].data)
  const x = (iso: string) => pad.l + (t1 === t0 ? 0.5 : (tempo(iso) - t0) / (t1 - t0)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const pts = p.map(q => [x(q.data), y(q.peso_kg)] as [number, number])
  const linha = caminho(pts)
  const area = `${linha} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`
  const ultimo = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={mini ? 'w-28 h-10' : 'w-full h-auto'} role="img"
      aria-label={`Peso de ${kg(p[0].peso_kg)} kg em ${dataCurta(p[0].data)} a ${kg(p[p.length - 1].peso_kg)} kg em ${dataCurta(p[p.length - 1].data)}`}>
      <defs>
        <linearGradient id={mini ? 'peso-area-mini' : 'peso-area'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" /><stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {!mini && [0, 0.5, 1].map(f => {
        const v = min + (max - min) * (1 - f)
        return <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#27272a" strokeWidth="1" />
          <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#71717a">{kg(v)}</text>
        </g>
      })}
      {meta && !mini && <g>
        <line x1={pad.l} x2={W - pad.r} y1={y(meta)} y2={y(meta)} stroke="#a3e635" strokeWidth="1.2" strokeDasharray="4 4" />
        <text x={W - pad.r} y={y(meta) - 4} textAnchor="end" fontSize="10" fill="#a3e635">meta {kg(meta)} kg</text>
      </g>}
      <path d={area} fill={`url(#${mini ? 'peso-area-mini' : 'peso-area'})`} style={{ opacity: montado ? 1 : 0, transition: 'opacity 0.8s' }} />
      <path d={linha} fill="none" stroke="#22c55e" strokeWidth={mini ? 2 : 2.5} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray="1" strokeDashoffset={montado ? 0 : 1} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)' }} />
      {!mini && pts.length <= 40 && pts.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="2.5" fill="#09090b" stroke="#22c55e" strokeWidth="1.5" />)}
      <circle cx={ultimo[0]} cy={ultimo[1]} r={mini ? 2.5 : 4.5} fill="#22c55e" />
      {!mini && <>
        <text x={pad.l} y={H - 8} fontSize="10" fill="#71717a">{dataCurta(p[0].data)}</text>
        <text x={W - pad.r} y={H - 8} fontSize="10" fill="#71717a" textAnchor="end">{dataCurta(p[p.length - 1].data)}</text>
      </>}
    </svg>
  )
}
