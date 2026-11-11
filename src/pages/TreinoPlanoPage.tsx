import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTreino } from '../lib/treinoApi'
import { descreverGrupos, proximoTreino } from '../lib/treinoModel'
import { exercicioConcluido, seriesFeitas, type Sessao } from '../lib/sessoes'
import { Spinner } from '../components/UI'
import EnviarParaAluno from '../components/acompanhamento/EnviarParaAluno'
import EditorDiasSemana from '../components/treino/EditorDiasSemana'
import { ajustesDaSemana, aplicarSemana, dataComDia, desfazerAjuste, hojeIso } from '../lib/semanaBase'

export default function TreinoPlanoPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { treino, loading, erro, salvar } = useTreino(id)
  const [editandoDias, setEditandoDias] = useState(false)
  const [salvandoDias, setSalvandoDias] = useState(false)
  const [erroDias, setErroDias] = useState('')
  const [sessoes, setSessoes] = useState<Record<number, Sessao>>({})
  const [ultimoConcluido, setUltimoConcluido] = useState<number | null>(null)
  const [carregouSessoes, setCarregouSessoes] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('sessoes_treino')
      .select('id, treino_id, dia_index, concluido, feito, series_realizadas, data_inicio, data_fim')
      .eq('treino_id', id).order('data_inicio', { ascending: false }).limit(100)
      .then(({ data }) => {
        const porDia: Record<number, Sessao> = {}
        for (const s of (data ?? []) as Sessao[]) if (!porDia[s.dia_index]) porDia[s.dia_index] = s
        setSessoes(porDia)
        // Treino incompleto também conta para sugerir o próximo
        const fim = (s: Sessao) => s.data_fim ?? s.data_inicio
        const concl = ((data ?? []) as Sessao[]).filter(s => s.feito ?? s.concluido)
          .sort((a, b) => fim(b).localeCompare(fim(a)))
        setUltimoConcluido(concl[0]?.dia_index ?? null)
        setCarregouSessoes(true)
      })
  }, [id])

  const proximo = treino ? proximoTreino(treino.plano, ultimoConcluido) : 0

  // "Iniciar" na lista de planos abre direto o próximo treino da sequência
  useEffect(() => {
    if (params.get('iniciar') && treino && carregouSessoes) navigate(`/treino/${treino.id}/dia/${proximo}`, { replace: true })
  }, [params, treino, carregouSessoes, proximo, navigate])

  const excluir = async () => {
    if (!treino || !confirm(`Excluir o plano "${treino.nome}"?`)) return
    await supabase.from('treinos').delete().eq('id', treino.id)
    navigate('/treino')
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!treino) return <div className="text-center py-16 text-zinc-500">{erro || 'Treino não encontrado.'}</div>

  const { plano } = treino
  const c = plano.config

  return (
    <div className="flex flex-col gap-5" translate="no">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/treino')} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-100 leading-tight">{plano.nome}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {treino.enviado_por ? 'Enviado pelo seu personal' : plano.origem === 'manual' ? 'Montado por você' : 'Gerado por IA'} · Treino {plano.divisao} · {plano.frequencia_semanal}x/semana
          </p>
        </div>
      </div>

      <EnviarParaAluno treinoId={treino.id} />

      <div className="grid grid-cols-2 gap-2">
        <Link to={`/treino/${treino.id}/editar`} className="text-center text-sm font-semibold py-2.5 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700">
          Editar plano
        </Link>
        <button onClick={excluir} className="text-sm font-semibold py-2.5 rounded-xl bg-zinc-900 text-red-400/90 border border-zinc-800 hover:bg-red-500/10">
          Excluir
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[c.objetivo, c.nivel, `${c.duracao} min`, c.local].map(x => (
          <span key={x} className="text-xs px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">{x}</span>
        ))}
      </div>

      {plano.agenda.length > 0 && (
        <section aria-label="Semana" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Semana</p>
            {!treino.enviado_por && !editandoDias && (
              <button type="button" onClick={() => { setEditandoDias(true); setErroDias('') }} className="text-xs font-semibold text-green-400">Editar dias</button>
            )}
          </div>
          {editandoDias ? (
            <EditorDiasSemana plano={plano} salvando={salvandoDias} onCancelar={() => setEditandoDias(false)}
              onSalvar={async dias => {
                setSalvandoDias(true); setErroDias('')
                try { await salvar(aplicarSemana(plano, dias)); setEditandoDias(false) } catch { setErroDias('Não foi possível salvar. Confira a internet e tente de novo.') }
                setSalvandoDias(false)
              }} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {plano.agenda.map((s, i) => (
                <span key={i} className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300">
                  {s.diaSemana ?? `Sessão ${i + 1}`}: <b className="text-green-400">{s.letra}</b>
                </span>
              ))}
              {(plano.encaixes ?? []).map(e => (
                <span key={e.origem} className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-300">
                  {dataComDia(e.data).split(',')[0].replace(/^./, c => c.toUpperCase())}: <b>{e.letra}</b> (encaixado)
                </span>
              ))}
            </div>
          )}
          {erroDias && <p role="alert" className="text-xs text-red-400 mt-2">{erroDias}</p>}
          {!editandoDias && ajustesDaSemana(plano, hojeIso()).map(a => (
            <p key={`${a.tipo}-${a.origem}`} className="flex items-center gap-2 text-xs text-zinc-400 mt-2">
              <span className="flex-1">Semana ajustada · treino {a.letra} de {dataComDia(a.origem).split(',')[0]} {a.tipo === 'dividido' ? 'dividido nos próximos treinos' : 'encaixado num dia livre'}</span>
              <button type="button" onClick={() => salvar(desfazerAjuste(plano, a.origem)).catch(() => setErroDias('Não foi possível salvar. Confira a internet e tente de novo.'))}
                className="font-semibold text-amber-400">desfazer</button>
            </p>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Treinos</h2>
        {plano.dias.map((d, i) => {
          const s = sessoes[i]
          const total = d.exercicios.length
          const feitos = s ? d.exercicios.filter(e => exercicioConcluido(s, e)).length : 0
          const algumaSerie = s ? d.exercicios.some(e => seriesFeitas(s, e.id) > 0) : false
          const concluido = !!s?.concluido && total > 0
          return (
            <Link key={d.id} to={`/treino/${treino.id}/dia/${i}`}
              className={`block rounded-2xl p-4 border transition active:scale-[0.99] ${i === proximo ? 'bg-green-500/5 border-green-500/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-xl bg-green-500/15 text-green-400 text-xl font-black flex items-center justify-center shrink-0">{d.letra}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-zinc-100">{d.dia}</p>
                    {i === proximo && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500 text-zinc-950">Próximo</span>}
                    {concluido && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-700 text-green-300">✓ Concluído</span>}
                  </div>
                  <p className="text-sm text-zinc-400 truncate">{d.foco || descreverGrupos(d.grupos) || 'Sem foco definido'}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {total === 0 ? 'Nenhum exercício ainda — toque para adicionar' : `${total} exercício${total > 1 ? 's' : ''} · ~${d.duracao_estimada_min} min`}
                    {!concluido && algumaSerie && ` · ${feitos}/${total} feitos${s?.data_fim ? ` em ${new Date(s.data_fim).toLocaleDateString('pt-BR')}` : ''}`}
                    {concluido && s?.data_fim && ` · em ${new Date(s.data_fim).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <span className="text-zinc-600 self-center">›</span>
              </div>
            </Link>
          )
        })}
      </section>

      {plano.observacoes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Orientações</p>
          <ul className="flex flex-col gap-1.5">
            {plano.observacoes.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-400"><span className="text-green-400">•</span>{o}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
