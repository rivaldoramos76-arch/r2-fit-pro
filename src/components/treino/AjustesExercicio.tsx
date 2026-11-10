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

const SETA = 'w-full h-7 rounded-md text-zinc-300 bg-zinc-900/70 active:bg-zinc-700 disabled:opacity-25 text-xs leading-none'
const CAIXA = 'w-full h-9 rounded-md bg-zinc-950 border border-zinc-700 text-center text-base font-semibold text-zinc-100 focus:outline-none focus:border-green-500'

/** Coluna com seta para cima, campo digitável e seta para baixo. */
function Passo({ rotulo, valor, onTexto, onMais, onMenos, largura = 'w-12', numerico = true, podeMais = true, podeMenos = true }: {
  rotulo: string; valor: string; onTexto: (v: string) => void; onMais: () => void; onMenos: () => void
  largura?: string; numerico?: boolean; podeMais?: boolean; podeMenos?: boolean
}) {
  return (
    <div className={`flex flex-col items-center gap-1 ${largura}`}>
      <button type="button" onClick={onMais} disabled={!podeMais} aria-label={`Aumentar ${rotulo}`} className={SETA}>▲</button>
      <input value={valor} onChange={e => onTexto(e.target.value)} aria-label={rotulo} onFocus={e => e.target.select()}
        inputMode={numerico ? 'numeric' : 'text'} className={CAIXA} />
      <button type="button" onClick={onMenos} disabled={!podeMenos} aria-label={`Diminuir ${rotulo}`} className={SETA}>▼</button>
    </div>
  )
}

/** Minutos : segundos, cada um com setas. Setas de segundos andam de 5 em 5 (passando para o minuto seguinte). */
function Tempo({ rotulo, total, min, max, onChange }: { rotulo: string; total: number; min: number; max: number; onChange: (s: number) => void }) {
  const m = Math.floor(total / 60), s = total % 60
  return (
    <div className="flex items-center justify-center gap-1" role="group" aria-label={rotulo}>
      <Passo rotulo={`${rotulo}: minutos`} valor={String(m)} onTexto={v => onChange(lim(soNumero(v) * 60 + s, min, max))}
        onMais={() => onChange(lim(total + 60, min, max))} onMenos={() => onChange(lim(total - 60, min, max))}
        podeMais={total + 60 <= max} podeMenos={total - 60 >= min} />
      <span className="text-zinc-500 font-bold pt-0.5">:</span>
      <Passo rotulo={`${rotulo}: segundos`} valor={String(s).padStart(2, '0')} onTexto={v => onChange(lim(m * 60 + Math.min(59, soNumero(v)), min, max))}
        onMais={() => onChange(lim(total + 5, min, max))} onMenos={() => onChange(lim(total - 5, min, max))}
        podeMais={total < max} podeMenos={total > min} />
    </div>
  )
}

/**
 * Séries, repetições, execução, descanso e carga (com setas e digitação) editáveis direto no card. Salva sozinho
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
  const bloco = 'bg-zinc-800/60 rounded-xl px-2 pt-1.5 pb-2 flex flex-col items-center gap-1 min-w-0'
  const titulo = 'text-[10px] text-zinc-500 uppercase tracking-wide'
  return (
    <div className="mt-3 flex flex-col gap-2" translate="no">
      <div className="grid grid-cols-2 gap-2">
        <div className={bloco}>
          <span className={titulo}>Séries</span>
          <Passo rotulo="Séries" valor={String(v.series)} onTexto={t => mudar({ series: lim(soNumero(t) || 1, 1, 20) })}
            onMais={() => mudar({ series: lim(v.series + 1, 1, 20) })} onMenos={() => mudar({ series: lim(v.series - 1, 1, 20) })}
            podeMais={v.series < 20} podeMenos={v.series > 1} />
        </div>
        <div className={bloco}>
          <span className={titulo}>Reps</span>
          <Passo rotulo="Repetições" valor={v.repeticoes} numerico={false} largura="w-20"
            onTexto={t => mudar({ repeticoes: t.slice(0, 20) })}
            onMais={() => repsMais && mudar({ repeticoes: repsMais })} onMenos={() => repsMenos && mudar({ repeticoes: repsMenos })}
            podeMais={!!repsMais} podeMenos={!!repsMenos && repsMenos !== v.repeticoes} />
        </div>
        <div className={bloco}>
          <span className={titulo}>Execução <span className="normal-case tracking-normal text-zinc-600">min : seg</span></span>
          <Tempo rotulo="Execução" total={v.tempo_execucao_segundos} min={5} max={600} onChange={s => mudar({ tempo_execucao_segundos: s })} />
        </div>
        <div className={bloco}>
          <span className={titulo}>Descanso <span className="normal-case tracking-normal text-zinc-600">min : seg</span></span>
          <Tempo rotulo="Descanso" total={v.tempo_descanso_segundos} min={0} max={600} onChange={s => mudar({ tempo_descanso_segundos: s })} />
        </div>
        <div className={`${bloco} col-span-2`}>
          <span className={titulo}>Carga <span className="normal-case tracking-normal text-zinc-600">kg · opcional</span></span>
          <Passo rotulo="Carga" valor={v.carga ?? ''} numerico={false} largura="w-28"
            onTexto={t => mudar({ carga: t.slice(0, 40) })}
            onMais={() => { const c = passoCarga(v.carga, 1); if (c !== null) mudar({ carga: c }) }}
            onMenos={() => { const c = passoCarga(v.carga, -1); if (c !== null) mudar({ carga: c }) }}
            podeMais={passoCarga(v.carga, 1) !== null} podeMenos={!!v.carga?.trim() && passoCarga(v.carga, -1) !== null} />
        </div>
      </div>
    </div>
  )
}
