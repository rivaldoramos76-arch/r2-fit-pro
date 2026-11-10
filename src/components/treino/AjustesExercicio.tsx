import { useEffect, useRef, useState } from 'react'
import type { ExercicioPlano } from '../../lib/treinoModel'

type Valores = Pick<ExercicioPlano, 'series' | 'repeticoes' | 'tempo_execucao_segundos' | 'tempo_descanso_segundos' | 'carga'>
const valoresDe = (e: ExercicioPlano): Valores => ({
  series: e.series, repeticoes: e.repeticoes, tempo_execucao_segundos: e.tempo_execucao_segundos,
  tempo_descanso_segundos: e.tempo_descanso_segundos, carga: e.carga,
})
const iguais = (a: Valores, b: Valores) =>
  a.series === b.series && a.repeticoes === b.repeticoes && a.tempo_execucao_segundos === b.tempo_execucao_segundos &&
  a.tempo_descanso_segundos === b.tempo_descanso_segundos && (a.carga || '') === (b.carga || '')

const lim = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)))
const soNumero = (v: string) => Math.max(0, Math.round(+v.replace(/\D/g, '') || 0))
export const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** "1:30" → 90; "130" → 90 (min e seg sem os dois-pontos); "45" → 45; "90" → 90. Null se não der para ler. */
export function lerTempo(t: string): number | null {
  const v = t.trim()
  const m = v.match(/^(\d{1,2})\s*[:'.,h]\s*(\d{1,2})$/)
  if (m) return +m[1] * 60 + Math.min(59, +m[2])
  if (!/^\d{1,4}$/.test(v)) return null
  if (v.length <= 2) return +v
  return +v.slice(0, -2) * 60 + Math.min(59, +v.slice(-2))
}

/** "10" → ±1; "8-12" → desloca a faixa inteira. Devolve null se não for número nem faixa. */
export function passoReps(reps: string, delta: number): string | null {
  const m = reps.trim().match(/^(\d+)\s*(?:([-–a])\s*(\d+))?$/)
  if (!m) return null
  const a = +m[1], b = m[3] ? +m[3] : null
  if (b === null) return String(Math.max(1, a + delta))
  if (a + delta < 1) return reps
  return `${a + delta}-${b + delta}`
}

const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`
/** Carga em kg com passo de 1 kg: "20 kg" → "21 kg"; "2×10 kg" muda o peso de cada um; vazio sobe a partir de 1 kg; abaixo de 1 kg fica sem carga. Devolve null para texto livre (ex.: "elástico médio"). */
export function passoCarga(carga: string | undefined, delta: number): string | null {
  const c = (carga ?? '').trim()
  if (!c) return delta > 0 ? kg(delta) : null
  const num = (x: string) => +x.replace(',', '.')
  const par = c.match(/^(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?$/i)
  if (par) { const v = num(par[2]) + delta; return v < 1 ? c : `${par[1]}×${kg(v)}` }
  const um = c.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg)?$/i)
  if (!um) return null
  const v = num(um[1]) + delta
  return v < 1 ? '' : kg(v)
}
/** Número digitado sem unidade vira "N kg" ao salvar. */
const normalizarCarga = (c: string | undefined) => {
  const t = (c ?? '').trim()
  if (!t) return undefined
  return /^\d+(?:[.,]\d+)?$/.test(t) ? kg(+t.replace(',', '.')) : t
}

const SETA = 'w-full h-7 rounded-md text-[10px] text-zinc-400 bg-zinc-900/80 active:bg-zinc-700 disabled:opacity-25'
const CAIXA = 'w-full h-8 rounded-md bg-zinc-950 border border-zinc-700/80 text-center text-base font-semibold text-zinc-100 px-0.5 focus:outline-none focus:border-green-500'

/**
 * Uma coluna: rótulo, seta para cima, campo digitável, seta para baixo.
 * `aoSair` (opcional) confirma o texto só ao sair do campo / Enter — usado no tempo, que se digita em partes.
 */
function Coluna({ titulo, rotulo, valor, onTexto, aoSair, onMais, onMenos, podeMais = true, podeMenos = true, teclado = 'text' }: {
  titulo: string; rotulo: string; valor: string; onTexto?: (v: string) => void; aoSair?: (v: string) => void
  onMais: () => void; onMenos: () => void; podeMais?: boolean; podeMenos?: boolean; teclado?: 'text' | 'numeric'
}) {
  const [rascunho, setRascunho] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span className="text-[9px] text-zinc-500 uppercase tracking-tight leading-none mb-0.5 truncate max-w-full">{titulo}</span>
      <button type="button" onClick={onMais} disabled={!podeMais} aria-label={`Aumentar ${rotulo}`} className={SETA}>▲</button>
      <input aria-label={rotulo} inputMode={teclado} className={CAIXA}
        value={rascunho ?? valor}
        onFocus={e => { if (aoSair) setRascunho(valor); e.target.select() }}
        onChange={e => (aoSair ? setRascunho(e.target.value) : onTexto?.(e.target.value))}
        onBlur={() => { if (aoSair && rascunho !== null) { aoSair(rascunho); setRascunho(null) } }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <button type="button" onClick={onMenos} disabled={!podeMenos} aria-label={`Diminuir ${rotulo}`} className={SETA}>▼</button>
    </div>
  )
}

/**
 * Séries, repetições, execução, descanso e carga lado a lado, com setas e digitação. Salva sozinho
 * pouco depois da última mudança (e ao sair da tela), sem botão de salvar.
 */
export default function AjustesExercicio({ ex, onSalvar }: { ex: ExercicioPlano; onSalvar: (e: ExercicioPlano) => void }) {
  const [v, setV] = useState<Valores>(() => valoresDe(ex))
  const pendente = useRef<ExercicioPlano | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const salvarRef = useRef(onSalvar); salvarRef.current = onSalvar

  // Mudança vinda de fora (outro aparelho, contador) só entra se não houver edição esperando para salvar
  useEffect(() => { if (!pendente.current) setV(valoresDe(ex)) }, [ex])

  const mudar = (patch: Partial<Valores>) => setV(atual => {
    const novo = { ...atual, ...patch }
    if (!iguais(novo, atual)) {
      pendente.current = { ...ex, ...novo, carga: normalizarCarga(novo.carga) }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { const p = pendente.current; pendente.current = null; if (p) salvarRef.current(p) }, 700)
    }
    return novo
  })
  useEffect(() => () => { clearTimeout(timer.current); const p = pendente.current; pendente.current = null; if (p) salvarRef.current(p) }, [])

  const repsMais = passoReps(v.repeticoes, 1), repsMenos = passoReps(v.repeticoes, -1)
  const cargaMais = passoCarga(v.carga, 1), cargaMenos = passoCarga(v.carga, -1)
  const tempo = (campo: 'tempo_execucao_segundos' | 'tempo_descanso_segundos', titulo: string, passo: number, min: number) => {
    const t = v[campo]
    return (
      <Coluna titulo={titulo} rotulo={titulo} valor={mss(t)} teclado="numeric"
        aoSair={txt => { const s = lerTempo(txt); if (s !== null) mudar({ [campo]: lim(s, min, 600) }) }}
        onMais={() => mudar({ [campo]: lim(t + passo, min, 600) })} onMenos={() => mudar({ [campo]: lim(t - passo, min, 600) })}
        podeMais={t < 600} podeMenos={t > min} />
    )
  }
  return (
    <div className="grid gap-1.5 mt-2.5" style={{ gridTemplateColumns: '0.8fr 1.1fr 1.1fr 1.1fr 1.35fr' }} translate="no">
      <Coluna titulo="Séries" rotulo="Séries" valor={String(v.series)} teclado="numeric"
        onTexto={t => mudar({ series: lim(soNumero(t) || 1, 1, 20) })}
        onMais={() => mudar({ series: lim(v.series + 1, 1, 20) })} onMenos={() => mudar({ series: lim(v.series - 1, 1, 20) })}
        podeMais={v.series < 20} podeMenos={v.series > 1} />
      <Coluna titulo="Reps" rotulo="Repetições" valor={v.repeticoes}
        onTexto={t => mudar({ repeticoes: t.slice(0, 20) })}
        onMais={() => repsMais && mudar({ repeticoes: repsMais })} onMenos={() => repsMenos && mudar({ repeticoes: repsMenos })}
        podeMais={!!repsMais} podeMenos={!!repsMenos && repsMenos !== v.repeticoes} />
      {tempo('tempo_execucao_segundos', 'Execução', 5, 5)}
      {tempo('tempo_descanso_segundos', 'Descanso', 15, 0)}
      <Coluna titulo="Carga" rotulo="Carga" valor={v.carga ?? ''}
        onTexto={t => mudar({ carga: t.slice(0, 40) })}
        onMais={() => cargaMais !== null && mudar({ carga: cargaMais })} onMenos={() => cargaMenos !== null && mudar({ carga: cargaMenos })}
        podeMais={cargaMais !== null} podeMenos={!!v.carga?.trim() && cargaMenos !== null} />
    </div>
  )
}
