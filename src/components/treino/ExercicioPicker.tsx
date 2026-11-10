import { useEffect, useMemo, useRef, useState } from 'react'
import type { Equipamento, ExercicioCatalogo, GrupoMuscular } from '../../data/exercicios'
import { maxExecucao, passoTempo, uid, type ExercicioPlano } from '../../lib/treinoModel'
import { buscarCardio, CARDIO, type Cardio } from '../../data/cardio'
import { Spinner } from '../UI'

type ModuloBusca = typeof import('../../lib/busca') & typeof import('../../data/exercicios')

let moduloCache: Promise<ModuloBusca> | null = null
function carregarModulo(): Promise<ModuloBusca> {
  if (!moduloCache) {
    moduloCache = Promise.all([import('../../lib/busca'), import('../../data/exercicios')])
      .then(([b, d]) => ({ ...b, ...d }))
    moduloCache.catch(() => { moduloCache = null })
  }
  return moduloCache
}

// --- Formulário de séries/reps/carga/descanso ---

const CAMPO = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

function Num({ label, valor, passo, min, max, sufixo, onChange }: {
  label: string; valor: number; passo: number; min: number; max: number; sufixo?: string; onChange: (v: number) => void
}) {
  const lim = (v: number) => Math.min(max, Math.max(min, Math.round(v)))
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(lim(valor - passo))} className="w-10 h-10 shrink-0 rounded-xl bg-zinc-800 text-zinc-100 font-bold">−</button>
        <input type="number" inputMode="numeric" min={min} max={max} value={valor}
          onChange={ev => onChange(lim(+ev.target.value || min))}
          className={`${CAMPO} text-center px-1`} />
        <button type="button" onClick={() => onChange(lim(valor + passo))} className="w-10 h-10 shrink-0 rounded-xl bg-zinc-800 text-zinc-100 font-bold">+</button>
      </div>
      {sufixo && <span className="text-[11px] text-zinc-600">{sufixo}</span>}
    </label>
  )
}

/** Tempo em minutos e segundos (ex.: 1:30), com − e + de 5 em 5 segundos. */
function Tempo({ label, valor, min, max, sufixo, onChange }: {
  label: string; valor: number; min: number; max: number; sufixo?: string; onChange: (seg: number) => void
}) {
  const lim = (v: number) => Math.min(max, Math.max(min, Math.round(v)))
  const m = Math.floor(valor / 60), s = valor % 60
  const num = (v: string) => Math.max(0, Math.round(+v.replace(/\D/g, '') || 0))
  const caixa = `${CAMPO} text-center px-1 w-14`
  return (
    <div className="flex flex-col gap-1.5 col-span-2" role="group" aria-label={label}>
      <span className="text-xs text-zinc-400">{label} <span className="text-zinc-600">(min : seg)</span></span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(passoTempo(valor, -1, min, max))} aria-label={`Diminuir ${label}`} className="w-10 h-10 shrink-0 rounded-xl bg-zinc-800 text-zinc-100 font-bold">−</button>
        <input type="number" inputMode="numeric" min={0} max={Math.floor(max / 60)} value={m} aria-label={`${label}: minutos`}
          onChange={ev => onChange(lim(num(ev.target.value) * 60 + s))} className={caixa} />
        <span className="text-zinc-500 font-bold">:</span>
        <input type="number" inputMode="numeric" min={0} max={59} value={String(s).padStart(2, '0')} aria-label={`${label}: segundos`}
          onChange={ev => onChange(lim(m * 60 + Math.min(59, num(ev.target.value))))} className={caixa} />
        <button type="button" onClick={() => onChange(passoTempo(valor, 1, min, max))} aria-label={`Aumentar ${label}`} className="w-10 h-10 shrink-0 rounded-xl bg-zinc-800 text-zinc-100 font-bold">+</button>
        {sufixo && <span className="text-[11px] text-zinc-600 ml-1 leading-tight">{sufixo}</span>}
      </div>
    </div>
  )
}

export function ExercicioForm({ inicial, titulo, subtitulo, onSalvar, onCancelar, rotuloSalvar }: {
  inicial: ExercicioPlano
  titulo: string
  subtitulo?: string
  rotuloSalvar: string
  onSalvar: (e: ExercicioPlano) => void
  onCancelar: () => void
}) {
  const [e, setE] = useState(inicial)
  const cardio = e.tipo === 'cardio'
  const set = <K extends keyof ExercicioPlano>(k: K, v: ExercicioPlano[K]) => setE(x => ({ ...x, [k]: v }))
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-bold text-zinc-100 text-lg leading-tight">{titulo}</h3>
        {subtitulo && <p className="text-sm text-zinc-500 mt-0.5">{subtitulo}</p>}
      </div>
      {!e.catalogo_id && !cardio && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-zinc-400">Nome do exercício</span>
          <input value={e.nome} onChange={ev => set('nome', ev.target.value)} className={CAMPO} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Num label="Séries" valor={e.series} passo={1} min={1} max={20} sufixo={cardio ? 'rounds' : undefined} onChange={v => set('series', v)} />
        {!cardio && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">Repetições</span>
              <input value={e.repeticoes} onChange={ev => set('repeticoes', ev.target.value)} placeholder="8-12" className={`${CAMPO} h-10`} />
            </label>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-xs text-zinc-400">Carga <span className="text-zinc-600">(opcional)</span></span>
              <input value={e.carga ?? ''} onChange={ev => set('carga', ev.target.value || undefined)} placeholder="Ex.: 20 kg, 2×10 kg, elástico médio" className={CAMPO} />
            </label>
          </>
        )}
        <Tempo label="Execução" valor={e.tempo_execucao_segundos} min={5} max={maxExecucao(e)} sufixo={cardio ? 'cada round' : 'duração de uma série'} onChange={v => set('tempo_execucao_segundos', v)} />
        <Tempo label="Descanso" valor={e.tempo_descanso_segundos} min={0} max={600} sufixo={cardio ? 'entre rounds' : 'entre as séries'} onChange={v => set('tempo_descanso_segundos', v)} />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button onClick={onCancelar} className="py-3 rounded-xl font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">Cancelar</button>
        <button onClick={() => onSalvar({ ...e, nome: e.nome.trim() || 'Exercício' })}
          className="py-3 rounded-xl font-bold bg-green-500 text-zinc-950 hover:bg-green-400">{rotuloSalvar}</button>
      </div>
    </div>
  )
}

export function exercicioDoCatalogo(c: ExercicioCatalogo, grupos: Record<GrupoMuscular, string>): ExercicioPlano {
  const composto = c.tipo === 'composto'
  return {
    id: uid('e'),
    catalogo_id: c.id,
    nome: c.nome,
    grupos_musculares: [grupos[c.grupo], ...c.secundarios.map(g => grupos[g])],
    equipamento: c.equipamento,
    series: composto ? 4 : 3,
    repeticoes: composto ? '8-10' : '10-12',
    tempo_execucao_segundos: composto ? 40 : 35,
    tempo_descanso_segundos: composto ? 90 : 60,
    instrucoes: c.instrucoes,
  }
}

const fmtSeg = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`)

export function exercicioDeCardio(c: Cardio): ExercicioPlano {
  return {
    id: uid('e'), nome: c.nome, grupos_musculares: ['Cardio'], tipo: 'cardio', met: c.met,
    series: c.series, repeticoes: '', tempo_execucao_segundos: c.exec, tempo_descanso_segundos: c.desc, instrucoes: c.dica,
  }
}

// --- Busca com autocomplete ---

export default function ExercicioPicker({ gruposDoTreino, equipamentos, onAdicionar, onFechar }: {
  gruposDoTreino: GrupoMuscular[]
  equipamentos: Equipamento[]
  onAdicionar: (e: ExercicioPlano) => void
  onFechar: () => void
}) {
  const [mod, setMod] = useState<ModuloBusca | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const [q, setQ] = useState('')
  const [soMeus, setSoMeus] = useState(equipamentos.length > 0)
  const [selecionado, setSelecionado] = useState<ExercicioPlano | null>(null)
  const [adicionados, setAdicionados] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const tentar = () => {
    setEstado('carregando')
    carregarModulo().then(m => { setMod(m); setEstado('pronto') }).catch(() => setEstado('erro'))
  }
  useEffect(tentar, [])
  useEffect(() => { if (estado === 'pronto' && !selecionado) inputRef.current?.focus() }, [estado, selecionado])

  // trava a rolagem do fundo
  useEffect(() => {
    const o = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = o }
  }, [])

  const resultados = useMemo(() => {
    if (!mod) return []
    const filtro = { equipamentos: soMeus ? equipamentos : undefined, limite: 40 }
    if (q.trim()) return mod.buscarExercicios(q, filtro)
    // sem texto: sugestões dos grupos deste treino
    const base = mod.buscarExercicios('', { ...filtro, limite: 400 })
    const doTreino = gruposDoTreino.length ? base.filter(e => gruposDoTreino.includes(e.grupo)) : base
    return doTreino.slice(0, 40)
  }, [mod, q, soMeus, equipamentos, gruposDoTreino])

  const escolher = (c: ExercicioCatalogo) => mod && setSelecionado(exercicioDoCatalogo(c, mod.GRUPOS))
  const cardios = useMemo(() => (q.trim() ? buscarCardio(q) : CARDIO), [q])

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onFechar}>
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg h-[92dvh] sm:h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()} translate="no" role="dialog" aria-label="Adicionar exercício">
        {selecionado ? (
          <div className="p-5 overflow-y-auto">
            <ExercicioForm inicial={selecionado} titulo={selecionado.nome}
              subtitulo={selecionado.grupos_musculares.join(' · ')}
              rotuloSalvar="Adicionar ao treino"
              onCancelar={() => setSelecionado(null)}
              onSalvar={e => { onAdicionar(e); setAdicionados(a => [...a, e.nome]); setSelecionado(null); setQ('') }} />
          </div>
        ) : (
          <>
            <div className="p-4 pb-3 border-b border-zinc-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-zinc-100 text-lg">Adicionar exercícios</h3>
                <button onClick={onFechar} className="text-sm font-semibold text-green-400 px-2 py-1">Concluir</button>
              </div>
              <div className="relative">
                <svg className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} type="search" autoComplete="off"
                  placeholder="Buscar por nome, músculo ou equipamento" aria-label="Buscar exercício"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-3 py-3 text-zinc-100 placeholder-zinc-500 text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                {equipamentos.length > 0 ? (
                  <label className="flex items-center gap-2 text-zinc-400 cursor-pointer select-none">
                    <input type="checkbox" checked={soMeus} onChange={e => setSoMeus(e.target.checked)} className="accent-green-500 w-4 h-4" />
                    Só meus equipamentos
                  </label>
                ) : <span />}
                {adicionados.length > 0 && <span className="text-green-400">✓ {adicionados.length} adicionado{adicionados.length > 1 ? 's' : ''}</span>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {estado === 'carregando' && <div className="flex flex-col items-center gap-2 py-12 text-sm text-zinc-500"><Spinner />Carregando catálogo...</div>}
              {estado === 'erro' && (
                <div className="text-center py-12 px-6">
                  <p className="text-zinc-300 font-semibold">Catálogo indisponível</p>
                  <p className="text-sm text-zinc-500 mt-1">Verifique sua conexão e tente novamente.</p>
                  <button onClick={tentar} className="mt-4 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-semibold">Tentar novamente</button>
                </div>
              )}
              {estado === 'pronto' && !q.trim() && (
                <section aria-label="Cardio e HIIT" className="pt-3">
                  <p className="px-4 pb-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Cardio e HIIT · com contador</p>
                  <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 overscroll-contain">
                    {CARDIO.map(c => (
                      <button key={c.id} onClick={() => setSelecionado(exercicioDeCardio(c))}
                        className="shrink-0 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:border-green-500/50 whitespace-nowrap">
                        {c.icone} {c.nome}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {estado === 'pronto' && !q.trim() && (
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                  {gruposDoTreino.length ? 'Sugestões para este treino' : 'Exercícios do catálogo'}
                </p>
              )}
              {estado === 'pronto' && q.trim() && cardios.length > 0 && (
                <ul className="divide-y divide-zinc-800/70 border-b border-zinc-800/70" aria-label="Cardio e HIIT encontrados">
                  {cardios.map(c => (
                    <li key={c.id}>
                      <button onClick={() => setSelecionado(exercicioDeCardio(c))} className="w-full text-left px-4 py-3 hover:bg-zinc-900 active:bg-zinc-900 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-100 font-medium truncate">{c.icone} {c.nome}</p>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            <span className="text-green-400/90">Cardio · HIIT</span> · {c.series > 1 ? `${c.series} × ${fmtSeg(c.exec)} / ${fmtSeg(c.desc)} descanso` : fmtSeg(c.exec)}
                          </p>
                        </div>
                        <span className="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-lg shrink-0">+</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {estado === 'pronto' && resultados.length === 0 && !(q.trim() && cardios.length) && (
                <div className="text-center py-10 px-6">
                  <p className="text-zinc-300 font-semibold">Nenhum exercício encontrado para "{q}"</p>
                  <p className="text-sm text-zinc-500 mt-1">
                    {soMeus ? 'Tente desmarcar "Só meus equipamentos" ou ' : 'Tente '}usar outro termo, músculo ou equipamento.
                  </p>
                  {q.trim().length >= 3 && (
                    <button onClick={() => setSelecionado({
                      id: uid('e'), nome: q.trim(), grupos_musculares: [], series: 3, repeticoes: '10-12',
                      tempo_execucao_segundos: 40, tempo_descanso_segundos: 60,
                    })} className="mt-4 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-semibold">
                      Adicionar "{q.trim()}" como exercício personalizado
                    </button>
                  )}
                </div>
              )}
              {estado === 'pronto' && mod && (
                <ul className="divide-y divide-zinc-800/70">
                  {resultados.map(r => (
                    <li key={r.id}>
                      <button onClick={() => escolher(r)} className="w-full text-left px-4 py-3 hover:bg-zinc-900 active:bg-zinc-900 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-100 font-medium truncate">{r.nome}</p>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            <span className="text-green-400/90">{mod.GRUPOS[r.grupo]}</span> · {mod.EQUIPAMENTOS[r.equipamento]}
                            {r.tipo === 'composto' ? ' · composto' : ' · isolado'}
                          </p>
                        </div>
                        <span className="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-lg shrink-0">+</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
