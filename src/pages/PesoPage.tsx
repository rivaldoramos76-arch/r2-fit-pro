import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, Trash2, Target, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMeta } from '../lib/nutricao'
import { historicoPeso, registrarPeso, removerPeso, salvarMetasExtras } from '../lib/progresso'
import { resumoPeso } from '../lib/exercicios'
import type { PontoPeso } from '../lib/exercicios'
import { hojeLocal, somarDias } from '../lib/diario'
import { Button, Input, Spinner } from '../components/UI'
import GraficoPeso from '../components/progresso/GraficoPeso'

const PERIODOS = [['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano'], ['tudo', 'Tudo']] as const
const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const sinal = (n: number) => `${n > 0 ? '+' : ''}${kg(n)} kg`
const dataBR = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

function Variacao({ valor, rotulo }: { valor: number | null; rotulo: string }) {
  if (valor === null) return null
  const Icone = valor < 0 ? TrendingDown : valor > 0 ? TrendingUp : Minus
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
      <p className="text-[11px] text-zinc-500">{rotulo}</p>
      <p className="font-bold tabular-nums text-zinc-100 flex items-center gap-1 mt-0.5"><Icone className="w-4 h-4 text-green-400" />{sinal(valor)}</p>
    </div>
  )
}

export default function PesoPage() {
  const { user } = useAuth()
  const { meta, recarregar } = useMeta(user?.id)
  const [pontos, setPontos] = useState<(PontoPeso & { id: string })[] | null>(null)
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number][0]>('90')
  const [novo, setNovo] = useState('')
  const [data, setData] = useState(hojeLocal)
  const [metaPeso, setMetaPeso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(() => { if (user) historicoPeso(user.id).then(setPontos).catch(() => setPontos([])) }, [user])
  useEffect(() => { carregar() }, [carregar])

  const visiveis = useMemo(() => {
    if (!pontos) return []
    if (periodo === 'tudo') return pontos
    const desde = somarDias(hojeLocal(), -Number(periodo))
    return pontos.filter(p => p.data >= desde)
  }, [pontos, periodo])
  const resumo = resumoPeso(visiveis, meta?.meta_peso_kg)

  const salvar = async () => {
    const v = Number(novo.replace(',', '.'))
    if (!(v >= 30 && v <= 350)) { setErro('Informe um peso entre 30 e 350 kg.'); return }
    setErro(''); setAviso(''); setSalvando(true)
    try {
      await registrarPeso(user!.id, data, v)
      setNovo(''); setAviso('Peso registrado.')
      carregar()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar') }
    finally { setSalvando(false) }
  }
  const salvarMetaPeso = async () => {
    const v = metaPeso?.trim() ? Number(metaPeso.replace(',', '.')) : null
    if (v !== null && !(v >= 30 && v <= 350)) { setErro('Meta entre 30 e 350 kg.'); return }
    try { await salvarMetasExtras(user!.id, { meta_peso_kg: v }); setMetaPeso(null); recarregar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar') }
  }

  if (!pontos) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2"><Scale className="w-6 h-6 text-green-400" />Peso</h1>
        <p className="text-sm text-zinc-500">Pese-se no mesmo horário, de preferência em jejum, para comparar melhor.</p>
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-fade-up" style={{ animationDelay: '60ms' }} aria-label="Registrar peso">
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <Input label="Peso de hoje (kg)" inputMode="decimal" placeholder={resumo ? kg(resumo.atual) : '70,5'} value={novo} onChange={e => setNovo(e.target.value)} />
          <Button onClick={salvar} loading={salvando} disabled={!novo.trim()}>Registrar</Button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          Data
          <input type="date" value={data} max={hojeLocal()} onChange={e => e.target.value && setData(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-200" />
        </label>
        {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}
        {aviso && <p className="mt-2 text-sm text-green-400" role="status">{aviso}</p>}
      </section>

      {pontos.length === 0 ? (
        <div className="text-center py-10 px-4 text-zinc-400 text-sm">Registre seu peso para ver o gráfico da sua evolução.</div>
      ) : (
        <>
          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 animate-fade-up" style={{ animationDelay: '120ms' }} aria-label="Gráfico do peso">
            <div className="px-1">
              <p className="text-xs text-zinc-500">Atual</p>
              <p className="text-3xl font-bold tabular-nums text-zinc-50 whitespace-nowrap">{resumo ? kg(resumo.atual) : '—'} <span className="text-base font-medium text-zinc-400">kg</span></p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-0.5 bg-zinc-800/60 rounded-lg p-0.5" role="tablist">
              {PERIODOS.map(([id, r]) => (
                <button key={id} role="tab" aria-selected={periodo === id} onClick={() => setPeriodo(id)}
                  className={`py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition ${periodo === id ? 'bg-zinc-950 text-green-400' : 'text-zinc-400'}`}>{r}</button>
              ))}
            </div>
            <div className="mt-3">
              {visiveis.length ? <GraficoPeso key={periodo} pontos={visiveis} meta={meta?.meta_peso_kg} />
                : <p className="text-sm text-zinc-500 text-center py-10">Sem registros neste período.</p>}
            </div>
          </section>

          {resumo && (
            <div className="grid grid-cols-3 gap-2 animate-fade-up" style={{ animationDelay: '180ms' }}>
              <Variacao valor={resumo.variacao} rotulo="No período" />
              <Variacao valor={resumo.variacaoSemana} rotulo="Na semana" />
              {resumo.faltaMeta !== null
                ? <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3"><p className="text-[11px] text-zinc-500">Até a meta</p><p className="font-bold tabular-nums text-lime-400 mt-0.5">{resumo.faltaMeta === 0 ? 'Chegou! 🎉' : `${kg(Math.abs(resumo.faltaMeta))} kg`}</p></div>
                : null}
            </div>
          )}
        </>
      )}

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4" aria-label="Meta de peso">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Target className="w-4 h-4 text-lime-400" />Meta de peso</p>
          {metaPeso === null && (meta
            ? <button onClick={() => setMetaPeso(meta.meta_peso_kg ? String(meta.meta_peso_kg).replace('.', ',') : '')} className="text-sm font-semibold text-green-400">{meta.meta_peso_kg ? `${kg(meta.meta_peso_kg)} kg · alterar` : 'Definir'}</button>
            : <Link to="/meta" className="text-sm font-semibold text-green-400">Definir meta diária primeiro</Link>)}
        </div>
        {metaPeso !== null && (
          <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2 items-end animate-fade-up">
            <Input label="Peso desejado (kg)" inputMode="decimal" value={metaPeso} onChange={e => setMetaPeso(e.target.value)} autoFocus />
            <Button variant="ghost" onClick={() => setMetaPeso(null)}>Cancelar</Button>
            <Button onClick={salvarMetaPeso}>Salvar</Button>
          </div>
        )}
      </section>

      {pontos.length > 0 && (
        <section aria-label="Histórico de peso">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-1">Histórico</h2>
          <ul className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800">
            {[...pontos].reverse().slice(0, 30).map((p, i, lista) => {
              const anterior = lista[i + 1]
              const dif = anterior ? Math.round((p.peso_kg - anterior.peso_kg) * 10) / 10 : null
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm text-zinc-400 tabular-nums w-24">{dataBR(p.data)}</span>
                  <span className="flex-1 font-semibold tabular-nums text-zinc-100">{kg(p.peso_kg)} kg</span>
                  {dif !== null && dif !== 0 && <span className={`text-xs tabular-nums ${dif < 0 ? 'text-green-400' : 'text-amber-300'}`}>{sinal(dif)}</span>}
                  <button onClick={async () => { if (confirm('Remover este registro?')) { await removerPeso(p.id); carregar() } }} aria-label={`Remover peso de ${dataBR(p.data)}`}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-4 h-4" /></button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
