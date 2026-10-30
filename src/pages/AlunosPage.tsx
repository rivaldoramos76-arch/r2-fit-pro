import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Users, ChevronRight, ChevronLeft, MessageCircle, AlertTriangle, Dumbbell, Flame, Scale, Send, Copy, Salad, Target, UserPlus, BarChart3, Utensils,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  meusAlunos, dadosAluno, copiarTreinoDoAluno, enviarTreino, enviarDieta, definirMeta, encerrarAcompanhamento,
  type AlunoResumo, type DadosAluno,
} from '../lib/acompanhamento'
import { alertasAluno, ordenarAlunos, diasDesde } from '../lib/acompanhamentoBase'
import { guardarEdicaoAluno } from '../components/acompanhamento/EnviarParaAluno'
import { inicioSemana, resumoSemana } from '../lib/relatorio'
import { hojeLocal, somarDias, grupoRefeicao, REFEICOES, rotuloDia } from '../lib/diario'
import { Button, Input, Select, Spinner } from '../components/UI'
import { BarraMacro, fmt } from '../components/nutricao/Graficos'
import GraficoPeso from '../components/progresso/GraficoPeso'
import Conversa from '../components/acompanhamento/Conversa'

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')
const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const diaLocal = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
const dataCurta = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}` }

function textoUltimoTreino(iso: string | null) {
  const d = diasDesde(iso)
  return d === null ? 'nunca treinou' : d === 0 ? 'treinou hoje' : d === 1 ? 'treinou ontem' : `treinou há ${d} dias`
}

/** Lista de alunos do personal, com quem precisa de atenção primeiro. */
export function ListaAlunos() {
  const [lista, setLista] = useState<AlunoResumo[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => { meusAlunos(hojeLocal()).then(setLista).catch(e => { setErro(erroDe(e)); setLista([]) }) }, [])
  const ordenados = useMemo(() => ordenarAlunos(lista ?? []), [lista])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2"><Users className="w-6 h-6 text-green-400" />Meus alunos</h1>
          <p className="text-sm text-zinc-500">{lista?.length ? `${lista.length} aluno(s) · quem precisa de atenção aparece primeiro` : 'Acompanhe treinos, dieta e peso dos seus alunos.'}</p>
        </div>
        <Link to="/personal" className="inline-flex items-center gap-1.5 rounded-xl bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold text-sm px-3.5 py-2 active:scale-95 transition"><UserPlus className="w-4 h-4" />Convidar</Link>
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {lista === null ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        : lista.length === 0 ? (
          <div className="text-center py-12 px-6 bg-zinc-900 border border-zinc-800 rounded-3xl">
            <Users className="w-10 h-10 text-green-400 mx-auto" />
            <p className="font-semibold text-zinc-100 mt-3">Nenhum aluno ainda</p>
            <p className="text-sm text-zinc-500 mt-1">Ative o modo personal e mande o link de convite para seus alunos. Quando eles aceitarem, aparecem aqui.</p>
            <Link to="/personal" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-green-500 text-zinc-950 font-semibold text-sm px-4 py-2.5"><UserPlus className="w-4 h-4" />Convidar alunos</Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordenados.map((a, i) => {
              const alertas = alertasAluno(a)
              return (
                <li key={a.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <Link to={`/alunos/${a.aluno_id}`} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl px-4 py-3 transition">
                    <span className="relative w-11 h-11 rounded-full bg-green-500/15 text-green-400 font-bold flex items-center justify-center shrink-0">
                      {a.nome.charAt(0).toUpperCase()}
                      {a.nao_lidas > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">{a.nao_lidas}</span>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-zinc-100 truncate">{a.nome}</span>
                      <span className="block text-xs text-zinc-500 truncate">
                        {[
                          a.ver_treinos ? `${textoUltimoTreino(a.ultimo_treino)} · ${a.treinos_7d ?? 0} na semana` : null,
                          a.ver_diario && a.meta_kcal ? `hoje ${fmt(a.kcal_hoje ?? 0)}/${fmt(a.meta_kcal)} kcal` : null,
                          a.peso ? `${kg(a.peso.peso_kg)} kg` : null,
                        ].filter(Boolean).join(' · ') || 'Não compartilhou dados'}
                      </span>
                      {alertas.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {alertas.map(al => (
                            <span key={al.tipo} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${al.grave ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>
                              <AlertTriangle className="w-3 h-3" />{al.texto}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="w-5 h-5 text-zinc-600 shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}

type Aba = 'resumo' | 'treinos' | 'diario' | 'mensagens'

function Resumo({ d, semana, setSemana, aoMeta }: { d: DadosAluno; semana: string; setSemana: (s: string) => void; aoMeta: () => void }) {
  const r = resumoSemana({
    inicio: semana,
    alimentos: d.alimentos ?? [], agua: d.agua ?? [], exercicios: d.exercicios ?? [], pesos: d.pesos ?? [],
    treinosConcluidos: (d.sessoes ?? []).filter(s => s.concluido && diaLocal(s.data_inicio) >= semana && diaLocal(s.data_inicio) <= somarDias(semana, 6)).length,
    meta: d.meta && d.ver_diario ? { calorias: d.meta.calorias, proteina_g: d.meta.proteina_g, carboidrato_g: d.meta.carboidrato_g, gordura_g: d.meta.gordura_g, agua_ml: d.meta.agua_ml ?? 2000, somar_exercicio: d.meta.somar_exercicio } : null,
  })
  const atual = inicioSemana(hojeLocal())
  const pesos = d.pesos ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl px-2 py-1.5">
        <button onClick={() => setSemana(somarDias(semana, -7))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300" aria-label="Semana anterior"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-sm font-medium text-zinc-200">{semana === atual ? 'Esta semana' : `${dataCurta(semana)} a ${dataCurta(somarDias(semana, 6))}`}</span>
        <button onClick={() => setSemana(somarDias(semana, 7))} disabled={semana >= atual} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30" aria-label="Próxima semana"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {d.ver_treinos && <Numero icone={Dumbbell} rotulo="Treinos concluídos" valor={String(r.treinosConcluidos)} />}
        {d.ver_diario && <Numero icone={Utensils} rotulo="Dias com diário" valor={`${r.diasRegistrados}/7`} />}
        {d.ver_diario && r.diasNaMeta !== null && <Numero icone={Target} rotulo="Dias na meta" valor={`${r.diasNaMeta}/${r.diasRegistrados || 0}`} />}
        {d.ver_diario && <Numero icone={Flame} rotulo="Média por dia" valor={r.diasRegistrados ? `${fmt(r.mediaCalorias)} kcal` : '—'} />}
        {d.ver_peso && r.peso && <Numero icone={Scale} rotulo="Peso" valor={`${kg(r.peso.atual)} kg${r.peso.variacao !== null ? ` (${r.peso.variacao > 0 ? '+' : ''}${kg(r.peso.variacao)})` : ''}`} />}
      </div>
      {d.ver_diario && d.meta && r.diasRegistrados > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-zinc-200">Macros médios por dia</p>
          <BarraMacro rotulo="Proteína" atual={r.macrosMedios.proteina_g} meta={d.meta.proteina_g} cor="proteina" />
          <BarraMacro rotulo="Carboidrato" atual={r.macrosMedios.carboidrato_g} meta={d.meta.carboidrato_g} cor="carboidrato" />
          <BarraMacro rotulo="Gordura" atual={r.macrosMedios.gordura_g} meta={d.meta.gordura_g} cor="gordura" />
        </div>
      )}
      {d.ver_peso && pesos.length >= 2 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-sm font-semibold text-zinc-200 mb-2">Peso</p>
          <GraficoPeso pontos={pesos.slice(-60)} meta={d.meta?.meta_peso_kg} />
        </div>
      )}
      {d.meta && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
          <Target className="w-5 h-5 text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-200">Meta diária: {fmt(d.meta.calorias)} kcal</p>
            <p className="text-xs text-zinc-500">P {d.meta.proteina_g} g · C {d.meta.carboidrato_g} g · G {d.meta.gordura_g} g{d.meta.agua_ml ? ` · água ${fmt(d.meta.agua_ml)} ml` : ''}</p>
          </div>
          {d.editar_planos && <Button size="sm" variant="secondary" onClick={aoMeta}>Ajustar</Button>}
        </div>
      )}
      {!d.ver_treinos && !d.ver_diario && !d.ver_peso && <p className="text-sm text-zinc-500 text-center py-6">Este aluno não compartilhou treinos, diário nem peso. Vocês ainda podem trocar mensagens.</p>}
    </div>
  )
}

function Numero({ icone: Icone, rotulo, valor }: { icone: typeof Flame; rotulo: string; valor: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
      <p className="text-[11px] text-zinc-500 flex items-center gap-1"><Icone className="w-3.5 h-3.5 text-green-400" />{rotulo}</p>
      <p className="font-bold tabular-nums text-zinc-100 mt-0.5">{valor}</p>
    </div>
  )
}

/** Ajuste da meta diária do aluno pelo personal. */
function EditarMeta({ d, aoSalvar, aoCancelar }: { d: DadosAluno; aoSalvar: () => void; aoCancelar: () => void }) {
  const m = d.meta!
  const [v, setV] = useState({ calorias: String(m.calorias), proteina_g: String(m.proteina_g), carboidrato_g: String(m.carboidrato_g), gordura_g: String(m.gordura_g), agua_ml: m.agua_ml ? String(m.agua_ml) : '', meta_peso_kg: m.meta_peso_kg ? String(m.meta_peso_kg).replace('.', ',') : '' })
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const n = (s: string) => Number(s.replace(',', '.'))
  const doMacros = Math.round(n(v.proteina_g) * 4 + n(v.carboidrato_g) * 4 + n(v.gordura_g) * 9)
  const salvar = async () => {
    setOcupado(true); setErro('')
    try {
      await definirMeta(d.aluno_id, {
        calorias: Math.round(n(v.calorias)), proteina_g: Math.round(n(v.proteina_g)), carboidrato_g: Math.round(n(v.carboidrato_g)), gordura_g: Math.round(n(v.gordura_g)),
        agua_ml: v.agua_ml ? Math.round(n(v.agua_ml)) : null, meta_peso_kg: v.meta_peso_kg ? n(v.meta_peso_kg) : null,
      })
      aoSalvar()
    } catch (e) { setErro(erroDe(e)) } finally { setOcupado(false) }
  }
  const campo = (k: keyof typeof v, rotulo: string) => (
    <Input label={rotulo} inputMode="decimal" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value.replace(/[^\d,.]/g, '') })} />
  )
  return (
    <div className="bg-zinc-900 border border-green-500/30 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-semibold text-zinc-100">Ajustar meta de {d.nome}</p>
      <div className="grid grid-cols-2 gap-2">
        {campo('calorias', 'Calorias (kcal)')}
        {campo('proteina_g', 'Proteína (g)')}
        {campo('carboidrato_g', 'Carboidrato (g)')}
        {campo('gordura_g', 'Gordura (g)')}
        {campo('agua_ml', 'Água (ml)')}
        {campo('meta_peso_kg', 'Peso meta (kg)')}
      </div>
      {Math.abs(doMacros - n(v.calorias)) > 60 && <p className="text-xs text-amber-300">Os macros somam {fmt(doMacros)} kcal, diferente das calorias informadas.</p>}
      <p className="text-xs text-zinc-500">O aluno recebe um aviso e a meta passa a valer na hora.</p>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={aoCancelar}>Cancelar</Button>
        <Button className="flex-1" loading={ocupado} onClick={salvar}>Salvar meta</Button>
      </div>
    </div>
  )
}

function Treinos({ d, userId, semana, aoMudar }: { d: DadosAluno; userId: string; semana: string; aoMudar: () => void }) {
  const navigate = useNavigate()
  const [meus, setMeus] = useState<{ id: string; nome: string }[]>([])
  const [minhasDietas, setMinhasDietas] = useState<{ id: string; nome: string }[]>([])
  const [origem, setOrigem] = useState('')
  const [substituir, setSubstituir] = useState('')
  const [dieta, setDieta] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.from('treinos').select('id, nome').eq('user_id', userId).order('created_at', { ascending: false }).then(r => setMeus((r.data as { id: string; nome: string }[]) ?? []))
    supabase.from('dietas').select('id, nome').eq('user_id', userId).order('created_at', { ascending: false }).then(r => setMinhasDietas((r.data as { id: string; nome: string }[]) ?? []))
  }, [userId])

  const executar = async (chave: string, f: () => Promise<void>) => {
    setOcupado(chave); setErro(''); setAviso('')
    try { await f() } catch (e) { setErro(erroDe(e)) } finally { setOcupado('') }
  }
  const copiar = (treinoId: string) => executar(`copiar-${treinoId}`, async () => {
    const novo = await copiarTreinoDoAluno(d.aluno_id, treinoId)
    guardarEdicaoAluno({ treinoId: novo, alunoId: d.aluno_id, substituir: treinoId, nome: d.nome })
    navigate(`/treino/${novo}`)
  })
  const enviar = () => executar('enviar', async () => {
    await enviarTreino(d.aluno_id, origem, substituir || null)
    setAviso(substituir ? 'Treino atualizado. O aluno foi avisado.' : 'Treino enviado. O aluno foi avisado.')
    setOrigem(''); setSubstituir(''); aoMudar()
  })
  const mandarDieta = () => executar('dieta', async () => {
    await enviarDieta(d.aluno_id, dieta)
    setAviso('Dieta enviada. O aluno foi avisado.'); setDieta('')
  })
  const fimSemana = somarDias(semana, 6)
  const sessoes = (d.sessoes ?? []).filter(s => s.concluido && diaLocal(s.data_inicio) >= semana && diaLocal(s.data_inicio) <= fimSemana).slice(0, 14)

  return (
    <div className="flex flex-col gap-3">
      {d.treinos && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-zinc-200">Treinos do aluno</p>
          {d.treinos.length === 0 ? <p className="text-sm text-zinc-500">Nenhum treino salvo.</p> : d.treinos.map(t => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2.5">
              <Dumbbell className="w-4 h-4 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{t.nome}</p>
                <p className="text-xs text-zinc-500">{[t.frequencia_semanal ? `${t.frequencia_semanal}x/semana` : null, t.enviado_por_mim ? 'enviado por você' : null].filter(Boolean).join(' · ') || ' '}</p>
              </div>
              <Button size="sm" variant="secondary" loading={ocupado === `copiar-${t.id}`} onClick={() => copiar(t.id)} title="Copia para a sua conta para editar e reenviar">
                <Copy className="w-3.5 h-3.5" />Editar
              </Button>
            </div>
          ))}
          <p className="text-xs text-zinc-500">"Editar" faz uma cópia na sua conta. Ajuste no editor de sempre e toque em "Enviar para o aluno".</p>
        </section>
      )}
      {d.editar_planos ? (
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><Send className="w-4 h-4 text-green-400" />Enviar um treino seu</p>
          {meus.length === 0 ? (
            <p className="text-sm text-zinc-500">Você ainda não tem treinos. <Link to="/treino/novo" className="text-green-400 underline">Monte um treino</Link> e volte aqui para enviar.</p>
          ) : (
            <>
              <Select label="Treino da sua conta" value={origem} onChange={e => setOrigem(e.target.value)}>
                <option value="">Escolha…</option>
                {meus.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </Select>
              {d.treinos && d.treinos.length > 0 && (
                <Select label="No aluno" value={substituir} onChange={e => setSubstituir(e.target.value)}>
                  <option value="">Adicionar como treino novo</option>
                  {d.treinos.map(t => <option key={t.id} value={t.id}>Substituir “{t.nome}”</option>)}
                </Select>
              )}
              <Button disabled={!origem} loading={ocupado === 'enviar'} onClick={enviar}>Enviar treino</Button>
            </>
          )}
          <div className="border-t border-zinc-800 pt-3 flex flex-col gap-3">
            <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><Salad className="w-4 h-4 text-green-400" />Enviar uma dieta sua</p>
            {minhasDietas.length === 0 ? (
              <p className="text-sm text-zinc-500">Você ainda não tem dietas. <Link to="/dieta" className="text-green-400 underline">Crie uma dieta</Link> e volte aqui para enviar.</p>
            ) : (
              <>
                <Select label="Dieta da sua conta" value={dieta} onChange={e => setDieta(e.target.value)}>
                  <option value="">Escolha…</option>
                  {minhasDietas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </Select>
                <Button disabled={!dieta} loading={ocupado === 'dieta'} onClick={mandarDieta}>Enviar dieta</Button>
              </>
            )}
          </div>
        </section>
      ) : <p className="text-sm text-zinc-500">O aluno não permitiu que você envie treinos e dietas.</p>}
      {aviso && <p className="text-sm text-green-400">{aviso}</p>}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {d.ver_treinos && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-zinc-200">Treinos concluídos na semana</p>
          {sessoes.length === 0 ? <p className="text-sm text-zinc-500">Nenhum treino concluído neste período.</p> : sessoes.map(s => (
            <div key={s.data_inicio} className="flex items-center justify-between text-sm">
              <span className="text-zinc-200 truncate">{s.treino_nome ?? 'Treino'} · dia {s.dia_index + 1}</span>
              <span className="text-zinc-500 tabular-nums shrink-0 ml-2">
                {new Date(s.data_inicio).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                {s.data_fim ? ` · ${Math.max(1, Math.round((new Date(s.data_fim).getTime() - new Date(s.data_inicio).getTime()) / 60000))} min` : ''}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function Diario({ d, semana }: { d: DadosAluno; semana: string }) {
  const hoje = hojeLocal()
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(semana, i)).filter(x => x <= hoje)
  const [dia, setDia] = useState(dias[dias.length - 1] ?? semana)
  useEffect(() => { setDia(dias[dias.length - 1] ?? semana) }, [semana]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.ver_diario) return <p className="text-sm text-zinc-500 text-center py-6">O aluno não compartilhou o diário alimentar.</p>
  const itens = (d.alimentos ?? []).filter(a => a.data === dia)
  const total = itens.reduce((s, a) => ({ kcal: s.kcal + a.calorias, p: s.p + a.proteina_g, c: s.c + a.carboidrato_g, g: s.g + a.gordura_g }), { kcal: 0, p: 0, c: 0, g: 0 })
  const agua = (d.agua ?? []).filter(a => a.data === dia).reduce((s, a) => s + a.ml, 0)
  const ex = (d.exercicios ?? []).filter(e => e.data === dia)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dias.map(x => (
          <button key={x} onClick={() => setDia(x)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium border ${x === dia ? 'bg-green-500 text-zinc-950 border-green-500' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}>{rotuloDia(x)}</button>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-sm text-zinc-400">Total do dia</p>
        <p className="text-2xl font-bold text-zinc-50 tabular-nums">{fmt(total.kcal)}{d.meta ? <span className="text-sm text-zinc-500 font-normal"> / {fmt(d.meta.calorias)} kcal</span> : ' kcal'}</p>
        <p className="text-xs text-zinc-500 mt-0.5">P {fmt(total.p)} g · C {fmt(total.c)} g · G {fmt(total.g)} g{agua ? ` · água ${fmt(agua)} ml` : ''}</p>
      </div>
      {itens.length === 0 ? <p className="text-sm text-zinc-500 text-center py-4">Nada registrado neste dia.</p> : REFEICOES.map(ref => {
        const doGrupo = itens.filter(a => grupoRefeicao(a.refeicao) === ref)
        if (!doGrupo.length) return null
        return (
          <div key={ref} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-sm font-semibold text-zinc-200 flex justify-between"><span>{ref}</span><span className="text-zinc-500 font-normal">{fmt(doGrupo.reduce((s, a) => s + a.calorias, 0))} kcal</span></p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {doGrupo.map((a, i) => (
                <li key={i} className="flex justify-between gap-2 text-sm">
                  <span className="text-zinc-300 min-w-0 truncate">{a.nome}{a.quantidade ? <span className="text-zinc-500"> · {a.quantidade}</span> : null}</span>
                  <span className="text-zinc-500 tabular-nums shrink-0">{fmt(a.calorias)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {ex.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-sm font-semibold text-zinc-200">Exercícios</p>
          {ex.map((e, i) => <p key={i} className="text-sm text-zinc-300 mt-1">{e.nome} · {e.duracao_min} min · {fmt(e.calorias)} kcal</p>)}
        </div>
      )}
    </div>
  )
}

/** Painel de um aluno: resumo da semana, treinos, diário e mensagens. */
export function PainelAluno() {
  const { alunoId } = useParams<{ alunoId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [aba, setAba] = useState<Aba>('resumo')
  const [semana, setSemana] = useState(() => inicioSemana(hojeLocal()))
  const [d, setD] = useState<DadosAluno | null>(null)
  const [erro, setErro] = useState('')
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const carregar = useCallback(() => {
    if (!alunoId) return
    dadosAluno(alunoId, semana, somarDias(semana, 6)).then(x => { setD(x); setErro('') }).catch(e => setErro(erroDe(e)))
  }, [alunoId, semana])
  useEffect(() => { carregar() }, [carregar])

  const encerrar = async () => {
    if (!d) return
    try { await encerrarAcompanhamento(d.id); navigate('/alunos', { replace: true }) } catch (e) { setErro(erroDe(e)) }
  }

  if (erro && !d) return (
    <div className="text-center py-16 flex flex-col items-center gap-3">
      <p className="text-zinc-300">{erro}</p>
      <Link to="/alunos" className="text-green-400 underline text-sm">Voltar para os alunos</Link>
    </div>
  )
  if (!d || !user) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const ABAS: { id: Aba; rotulo: string; icone: typeof Flame }[] = [
    { id: 'resumo', rotulo: 'Resumo', icone: BarChart3 },
    { id: 'treinos', rotulo: 'Treinos', icone: Dumbbell },
    { id: 'diario', rotulo: 'Diário', icone: Utensils },
    { id: 'mensagens', rotulo: 'Mensagens', icone: MessageCircle },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link to="/alunos" className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar"><ChevronLeft className="w-5 h-5" /></Link>
        <span className="w-11 h-11 rounded-full bg-green-500/15 text-green-400 font-bold flex items-center justify-center shrink-0">{d.nome.charAt(0).toUpperCase()}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-50 truncate">{d.nome}</h1>
          <p className="text-xs text-zinc-500">Aluno desde {new Date(d.desde).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1" role="tablist">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition ${aba === id ? 'bg-green-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}>
            <Icone className="w-4 h-4" />{rotulo}
          </button>
        ))}
      </div>
      {editandoMeta && d.meta
        ? <EditarMeta d={d} aoCancelar={() => setEditandoMeta(false)} aoSalvar={() => { setEditandoMeta(false); carregar() }} />
        : aba === 'resumo' ? <Resumo d={d} semana={semana} setSemana={setSemana} aoMeta={() => setEditandoMeta(true)} />
          : aba === 'treinos' ? <Treinos d={d} userId={user.id} semana={semana} aoMudar={carregar} />
            : aba === 'diario' ? <Diario d={d} semana={semana} />
              : <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4"><Conversa acompanhamentoId={d.id} meuId={user.id} souAluno={false} /></div>}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <div className="pt-2">
        {!confirmar
          ? <button onClick={() => setConfirmar(true)} className="text-sm text-zinc-500 hover:text-red-400">Encerrar acompanhamento</button>
          : (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex flex-col gap-2">
              <p className="text-sm text-red-200">Você deixa de ver os dados de {d.nome}. Para voltar, o aluno precisa aceitar um novo convite.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setConfirmar(false)}>Voltar</Button>
                <Button size="sm" variant="danger" onClick={encerrar}>Encerrar</Button>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
