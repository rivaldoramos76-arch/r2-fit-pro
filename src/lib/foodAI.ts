import { chatCompletion } from './aiClient'

export interface FoodEstimate {
  nome: string
  quantidade: string
  calorias: number
  proteina_g: number
  carboidrato_g: number
  gordura_g: number
  observacao?: string
  /** Peso estimado em gramas (análise de foto) */
  gramas?: number
  /** Nome curto para buscar na tabela TACO (análise de foto) */
  busca?: string
}

const SYSTEM_PROMPT = `Você é um nutricionista especializado em estimativa calórica.
Analise o que o usuário descrever ou mostrar em foto e estime macros com base em porções típicas no Brasil.
Responda SEMPRE em JSON no formato:
{"alimentos": [{"nome": string, "quantidade": string, "calorias": number, "proteina_g": number, "carboidrato_g": number, "gordura_g": number, "observacao": string (opcional)}]}
Seja realista com as porções (ex: "1 cachorro quente simples" ≈ 290 kcal, "100g arroz branco cozido" ≈ 130 kcal).
Se a quantidade não for especificada, assuma uma porção comum.`

function parseJson(content: string | null | undefined): FoodEstimate[] {
  if (!content) return []
  try {
    const cleaned = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned)
    const arr = Array.isArray(parsed) ? parsed : parsed.alimentos ?? []
    return arr.map((a: Record<string, unknown>) => ({
      nome: String(a.nome ?? 'Alimento'),
      quantidade: String(a.quantidade ?? ''),
      calorias: Math.round(Number(a.calorias ?? 0)),
      proteina_g: Number(a.proteina_g ?? 0),
      carboidrato_g: Number(a.carboidrato_g ?? 0),
      gordura_g: Number(a.gordura_g ?? 0),
      observacao: a.observacao ? String(a.observacao) : undefined,
      gramas: Number(a.gramas) > 0 ? Math.round(Number(a.gramas)) : undefined,
      busca: a.busca ? String(a.busca).slice(0, 80) : undefined,
    }))
  } catch {
    return []
  }
}

export async function estimarAlimentoTexto(descricao: string): Promise<FoodEstimate[]> {
  const resp = await chatCompletion({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Estime os macros para: ${descricao}` },
    ],
  })
  return parseJson(resp.choices[0]?.message?.content)
}

const PROMPT_FOTO = `Você é um nutricionista que estima pratos por foto, com base em porções típicas no Brasil.
Separe o prato em itens (cada alimento visível separadamente: arroz, feijão, carne, salada, molho etc.).
Para cada item, estime o peso em gramas olhando o tamanho no prato (use o prato, talheres e copos como referência) e os macros dessa quantidade.
Em "busca", escreva um nome curto e genérico como na Tabela TACO (ex.: "arroz branco cozido", "feijão carioca cozido", "peito de frango grelhado", "alface", "batata frita").
Responda SEMPRE em JSON:
{"alimentos": [{"nome": string, "busca": string, "gramas": number, "quantidade": string, "calorias": number, "proteina_g": number, "carboidrato_g": number, "gordura_g": number, "observacao": string (opcional)}]}`

export async function analisarImagemAlimento(base64DataUrl: string): Promise<FoodEstimate[]> {
  const resp = await chatCompletion({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: PROMPT_FOTO },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Separe este prato em itens e estime os gramas de cada um.' },
          { type: 'image_url', image_url: { url: base64DataUrl, detail: 'high' } },
        ],
      },
    ],
  })
  return parseJson(resp.choices[0]?.message?.content)
}

export interface EstimativaBase {
  nome: string
  kcal: number
  proteina: number
  carboidrato: number
  gordura: number
  porcao_rotulo: string
  porcao_g: number
}

const num = (v: unknown) => Math.max(0, Number(v) || 0)

/** Valores por 100 g de um alimento que não está na TACO nem no banco (vai para o banco compartilhado). */
export async function estimarAlimentoBase(nome: string): Promise<EstimativaBase> {
  const resp = await chatCompletion({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: `Você é um nutricionista brasileiro. Para o alimento informado, dê os valores nutricionais médios POR 100 g (ou 100 ml para bebidas), como em tabelas brasileiras (TACO/TBCA) ou rótulos comuns no Brasil, e a porção caseira mais comum.
Responda só JSON: {"nome": string (nome claro do alimento, com o preparo), "kcal": number, "proteina": number, "carboidrato": number, "gordura": number, "porcao_rotulo": string (ex.: "unidade média", "fatia", "colher de sopa", "copo (200 ml)"), "porcao_g": number}.
Se não for um alimento, responda {"erro": "não é alimento"}.` },
      { role: 'user', content: nome },
    ],
  })
  const d = JSON.parse(resp.choices[0]?.message?.content ?? '{}')
  if (d.erro || !d.nome) throw new Error('Não reconhecemos esse alimento. Tente escrever de outro jeito.')
  return {
    nome: String(d.nome).slice(0, 120), kcal: Math.min(950, num(d.kcal)), proteina: Math.min(100, num(d.proteina)),
    carboidrato: Math.min(100, num(d.carboidrato)), gordura: Math.min(100, num(d.gordura)),
    porcao_rotulo: String(d.porcao_rotulo ?? 'porção').slice(0, 60), porcao_g: Math.min(2000, num(d.porcao_g)) || 100,
  }
}

/** Lê a foto da tabela nutricional de um produto e devolve os valores por 100 g. */
export async function lerTabelaNutricional(base64DataUrl: string, nomeSugerido = ''): Promise<EstimativaBase> {
  const resp = await chatCompletion({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      { role: 'system', content: `Você lê tabelas nutricionais de rótulos brasileiros. Extraia os valores e converta para POR 100 g (ou 100 ml) se a tabela trouxer só a porção.
Responda só JSON: {"nome": string (nome do produto, se aparecer; senão use o sugerido), "kcal": number, "proteina": number, "carboidrato": number, "gordura": number (gorduras totais), "porcao_rotulo": string (ex.: "porção (30 g)" ou "1 unidade"), "porcao_g": number}.
Se a imagem não tiver uma tabela nutricional legível, responda {"erro": "ilegível"}.` },
      { role: 'user', content: [
        { type: 'text', text: `Nome sugerido: ${nomeSugerido || 'desconhecido'}` },
        { type: 'image_url', image_url: { url: base64DataUrl, detail: 'high' } },
      ] },
    ],
  })
  const d = JSON.parse(resp.choices[0]?.message?.content ?? '{}')
  if (d.erro) throw new Error('Não deu para ler a tabela. Tire outra foto, de perto e com boa luz.')
  return {
    nome: String(d.nome || nomeSugerido || 'Produto').slice(0, 120), kcal: Math.min(950, num(d.kcal)), proteina: Math.min(100, num(d.proteina)),
    carboidrato: Math.min(100, num(d.carboidrato)), gordura: Math.min(100, num(d.gordura)),
    porcao_rotulo: String(d.porcao_rotulo ?? 'porção do rótulo').slice(0, 60), porcao_g: Math.min(2000, num(d.porcao_g)) || 100,
  }
}
