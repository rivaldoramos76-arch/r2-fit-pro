import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flame, Plus, Trash2, Search, Sparkles, ChevronLeft, Minus, Timer } from 'lucide-react'
import { ATIVIDADES, caloriasExercicio, PESO_PADRAO } from '../../lib/exercicios'
import type { Atividade } from '../../lib/exercicios'
import { exerciciosDoDia, adicionarExercicio, removerExercicio, estimarExercicio } from '../../lib/progresso'
import type { Exercicio } from '../../lib/progresso'
import { semAcento } from '../../lib/alimentosBase'
import { Button, Textarea } from '../UI'
import { Folha } from '../nutricao/AdicionarAlimento'
import { fmt } from '../nutricao/Graficos'
import { useContadorTreino } from '../treino/ContadorTreino'
import { passoTempo, type ExercicioPlano } from '../../lib/treinoModel'

/** Séries, execução e descanso sugeridos para o contador de cada atividade (ex.: boxe 10 × 30 s / 30 s). */
function intervaloPadrao(a: Atividade): { series: number; exec: number; desc: number } {
  if (a.id === 'pular-corda') return { series: 10, exec: 60, desc: 30 }
  if (a.id.startsWith('corrida') || a.id === 'remo' || a.id === 'escada') return { series: 8, exec: 60, desc: 60 }
  if (a.id.startsWith('bike') || a.id === 'spinning' || a.id === 'eliptico') return { series: 10, exec: 30, desc: 30 }
  if (a.id.startsWith('musculacao')) return { series: 4, exec: 40, desc: 60 }
  return { series: 10, exec: 30, desc: 30 }
}
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const lerPref = () => { try { return localStorage.getItem('r2-diario-contador') === '1' } catch { return false } }
const gravarPref = (v: boolean) => { try { localStorage.setItem('r2-diario-contador', v ? '1' : '0') } catch { /* sem armazenamento */ } }

function Passo({ rotulo, valor, onMenos, onMais, podeMenos, podeMais }: {
  rotulo: string; valor: string; onMenos: () => void; onMais: () => void; podeMenos: boolean; podeMais: boolean
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={rotulo}>
      <span className="flex-1 text-sm text-zinc-300">{rotulo}</span>
      <button type="button" onClick={onMenos} disabled={!podeMenos} aria-label={`Diminuir ${rotulo}`} className="w-10 h-9 rounded-lg bg-zinc-900 text-zinc-300 text-xs active:bg-zinc-700 disabled:opacity-30">▼</button>
      <span className="w-14 text-center text-lg font-bold tabular-nums text-zinc-50">{valor}</span>
      <button type="button" onClick={onMais} disabled={!podeMais} aria-label={`Aumentar ${rotulo}`} className="w-10 h-9 rounded-lg bg-zinc-900 text-zinc-300 text-xs active:bg-zinc-700 disabled:opacity-30">▲</button>
    </div>
  )
}

const DURACOES = [15, 30, 45, 60, 90]

/** Exercícios do dia no diário: lista, total queimado e folha para adicionar. */
export default function Exercicios({ userId, data, pesoKg, somarExercicio, onMudou }: {
  userId: string; data: string; pesoKg: number | null; somarExercicio: boolean; onMudou: (totalKcal: number) => void
}) {
  const [itens, setItens] = useState<Exercicio[] | null>(null)
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(() => {
    exerciciosDoDia(userId, data).then(l => { setItens(l); onMudou(l.reduce((s, e) => s + e.calorias, 0)) }).catch(() => setItens([]))
  }, [userId, data, onMudou])
  useEffect(() => { carregar() }, [carregar])

  const total = (itens ?? []).reduce((s, e) => s + e.calorias, 0)
  const remover = async (id: string) => {
    if (!confirm('Remover este exercício?')) return
    await removerExercicio(id).catch(() => {})
    carregar()
  }

  return (
    <section id="exercicio" aria-label="Exercício" className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h2 className="font-semibold text-zinc-100 flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400" />Exercício</h2>
        <span className="text-sm font-semibold tabular-nums text-zinc-300">{fmt(total)} <span className="text-xs font-normal text-zinc-500">kcal</span></span>
      </div>
      {itens && itens.length > 0 && (
        <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
          {itens.map(e => (
            <li key={e.id} className="flex items-center gap-2 pl-4 pr-2 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-100 truncate">{e.nome}</p>
                <p className="text-xs text-zinc-500">{e.duracao_min} min{e.origem === 'ia' ? ' · estimado pela IA' : e.origem === 'treino' ? ' · do seu treino (estimado)' : ''}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-orange-300">{fmt(e.calorias)}</span>
              <button onClick={() => remover(e.id)} aria-label={`Remover ${e.nome}`} className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {itens && itens.length > 0 && !somarExercicio && (
        <p className="px-4 pb-2 text-[11px] text-zinc-500">Calorias queimadas não aumentam sua meta (dá para mudar em Meta diária).</p>
      )}
      <button onClick={() => setAberto(true)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-orange-300 hover:bg-orange-500/5 border-t border-zinc-800/70 transition">
        <Plus className="w-4 h-4" />Adicionar exercício
      </button>
      {aberto && <FolhaExercicio userId={userId} data={data} pesoKg={pesoKg} onClose={() => setAberto(false)} onSalvo={() => { setAberto(false); carregar() }} />}
    </section>
  )
}

function FolhaExercicio({ userId, data, pesoKg, onClose, onSalvo }: {
  userId: string; data: string; pesoKg: number | null; onClose: () => void; onSalvo: () => void
}) {
  const [aba, setAba] = useState<'lista' | 'ia'>('lista')
  const [busca, setBusca] = useState('')
  const [escolhida, setEscolhida] = useState<Atividade | null>(null)
  const [minutos, setMinutos] = useState(30)
  const [texto, setTexto] = useState('')
  const [estimativa, setEstimativa] = useState<{ nome: string; duracao_min: number; calorias: number } | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const peso = pesoKg ?? PESO_PADRAO
  // Contador de intervalos (boxe 30 s / 30 s, HIIT, tiros…): mesmo contador do treino; no fim grava o tempo feito
  const [comContador, setComContador] = useState(lerPref)
  const [intervalo, setIntervalo] = useState({ series: 10, exec: 30, desc: 30 })
  const [salvouPeloContador, setSalvouPeloContador] = useState(false)
  const exContador: ExercicioPlano | null = escolhida ? {
    id: `avulso-${escolhida.id}`, nome: escolhida.nome.replace(/\s*\(.*\)$/, ''), grupos_musculares: [], tipo: 'cardio', met: escolhida.met,
    series: intervalo.series, repeticoes: '', tempo_execucao_segundos: intervalo.exec, tempo_descanso_segundos: intervalo.desc,
  } : null
  const contador = useContadorTreino({
    user: { id: userId }, treino: null, diaIdx: 0, dia: exContador ? { dia: 'diário', exercicios: [exContador] } : null, onSessao: () => {},
    avulso: async (ex, feitas) => {
      const seg = feitas * ex.tempo_execucao_segundos + Math.max(0, feitas - 1) * ex.tempo_descanso_segundos
      const min = seg / 60
      const kcal = caloriasExercicio(escolhida?.met ?? 8, peso, min)
      const nome = `${escolhida?.nome ?? ex.nome} · ${feitas} × ${mss(ex.tempo_execucao_segundos)}${ex.tempo_descanso_segundos ? ` / ${mss(ex.tempo_descanso_segundos)}` : ''}`
      await adicionarExercicio(userId, { nome: nome.slice(0, 100), duracao_min: Math.max(1, Math.round(min)), calorias: kcal, origem: 'lista', data })
      setSalvouPeloContador(true)
      return `No diário: ${Math.max(1, Math.round(min))} min · ${fmt(kcal)} kcal`
    },
    aoFechar: () => { if (salvouPeloContador) onSalvo() },
  })
  const escolher = (a: Atividade) => { setEscolhida(a); setMinutos(a.id.startsWith('musculacao') ? 60 : 30); setIntervalo(intervaloPadrao(a)) }
  const alternarContador = () => { setComContador(v => { gravarPref(!v); return !v }) }

  const lista = useMemo(() => {
    const q = semAcento(busca.trim())
    return q ? ATIVIDADES.filter(a => semAcento(a.nome).includes(q)) : ATIVIDADES
  }, [busca])

  const salvar = async (e: Omit<Exercicio, 'id' | 'data'>) => {
    setErro(''); setCarregando(true)
    try { await adicionarExercicio(userId, { ...e, data }); onSalvo() }
    catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível salvar'); setCarregando(false) }
  }
  const estimar = async () => {
    setErro(''); setCarregando(true)
    try { setEstimativa(await estimarExercicio(texto, peso)) }
    catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível estimar') }
    finally { setCarregando(false) }
  }

  if (escolhida) {
    const kcal = caloriasExercicio(escolhida.met, peso, minutos)
    const segIntervalo = intervalo.series * intervalo.exec + (intervalo.series - 1) * intervalo.desc
    const kcalIntervalo = caloriasExercicio(escolhida.met, peso, segIntervalo / 60)
    const chave = (
      <button type="button" role="switch" aria-checked={comContador} aria-label="Usar contador" onClick={alternarContador}
        className="w-full mt-5 flex items-center gap-3 bg-zinc-800/60 rounded-2xl px-3.5 py-3 text-left">
        <Timer className="w-5 h-5 text-orange-300 shrink-0" />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-zinc-100">Usar contador</span>
          <span className="block text-[11px] text-zinc-500">Séries com tempo e descanso, com voz (ex.: 30 s intenso, 30 s descanso)</span>
        </span>
        <span className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${comContador ? 'bg-orange-500' : 'bg-zinc-700'}`}>
          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${comContador ? 'translate-x-4' : ''}`} />
        </span>
      </button>
    )
    const rodape = comContador
      ? <Button size="lg" className="w-full" disabled={contador.preparando || !exContador} onClick={() => exContador && contador.iniciar([exContador])}>
          {contador.preparando ? 'Preparando áudio...' : `▶ Iniciar contador · ${mss(segIntervalo)}`}
        </Button>
      : <Button size="lg" className="w-full" loading={carregando} onClick={() => salvar({ nome: escolhida.nome, duracao_min: minutos, calorias: kcal, origem: 'lista' })}>Adicionar exercício</Button>
    return (<>
      <Folha titulo={<button onClick={() => setEscolhida(null)} className="flex items-center gap-1 text-zinc-300 text-sm font-semibold -ml-1"><ChevronLeft className="w-5 h-5" />Voltar</button>} onClose={onClose}
        rodape={rodape}>
        <div className="animate-fade-up">
          <p className="text-xl font-bold text-zinc-50">{escolhida.icone} {escolhida.nome}</p>
          <p className="text-xs text-zinc-500 mt-1">Cálculo pelo seu peso ({peso.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg){pesoKg ? '' : ', registre seu peso para mais precisão'}.</p>
        </div>
        {chave}
        {comContador ? (
          <>
            <div className="mt-3 flex flex-col gap-2 bg-zinc-800/60 rounded-2xl p-3">
              <Passo rotulo="Séries" valor={String(intervalo.series)} podeMenos={intervalo.series > 1} podeMais={intervalo.series < 20}
                onMenos={() => setIntervalo(v => ({ ...v, series: v.series - 1 }))} onMais={() => setIntervalo(v => ({ ...v, series: v.series + 1 }))} />
              <Passo rotulo="Execução" valor={mss(intervalo.exec)} podeMenos={intervalo.exec > 5} podeMais={intervalo.exec < 3600}
                onMenos={() => setIntervalo(v => ({ ...v, exec: passoTempo(v.exec, -1, 5, 3600) }))} onMais={() => setIntervalo(v => ({ ...v, exec: passoTempo(v.exec, 1, 5, 3600) }))} />
              <Passo rotulo="Descanso" valor={mss(intervalo.desc)} podeMenos={intervalo.desc > 0} podeMais={intervalo.desc < 600}
                onMenos={() => setIntervalo(v => ({ ...v, desc: passoTempo(v.desc, -1, 0) }))} onMais={() => setIntervalo(v => ({ ...v, desc: passoTempo(v.desc, 1, 0) }))} />
            </div>
            <div className="mt-3 text-center bg-orange-500/10 border border-orange-500/20 rounded-2xl py-3">
              <p className="text-2xl font-bold tabular-nums text-orange-300">{fmt(kcalIntervalo)} <span className="text-sm font-normal text-zinc-400">kcal · {mss(segIntervalo)}</span></p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Ao terminar (ou encerrar), o tempo feito vai para o diário.</p>
            </div>
            <div className="mt-3">{contador.opcoesSom}</div>
            {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
          </>
        ) : (<>
        <p className="text-sm font-medium text-zinc-300 mt-5 mb-1.5">Duração</p>
        <div className="flex items-center gap-2 bg-zinc-800/60 rounded-2xl p-2">
          <button type="button" onClick={() => setMinutos(m => Math.max(5, m - 5))} aria-label="Menos 5 minutos" className="w-11 h-11 rounded-xl bg-zinc-900 flex items-center justify-center active:scale-95"><Minus className="w-5 h-5" /></button>
          <label className="flex-1 flex items-baseline justify-center gap-2">
            <input value={minutos} onChange={e => setMinutos(Math.min(600, Number(e.target.value.replace(/\D/g, '')) || 0))} inputMode="numeric" aria-label="Minutos"
              className="w-16 bg-transparent text-center text-2xl font-bold tabular-nums text-zinc-50 focus:outline-none border-b border-zinc-600 focus:border-orange-400" />
            <span className="text-sm text-zinc-400">min</span>
          </label>
          <button type="button" onClick={() => setMinutos(m => Math.min(600, m + 5))} aria-label="Mais 5 minutos" className="w-11 h-11 rounded-xl bg-zinc-900 flex items-center justify-center active:scale-95"><Plus className="w-5 h-5" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {DURACOES.map(d => <button key={d} type="button" onClick={() => setMinutos(d)} aria-pressed={minutos === d}
            className={`px-3 py-1.5 rounded-full text-[13px] border ${minutos === d ? 'bg-orange-500 text-zinc-950 border-orange-500' : 'border-zinc-700 text-zinc-300'}`}>{d} min</button>)}
        </div>
        <div className="mt-5 text-center bg-orange-500/10 border border-orange-500/20 rounded-2xl py-4">
          <p className="text-4xl font-bold tabular-nums text-orange-300">{fmt(kcal)}</p>
          <p className="text-xs text-zinc-400 mt-0.5">kcal queimadas (estimativa)</p>
        </div>
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
        </>)}
      </Folha>
      {contador.overlay && createPortal(contador.overlay, document.body)}
    </>)
  }

  return (
    <Folha titulo={<h2 className="text-lg font-bold text-zinc-50">Adicionar exercício</h2>} onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 bg-zinc-800/60 rounded-xl p-1" role="tablist">
        {([['lista', 'Escolher', Search], ['ia', 'Descrever (IA)', Sparkles]] as const).map(([id, r, Icone]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => { setAba(id); setErro('') }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${aba === id ? 'bg-zinc-950 text-orange-300' : 'text-zinc-400'}`}><Icone className="w-4 h-4" />{r}</button>
        ))}
      </div>
      {aba === 'lista' ? (
        <div className="mt-4">
          <label className="relative block">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar atividade" type="search"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent" />
          </label>
          <ul className="mt-3 grid grid-cols-1 gap-1.5">
            {lista.map((a, i) => (
              <li key={a.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}>
                <button type="button" onClick={() => escolher(a)}
                  className="w-full flex items-center gap-3 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl px-3 py-2.5 text-left">
                  <span className="text-xl" aria-hidden>{a.icone}</span>
                  <span className="flex-1 text-sm font-medium text-zinc-100">{a.nome}</span>
                  <span className="text-xs text-zinc-500 tabular-nums">{fmt(caloriasExercicio(a.met, peso, 30))} kcal/30 min</span>
                </button>
              </li>
            ))}
            {lista.length === 0 && <li className="text-sm text-zinc-500 text-center py-6">Não achou? Use "Descrever (IA)".</li>}
          </ul>
        </div>
      ) : (
        <div className="mt-4">
          <Textarea label="O que você fez?" rows={3} value={texto} onChange={e => { setTexto(e.target.value); setEstimativa(null) }} placeholder="Ex.: corri 5 km em 30 minutos; aula de spinning de 45 min; joguei bola 1 hora" />
          {estimativa && (
            <div className="mt-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 flex flex-col gap-2 animate-fade-up">
              <input value={estimativa.nome} onChange={e => setEstimativa({ ...estimativa, nome: e.target.value })} aria-label="Nome do exercício"
                className="bg-transparent font-semibold text-zinc-100 focus:outline-none border-b border-zinc-700" />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-400">Duração (min)
                  <input value={estimativa.duracao_min} inputMode="numeric" onChange={e => setEstimativa({ ...estimativa, duracao_min: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100" />
                </label>
                <label className="text-xs text-zinc-400">Calorias (kcal)
                  <input value={estimativa.calorias} inputMode="numeric" onChange={e => setEstimativa({ ...estimativa, calorias: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100" />
                </label>
              </div>
            </div>
          )}
          {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
          <div className="mt-4">
            {estimativa
              ? <Button size="lg" className="w-full" loading={carregando} disabled={!estimativa.nome.trim() || estimativa.duracao_min < 1} onClick={() => salvar({ ...estimativa, origem: 'ia' })}>Adicionar exercício</Button>
              : <Button size="lg" className="w-full" loading={carregando} disabled={!texto.trim()} onClick={estimar}><Sparkles className="w-4 h-4" />Calcular com IA</Button>}
          </div>
        </div>
      )}
    </Folha>
  )
}
