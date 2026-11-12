import { CATALOGO, GRUPOS } from '../data/exercicios'
import { encontrarPorNome } from './busca'
import {
  equipamentosCobertos, normalizarExercicio, uid,
  type ConfigTreino, type DiaTreino, type ExercicioPlano, type PlanoTreino, type SlotAgenda, type TreinoDivisao,
} from './treinoModel'
import { chatCompletion } from './aiClient'
import {
  LIMITE_EXTRA, agendaDasSemanas, dataComDia, divisaoPorAtribuicao, exerciciosDoPerdido, fimSemana, parteDoExercicio,
  planejarDivisao, somar, vagas, type Agendado, type Divisao,
} from './semanaBase'

// --- Geração de Dieta ---

export interface DietaFormData {
  objetivo: string
  peso: number
  altura: number
  idade: number
  sexo: string
  nivel_atividade: string
  restricoes: string
  refeicoes_dia: number
  calorias_alvo?: number
}

export interface Refeicao {
  nome: string
  horario: string
  calorias: number
  alimentos: { nome: string; quantidade: string; calorias: number }[]
}

export interface PlanoAlimentar {
  nome: string
  objetivo: string
  calorias_dia: number
  macros: { proteina_g: number; carboidrato_g: number; gordura_g: number }
  refeicoes: Refeicao[]
  dicas: string[]
}

export async function gerarDieta(dados: DietaFormData): Promise<PlanoAlimentar> {
  const prompt = `Você é um nutricionista especializado. Crie um plano alimentar detalhado e personalizado em JSON.

Dados do usuário:
- Objetivo: ${dados.objetivo}
- Sexo: ${dados.sexo}
- Idade: ${dados.idade} anos
- Peso: ${dados.peso} kg
- Altura: ${dados.altura} cm
- Nível de atividade: ${dados.nivel_atividade}
- Restrições alimentares: ${dados.restricoes || 'Nenhuma'}
- Número de refeições por dia: ${dados.refeicoes_dia}
${dados.calorias_alvo ? `- Meta calórica: ${dados.calorias_alvo} kcal` : ''}

Retorne APENAS JSON válido neste formato exato:
{
  "nome": "Nome descritivo do plano",
  "objetivo": "objetivo resumido",
  "calorias_dia": número,
  "macros": { "proteina_g": número, "carboidrato_g": número, "gordura_g": número },
  "refeicoes": [
    {
      "nome": "Nome da refeição",
      "horario": "HH:MM",
      "calorias": número,
      "alimentos": [
        { "nome": "Alimento", "quantidade": "quantidade com unidade", "calorias": número }
      ]
    }
  ],
  "dicas": ["dica 1", "dica 2", "dica 3"]
}`

  const response = await chatCompletion({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da IA')

  return JSON.parse(content) as PlanoAlimentar
}

/** Soma as calorias dos alimentos em cada refeição e no dia (após edição manual ou pela IA). */
export function recalcularDieta(plano: PlanoAlimentar): PlanoAlimentar {
  const refeicoes = (plano.refeicoes ?? []).map(r => ({
    ...r,
    alimentos: r.alimentos ?? [],
    calorias: Math.round((r.alimentos ?? []).reduce((s, a) => s + (Number(a.calorias) || 0), 0)),
  }))
  return { ...plano, refeicoes, calorias_dia: refeicoes.reduce((s, r) => s + r.calorias, 0) }
}

/** Ajusta um plano existente conforme o pedido da pessoa (ex.: "troque o frango por peixe"). */
export async function ajustarDieta(plano: PlanoAlimentar, pedido: string): Promise<PlanoAlimentar> {
  const prompt = `Você é um nutricionista. Ajuste o plano alimentar abaixo conforme o pedido do cliente.
Mantenha o mesmo formato JSON, altere só o necessário, recalcule calorias e macros e responda em português do Brasil.

Pedido do cliente: ${pedido}

Plano atual:
${JSON.stringify(plano)}

Retorne APENAS o JSON do plano completo atualizado.`
  const response = await chatCompletion({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  })
  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da IA')
  const novo = JSON.parse(content) as PlanoAlimentar
  if (!Array.isArray(novo.refeicoes) || novo.refeicoes.length === 0) throw new Error('A IA não conseguiu ajustar o plano. Tente descrever de outro jeito.')
  return recalcularDieta({ ...plano, ...novo, macros: novo.macros ?? plano.macros, dicas: novo.dicas ?? plano.dicas })
}

// --- Geração de Treino ---

export type { PlanoTreino } from './treinoModel'

interface RespostaIA {
  nome?: string
  observacoes?: string[]
  treinos?: { letra?: string; duracao_estimada_min?: number; exercicios?: Record<string, unknown>[] }[]
}

/** Gera os exercícios de cada treino da divisão escolhida, a partir das configurações do usuário. */
export async function gerarPlanoTreino(
  config: ConfigTreino,
  treinos: TreinoDivisao[],
  agenda: SlotAgenda[],
): Promise<PlanoTreino> {
  const equip = equipamentosCobertos(config.equipamentos)
  const catalogo = CATALOGO.filter(e => equip.length === 0 || equip.includes(e.equipamento))
    .map(e => `${e.nome} (${GRUPOS[e.grupo]})`).join('; ')
  const letras = treinos.map((_, i) => String.fromCharCode(65 + i))
  const divisao = treinos.map((t, i) => `Treino ${letras[i]}: ${t.foco} — grupos: ${t.grupos.map(g => GRUPOS[g]).join(', ') || 'livre'}`).join(String.fromCharCode(10))

  const prompt = `Você é um personal trainer especializado em musculação. Monte os exercícios de um plano semanal em JSON.

Configuração do aluno:
- Objetivo: ${config.objetivo}
- Nível: ${config.nivel}
- Frequência: ${config.frequencia} sessões por semana (sequência: ${agenda.map(s => s.letra).join(' ')})
- Duração média por sessão: ${config.duracao} minutos
- Local: ${config.local}
- Grupos prioritários: ${config.grupos.map(g => GRUPOS[g]).join(', ') || 'nenhum em especial'}
- Restrições e preferências: ${config.restricoes || 'nenhuma'}

Divisão (gere exatamente estes treinos, respeitando os grupos de cada um):
${divisao}

Use SOMENTE exercícios desta lista (copie o nome exatamente como está), compatíveis com os equipamentos disponíveis:
${catalogo}

Regras: quantidade de exercícios compatível com a duração; séries e repetições adequadas ao objetivo e nível;
tempo_execucao_segundos = duração de UMA série; tempo_descanso_segundos entre 30 e 180.

Retorne APENAS JSON válido neste formato:
{
  "nome": "Nome curto do plano",
  "observacoes": ["orientação 1", "orientação 2"],
  "treinos": [
    { "letra": "A", "duracao_estimada_min": número, "exercicios": [
      { "nome": "Nome exato da lista", "series": número, "repeticoes": "8-12", "tempo_execucao_segundos": número,
        "tempo_descanso_segundos": número, "dica": "dica curta" }
    ] }
  ]
}`

  const response = await chatCompletion({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.6,
  })
  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da IA')
  const r = JSON.parse(content) as RespostaIA

  const dias: DiaTreino[] = treinos.map((t, i) => {
    const letra = letras[i]
    const gerado = r.treinos?.find(x => (x.letra ?? '').toUpperCase() === letra) ?? r.treinos?.[i]
    const id = uid('d')
    return {
      id,
      letra,
      dia: `Treino ${letra}`,
      foco: t.foco,
      grupos: t.grupos,
      duracao_estimada_min: Math.round(Number(gerado?.duracao_estimada_min) || config.duracao),
      exercicios: (gerado?.exercicios ?? []).map(e => {
        const cat = encontrarPorNome(String(e.nome ?? ''))
        const ex = normalizarExercicio(e, uid('e'))
        if (cat) {
          ex.catalogo_id = cat.id
          ex.nome = cat.nome
          ex.grupos_musculares = [GRUPOS[cat.grupo], ...cat.secundarios.map(g => GRUPOS[g])]
          ex.equipamento = cat.equipamento
          ex.instrucoes = ex.instrucoes ?? cat.instrucoes
        }
        return ex
      }),
    }
  })

  return {
    versao: 2,
    nome: r.nome || `${config.objetivo} · ${treinos.length > 1 ? 'Treino ' + letras.join('') : 'Corpo inteiro'}`,
    objetivo: config.objetivo,
    nivel: config.nivel,
    frequencia_semanal: config.frequencia,
    origem: 'ia',
    divisao: letras.join(''),
    agenda,
    config,
    dias,
    observacoes: Array.isArray(r.observacoes) ? r.observacoes.map(String) : [],
  }
}

// --- Treino perdido: divisão analisada pela IA ---

/**
 * A IA analisa o plano inteiro (o que cada dia treina, descansos, objetivo e nível) e diz em qual sessão vai cada
 * exercício do treino perdido. O app confere a resposta (todo exercício uma vez, só em sessões válidas) e calcula os
 * avisos; se a IA falhar, responder errado ou propor algo com mais avisos que as regras do app, vale a divisão pelas regras.
 */
export async function planejarDivisaoComIA(p: PlanoTreino, perdido: Agendado, hoje: string, hojeFeito: boolean, semanas: 1 | 2): Promise<Divisao | null> {
  const regras = planejarDivisao(p, perdido, hoje, hojeFeito, semanas)
  if (!regras) return null
  try {
    const slots = vagas(p, perdido, hoje, hojeFeito, semanas)
    const exs = exerciciosDoPerdido(p, perdido)
    const sid = new Map(slots.map((s, i) => [s.data, `S${i + 1}`]))
    const eid = new Map(exs.map((e, i) => [e.id, `E${i + 1}`]))
    const descr = (e: ExercicioPlano) => `${e.nome} (${parteDoExercicio(e)}; ${e.series}x${e.repeticoes || '-'})`
    const fim = semanas === 2 ? somar(fimSemana(hoje), 7) : fimSemana(hoje)
    const agenda = agendaDasSemanas(p, hoje, 3)
    const linhas: string[] = []
    for (let d = somar(hoje, -1); d <= somar(fim, 1); d = somar(d, 1)) {
      const doDia = [
        ...agenda.filter(a => a.data === d && a.data !== perdido.data).map(a => p.dias[a.diaIdx]),
        ...(p.encaixes ?? []).filter(e => e.data === d).map(e => p.dias.find(x => x.letra === e.letra)),
      ].filter((x): x is DiaTreino => !!x)
      const marca = d === hoje ? ' (hoje)' : ''
      const quem = sid.get(d) ? ` [${sid.get(d)}]` : ''
      linhas.push(d === perdido.data ? `${dataComDia(d)}${marca}: treino perdido (não treinou)`
        : doDia.length ? `${dataComDia(d)}${marca}${quem}: ${doDia.map(x => `Treino ${x.letra} — ${x.exercicios.filter(e => !e.temporarioAte).map(descr).join('; ') || x.foco}`).join(' + ')}`
        : `${dataComDia(d)}${marca}: descanso`)
    }
    const propostaRegras = regras.destinos.map(d => `${sid.get(d.data)}: ${d.exercicios.map(e => eid.get(e.id)).join(', ')}`).join(' | ')

    const prompt = `Você é um personal trainer. O aluno perdeu um treino e quer distribuir esse treino nas próximas sessões, sem perder o treino e sem atrapalhar o resultado.

Aluno: objetivo ${p.config.objetivo}, nível ${p.config.nivel}.

Treino perdido (Treino ${perdido.letra}, ${dataComDia(perdido.data)}):
${exs.map(e => `${eid.get(e.id)}: ${descr(e)}`).join('\n')}

Agenda dia a dia (as sessões que podem receber exercícios estão marcadas [S1], [S2]...):
${linhas.join('\n')}

Regras:
- Cada exercício (E1, E2...) vai para exatamente UMA sessão marcada; não mude séries, repetições nem carga.
- Evite o mesmo grupo muscular em dias seguidos (olhe a véspera e o dia seguinte de cada sessão, inclusive os já treinados).
- Pode separar partes do mesmo grupo (ex.: bíceps num dia e tríceps em outro; quadríceps num dia e posterior em outro; uma parte das costas num dia e outra em outro), desde que não fiquem em dias seguidos.
- Não deixe nenhuma sessão pesada: no máximo cerca de ${LIMITE_EXTRA} séries a mais por sessão, equilibrando entre as sessões.
- Evite dobrar o volume de um músculo numa sessão que já treina pesado esse mesmo músculo.
- Pense na recuperação e no objetivo do aluno; prefira as sessões mais cedo quando não houver prejuízo.

Proposta inicial (pode manter ou melhorar): ${propostaRegras}

Retorne APENAS JSON válido neste formato:
{ "sessoes": { "S1": ["E1", "E2"], "S2": ["E3"] }, "explicacao": "uma ou duas frases simples, em português, dizendo como dividiu e por quê" }`

    const response = await chatCompletion({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 })
    const r = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { sessoes?: Record<string, string[]>; explicacao?: string }
    const dataDe = new Map([...sid].map(([d, s]) => [s, d]))
    const idDe = new Map([...eid].map(([id, e]) => [e, id]))
    const porData: Record<string, string[]> = {}
    for (const [s, lista] of Object.entries(r.sessoes ?? {})) {
      const d = dataDe.get(s)
      if (!d || !Array.isArray(lista)) return regras
      porData[d] = lista.map(x => idDe.get(String(x)) ?? '?')
    }
    const ia = divisaoPorAtribuicao(p, perdido, hoje, hojeFeito, semanas, porData, typeof r.explicacao === 'string' ? r.explicacao.slice(0, 400) : undefined)
    return ia && ia.alertas.length <= regras.alertas.length ? ia : regras
  } catch {
    return regras
  }
}
