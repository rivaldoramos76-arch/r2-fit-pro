import { CATALOGO, GRUPOS } from '../data/exercicios'
import { encontrarPorNome } from './busca'
import {
  equipamentosCobertos, normalizarExercicio, uid,
  type ConfigTreino, type DiaTreino, type PlanoTreino, type SlotAgenda, type TreinoDivisao,
} from './treinoModel'
import { chatCompletion } from './aiClient'

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
