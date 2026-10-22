import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { gerarPlanoTreino } from '../lib/openai'
import { criarPlano, useTreino } from '../lib/treinoApi'
import { GRUPOS, type GrupoMuscular } from '../data/exercicios'
import {
  CONFIG_PADRAO, DIAS_SEMANA, EQUIP_POR_LOCAL, LETRAS, LOCAIS, NIVEIS, OBJETIVOS, OPCOES_EQUIPAMENTO,
  agendaPadrao, aplicarDivisao, divisaoSugerida, modeloDivisao, opcoesDivisao,
  type ConfigTreino, type PlanoTreino, type SlotAgenda, type TreinoDivisao,
} from '../lib/treinoModel'
import { Spinner } from '../components/UI'
import { Chip, Rotulo } from '../components/treino/Chip'

const GRUPO_IDS = Object.keys(GRUPOS) as GrupoMuscular[]

export default function PlanoWizardPage() {
  const { id } = useParams<{ id?: string }>()
  const [params] = useSearchParams()
  const editando = !!id
  const { treino, loading: carregando, salvar } = useTreino(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [modo, setModo] = useState<'ia' | 'manual'>(params.get('modo') === 'ia' ? 'ia' : 'manual')
  const [etapa, setEtapa] = useState(0)
  const [cfg, setCfg] = useState<ConfigTreino>(CONFIG_PADRAO)
  const [n, setN] = useState(divisaoSugerida(CONFIG_PADRAO.frequencia))
  const [treinos, setTreinos] = useState<TreinoDivisao[]>(modeloDivisao(divisaoSugerida(CONFIG_PADRAO.frequencia)))
  const [agenda, setAgenda] = useState<SlotAgenda[]>(agendaPadrao(CONFIG_PADRAO.frequencia, divisaoSugerida(CONFIG_PADRAO.frequencia)))
  const [nome, setNome] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [inicializado, setInicializado] = useState(!editando)

  // modo edição: carrega dados do plano existente
  useEffect(() => {
    if (!editando || !treino || inicializado) return
    const p = treino.plano
    setModo(p.origem)
    setCfg({ ...p.config, frequencia: p.frequencia_semanal })
    setN(p.dias.length || 1)
    setTreinos(p.dias.map(d => ({ foco: d.foco, grupos: d.grupos })))
    setAgenda(p.agenda)
    setNome(p.nome)
    setInicializado(true)
  }, [editando, treino, inicializado])

  const set = <K extends keyof ConfigTreino>(k: K, v: ConfigTreino[K]) => setCfg(c => ({ ...c, [k]: v }))

  const escolherDivisao = (novoN: number) => {
    setN(novoN)
    const atual = editando && treino ? treino.plano.dias : []
    // mantém foco/grupos já definidos para letras existentes no modo edição
    setTreinos(modeloDivisao(novoN).map((m, i) => {
      const d = atual[i]
      return d && atual.length === novoN ? { foco: d.foco, grupos: d.grupos } : m
    }))
    setAgenda(agendaPadrao(cfg.frequencia, novoN))
  }

  const mudarFrequencia = (f: number) => {
    set('frequencia', f)
    const novoN = n > f ? divisaoSugerida(f) : n
    if (novoN !== n) { setN(novoN); setTreinos(modeloDivisao(novoN)) }
    setAgenda(agendaPadrao(f, novoN))
  }

  const mudarLocal = (local: string) => {
    setCfg(c => ({ ...c, local, equipamentos: EQUIP_POR_LOCAL[local] ?? c.equipamentos }))
  }

  const toggle = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v])

  const opcoes = useMemo(() => opcoesDivisao(cfg.frequencia), [cfg.frequencia])

  const nomePadrao = `${cfg.objetivo} · ${n > 1 ? 'Treino ' + LETRAS.slice(0, n).join('') : 'Corpo inteiro'}`

  const montarPlanoManual = (): PlanoTreino => ({
    versao: 2,
    nome: nome.trim() || nomePadrao,
    objetivo: cfg.objetivo,
    nivel: cfg.nivel,
    frequencia_semanal: cfg.frequencia,
    origem: modo,
    divisao: LETRAS.slice(0, n).join(''),
    agenda,
    config: cfg,
    dias: aplicarDivisao(editando && treino ? treino.plano.dias : [], treinos, cfg.duracao),
    observacoes: editando && treino ? treino.plano.observacoes : [],
  })

  const concluir = async () => {
    if (!user) return
    setErro('')
    if (editando && treino) {
      const removidos = treino.plano.dias.slice(n).filter(d => d.exercicios.length > 0)
      if (removidos.length && !confirm(`Os treinos ${removidos.map(d => d.letra).join(', ')} serão removidos junto com seus exercícios. Continuar?`)) return
      setGerando(true)
      try {
        await salvar(montarPlanoManual())
        navigate(`/treino/${treino.id}`)
      } catch { setErro('Não foi possível salvar as alterações.') } finally { setGerando(false) }
      return
    }
    setGerando(true)
    try {
      let plano: PlanoTreino
      if (modo === 'ia') {
        plano = await gerarPlanoTreino(cfg, treinos, agenda)
        if (nome.trim()) plano.nome = nome.trim()
      } else {
        plano = montarPlanoManual()
      }
      const criado = await criarPlano(user.id, plano)
      navigate(`/treino/${criado.id}`, { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setErro(msg.includes('API key') ? 'Chave da OpenAI inválida.' : 'Não foi possível criar o plano. Tente novamente.')
    } finally { setGerando(false) }
  }

  if (editando && (carregando || !inicializado)) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (gerando && modo === 'ia' && !editando) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-16" translate="no">
        <Spinner size="lg" />
        <div>
          <p className="font-semibold text-green-400">Montando seu plano com IA...</p>
          <p className="text-sm text-zinc-500 mt-1">Escolhendo exercícios do catálogo para cada treino ({LETRAS.slice(0, n).join(', ')})</p>
        </div>
      </div>
    )
  }

  const titulo = editando ? 'Editar plano' : modo === 'ia' ? 'Criar com IA' : 'Montar meu próprio treino'

  return (
    <div className="flex flex-col gap-5 pb-4" translate="no">
      <div className="flex items-center gap-3">
        <button onClick={() => (etapa > 0 ? setEtapa(etapa - 1) : navigate(editando ? `/treino/${id}` : '/treino'))}
          className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-100 truncate">{titulo}</h1>
          <p className="text-sm text-zinc-500">Etapa {etapa + 1} de 2 · {etapa === 0 ? 'Configuração' : 'Divisão dos treinos'}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[0, 1].map(i => <div key={i} className={`h-1 rounded-full ${i <= etapa ? 'bg-green-500' : 'bg-zinc-800'}`} />)}
      </div>

      {etapa === 0 && (
        <div className="flex flex-col gap-5">
          {!editando && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl">
              {(['ia', 'manual'] as const).map(m => (
                <button key={m} onClick={() => setModo(m)}
                  className={`py-2 rounded-xl text-sm font-semibold transition ${modo === m ? 'bg-green-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {m === 'ia' ? '✨ Criar com IA' : '🛠 Montar manualmente'}
                </button>
              ))}
            </div>
          )}

          <div>
            <Rotulo>Objetivo</Rotulo>
            <div className="flex flex-wrap gap-2">
              {OBJETIVOS.map(o => <Chip key={o} ativo={cfg.objetivo === o} onClick={() => set('objetivo', o)}>{o}</Chip>)}
            </div>
          </div>

          <div>
            <Rotulo>Frequência semanal</Rotulo>
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map(f => (
                <button key={f} onClick={() => mudarFrequencia(f)}
                  className={`h-11 rounded-xl font-bold transition ${cfg.frequencia === f ? 'bg-green-500 text-zinc-950' : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600'}`}>
                  {f}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">{cfg.frequencia} {cfg.frequencia === 1 ? 'dia' : 'dias'} de treino por semana</p>
          </div>

          <div>
            <Rotulo>Duração média por sessão</Rotulo>
            <div className="flex items-center gap-2 flex-wrap">
              {[30, 45, 60, 75, 90].map(m => <Chip key={m} ativo={cfg.duracao === m} onClick={() => set('duracao', m)}>{m} min</Chip>)}
              <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                <input type="number" min={10} max={240} value={cfg.duracao}
                  onChange={e => set('duracao', Math.min(240, Math.max(10, +e.target.value || 10)))}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                min
              </label>
            </div>
          </div>

          <div>
            <Rotulo>Nível de experiência</Rotulo>
            <div className="flex flex-wrap gap-2">
              {NIVEIS.map(o => <Chip key={o} ativo={cfg.nivel === o} onClick={() => set('nivel', o)}>{o}</Chip>)}
            </div>
          </div>

          <div>
            <Rotulo>Local de treino</Rotulo>
            <div className="flex flex-wrap gap-2">
              {LOCAIS.map(o => <Chip key={o} ativo={cfg.local === o} onClick={() => mudarLocal(o)}>{o}</Chip>)}
            </div>
          </div>

          <div>
            <Rotulo extra={`${cfg.equipamentos.length} selecionados`}>Equipamentos disponíveis</Rotulo>
            <div className="flex flex-wrap gap-2">
              {OPCOES_EQUIPAMENTO.map(o => (
                <Chip key={o.id} ativo={cfg.equipamentos.includes(o.id)} onClick={() => set('equipamentos', toggle(cfg.equipamentos, o.id))}>{o.label}</Chip>
              ))}
            </div>
          </div>

          <div>
            <Rotulo extra="opcional">Grupos musculares prioritários</Rotulo>
            <div className="flex flex-wrap gap-2">
              {GRUPO_IDS.map(g => (
                <Chip key={g} ativo={cfg.grupos.includes(g)} onClick={() => set('grupos', toggle(cfg.grupos, g))}>{GRUPOS[g]}</Chip>
              ))}
            </div>
          </div>

          <div>
            <Rotulo extra="opcional">Restrições e preferências</Rotulo>
            <textarea value={cfg.restricoes} onChange={e => set('restricoes', e.target.value)} rows={3}
              placeholder="Ex.: evitar agachamento livre, dor no ombro, prefiro máquinas..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
          </div>
        </div>
      )}

      {etapa === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <Rotulo>Quantos treinos diferentes?</Rotulo>
            <p className="text-xs text-zinc-500 -mt-1 mb-2">Você treina {cfg.frequencia}x por semana. A divisão define quantos treinos distintos se alternam nessas sessões.</p>
            <div className="flex flex-col gap-2">
              {opcoes.map(o => (
                <button key={o.n} onClick={() => escolherDivisao(o.n)}
                  className={`text-left rounded-2xl px-4 py-3 border transition flex items-center gap-3 ${n === o.n ? 'bg-green-500/10 border-green-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
                  <span className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${n === o.n ? 'border-green-500' : 'border-zinc-600'}`}>
                    {n === o.n && <span className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-100">{o.nome}</span>
                      {o.sugerida && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500 text-zinc-950">Sugerido</span>}
                    </span>
                    <span className="block text-xs text-zinc-500 mt-0.5">{o.descricao}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Rotulo>Personalize cada treino</Rotulo>
            <div className="flex flex-col gap-3">
              {treinos.map((t, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-8 h-8 rounded-lg bg-green-500/15 text-green-400 font-bold flex items-center justify-center shrink-0">{LETRAS[i]}</span>
                    <input value={t.foco} placeholder="Foco do treino (ex.: Peito e tríceps)"
                      onChange={e => setTreinos(ts => ts.map((x, j) => (j === i ? { ...x, foco: e.target.value } : x)))}
                      className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {GRUPO_IDS.map(g => (
                      <Chip key={g} pequeno ativo={t.grupos.includes(g)}
                        onClick={() => setTreinos(ts => ts.map((x, j) => (j === i ? { ...x, grupos: toggle(x.grupos, g) } : x)))}>
                        {GRUPOS[g]}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Rotulo extra="opcional">Sessões da semana</Rotulo>
            <div className="flex flex-col gap-2">
              {agenda.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-16 shrink-0">Sessão {i + 1}</span>
                  <select value={s.letra} onChange={e => setAgenda(a => a.map((x, j) => (j === i ? { ...x, letra: e.target.value } : x)))}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500">
                    {LETRAS.slice(0, n).map(l => <option key={l} value={l}>Treino {l}</option>)}
                  </select>
                  <select value={s.diaSemana ?? ''} onChange={e => setAgenda(a => a.map((x, j) => (j === i ? { ...x, diaSemana: e.target.value || undefined } : x)))}
                    className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">Dia livre</option>
                    {DIAS_SEMANA.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Rotulo extra="opcional">Nome do plano</Rotulo>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder={nomePadrao}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {!editando && modo === 'manual' && (
            <p className="text-xs text-zinc-500">Depois de criar, abra cada treino para adicionar os exercícios pelo catálogo.</p>
          )}
          {erro && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{erro}</div>}
        </div>
      )}

      <div className="sticky bottom-[76px] z-10 grid grid-cols-2 gap-3 pt-3 pb-1 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent">
        <button onClick={() => (etapa > 0 ? setEtapa(etapa - 1) : navigate(editando ? `/treino/${id}` : '/treino'))}
          className="py-3.5 rounded-2xl font-semibold bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition">
          Voltar
        </button>
        {etapa === 0 ? (
          <button onClick={() => setEtapa(1)} disabled={cfg.frequencia < 1 || cfg.duracao < 10}
            className="py-3.5 rounded-2xl font-bold bg-green-500 text-zinc-950 hover:bg-green-400 transition disabled:opacity-50">
            Continuar
          </button>
        ) : (
          <button onClick={concluir} disabled={gerando}
            className="py-3.5 rounded-2xl font-bold bg-green-500 text-zinc-950 hover:bg-green-400 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {gerando && <Spinner size="sm" />}
            {editando ? 'Salvar alterações' : modo === 'ia' ? '✨ Gerar plano' : 'Criar plano'}
          </button>
        )}
      </div>
    </div>
  )
}
