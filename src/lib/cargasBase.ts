// Histórico de carga por exercício: lógica pura (testada em tests/logica.test.ts).
// Cada sessão guarda em `detalhes` a carga, as repetições e as séries feitas de cada exercício.
// O exercício é identificado pelo catálogo (ou pelo nome), então o histórico continua mesmo se o plano mudar.
import { normalizar } from './busca'

export interface PontoCarga { data: string; kg: number | null; carga: string; reps: string; series: number }
export interface SessaoComDetalhes { data_inicio: string; detalhes?: Record<string, { nome: string; catalogo_id?: string; carga?: string; reps?: string; series: number }> | null }

/** Identificador do exercício no histórico (catálogo ou nome). */
export const chaveExercicio = (e: { catalogo_id?: string; nome: string }) => (e.catalogo_id ? `c:${e.catalogo_id}` : `n:${normalizar(e.nome)}`)

/** Quilos de uma carga escrita ("40 kg", "40", "2×20 kg" = 20 por halter, "90 lb"). */
export function kgDe(carga?: string): number | null {
  const c = (carga ?? '').replace(',', '.').trim()
  if (!c) return null
  const par = c.match(/^\d+\s*[x×]\s*(\d+(?:\.\d+)?)/i)
  const m = par ? [par[0], par[1]] : c.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  let v = parseFloat(m[1])
  if (/\b(lb|lbs|libras?)\b/i.test(c)) v *= 0.4536
  return v > 0 && v < 1000 ? Math.round(v * 10) / 10 : null
}

const dataLocal = (ts: string) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Histórico de cada exercício, do mais antigo ao mais novo (um ponto por dia, o de maior carga). */
export function historicoCargas(sessoes: SessaoComDetalhes[]): Map<string, PontoCarga[]> {
  const mapa = new Map<string, Map<string, PontoCarga>>()
  for (const s of sessoes) {
    for (const d of Object.values(s.detalhes ?? {})) {
      if (!d?.nome || !d.series) continue
      const chave = chaveExercicio(d)
      const data = dataLocal(s.data_inicio)
      const ponto: PontoCarga = { data, kg: kgDe(d.carga), carga: d.carga ?? '', reps: d.reps ?? '', series: d.series }
      const porDia = mapa.get(chave) ?? new Map<string, PontoCarga>()
      const antes = porDia.get(data)
      if (!antes || (ponto.kg ?? 0) > (antes.kg ?? 0) || ((ponto.kg ?? 0) === (antes.kg ?? 0) && ponto.series > antes.series)) porDia.set(data, ponto)
      mapa.set(chave, porDia)
    }
  }
  return new Map([...mapa].map(([k, v]) => [k, [...v.values()].sort((a, b) => a.data.localeCompare(b.data))]))
}

const fmtKg = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
/** Próximo degrau de carga: 1 kg até 10 kg, 2 kg até 40 kg, 2,5 kg acima. */
export const degrau = (kg: number) => (kg < 10 ? 1 : kg < 40 ? 2 : 2.5)

export interface ResumoCarga {
  ultima?: PontoCarga
  recorde?: { kg: number; data: string }
  /** sugestão de progressão: completou todas as séries nas 2 últimas vezes com a mesma carga */
  sugestao?: { kg: number; carga: string; texto: string }
}

/**
 * Resumo para o card do exercício: a última vez (antes de hoje), o recorde e a sugestão de subir a carga.
 * Sobe só quando a pessoa completou todas as séries nas duas últimas vezes com a mesma carga (progressão segura).
 */
export function resumoCarga(pontos: PontoCarga[] | undefined, seriesPrevistas: number, hoje: string): ResumoCarga {
  const antes = (pontos ?? []).filter(p => p.data < hoje)
  if (!antes.length) return {}
  const ultima = antes[antes.length - 1]
  const comKg = antes.filter(p => p.kg != null)
  const max = comKg.reduce<PontoCarga | null>((m, p) => (!m || (p.kg ?? 0) > (m.kg ?? 0) ? p : m), null)
  const r: ResumoCarga = { ultima, ...(max?.kg ? { recorde: { kg: max.kg, data: max.data } } : {}) }
  const [a, b] = antes.slice(-2)
  if (a && b && a.kg != null && a.kg === b.kg && a.series >= seriesPrevistas && b.series >= seriesPrevistas) {
    const kg = Math.round((b.kg + degrau(b.kg)) * 10) / 10
    const halteres = b.carga.match(/^(\d+)\s*[x×]/i)
    r.sugestao = { kg, carga: halteres ? `${halteres[1]}×${fmtKg(kg)}` : fmtKg(kg), texto: `Você completou todas as séries com ${fmtKg(b.kg)} nas 2 últimas vezes` }
  }
  return r
}

/** Recordes batidos: datas em que a carga passou de todas as anteriores (para as conquistas). */
export function recordesBatidos(pontos: PontoCarga[]): string[] {
  let max = 0
  const out: string[] = []
  pontos.forEach((p, i) => { if (p.kg != null) { if (i > 0 && max > 0 && p.kg > max) out.push(p.data); max = Math.max(max, p.kg) } })
  return out
}

export const textoKg = fmtKg
