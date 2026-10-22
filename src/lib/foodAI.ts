import { chatCompletion } from './aiClient'

export interface FoodEstimate {
  nome: string
  quantidade: string
  calorias: number
  proteina_g: number
  carboidrato_g: number
  gordura_g: number
  observacao?: string
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

export async function analisarImagemAlimento(base64DataUrl: string): Promise<FoodEstimate[]> {
  const resp = await chatCompletion({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identifique cada alimento visível neste prato e estime os macronutrientes de cada um, com base nas porções que você consegue estimar visualmente.' },
          { type: 'image_url', image_url: { url: base64DataUrl, detail: 'low' } },
        ],
      },
    ],
  })
  return parseJson(resp.choices[0]?.message?.content)
}
