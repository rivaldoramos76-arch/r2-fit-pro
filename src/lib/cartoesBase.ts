// Conteúdo dos cartões de compartilhar (o desenho fica em cartaoImagem.ts). Sem dependências; testado em tests/metas.test.ts.

export interface Cartao {
  /** Faixa pequena no topo (ex.: "TREINO CONCLUÍDO") */
  etiqueta: string
  emoji: string
  /** Número ou frase grande */
  destaque: string
  /** Linha abaixo do destaque */
  subtitulo: string
  /** Até 3 indicadores */
  stats: { rotulo: string; valor: string }[]
  /** Texto que acompanha a imagem ao compartilhar */
  texto: string
}

export const SITE = 'r2fitpro.com.br'
const n = (v: number, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 })
const convite = `Treino e dieta com IA: https://${SITE}`

export function cartaoTreino(d: { dia: string; foco?: string; exercicios: number; series: number; minutos: number | null }): Cartao {
  return {
    etiqueta: 'TREINO CONCLUÍDO', emoji: '💪', destaque: d.dia, subtitulo: d.foco || 'Mais um treino feito',
    stats: [
      { rotulo: 'exercícios', valor: n(d.exercicios) },
      { rotulo: 'séries', valor: n(d.series) },
      ...(d.minutos && d.minutos > 0 ? [{ rotulo: 'minutos', valor: n(d.minutos) }] : []),
    ],
    texto: `Treino concluído no R2 Fit Pro 💪 ${convite}`,
  }
}

export function cartaoSemana(d: { diasRegistrados: number; diasNaMeta: number | null; mediaCalorias: number; treinos: number; variacaoPeso: number | null }): Cartao {
  const meta = d.diasNaMeta !== null && d.diasRegistrados > 0
  return {
    etiqueta: 'MINHA SEMANA', emoji: '📊',
    destaque: meta ? `${d.diasNaMeta}/${d.diasRegistrados}` : `${d.diasRegistrados}/7`,
    subtitulo: meta ? 'dias dentro da meta' : 'dias registrados no diário',
    stats: [
      { rotulo: 'kcal por dia', valor: n(d.mediaCalorias) },
      { rotulo: d.treinos === 1 ? 'treino' : 'treinos', valor: n(d.treinos) },
      ...(d.variacaoPeso !== null ? [{ rotulo: 'kg na semana', valor: `${d.variacaoPeso > 0 ? '+' : ''}${n(d.variacaoPeso, 1)}` }] : []),
    ],
    texto: `Minha semana no R2 Fit Pro 📊 ${convite}`,
  }
}

export function cartaoPeso(d: { inicial: number; atual: number; dias: number; meta?: number | null }): Cartao {
  const dif = Math.round((d.atual - d.inicial) * 10) / 10
  const perdeu = dif < 0
  return {
    etiqueta: 'MINHA EVOLUÇÃO', emoji: perdeu ? '🔥' : '⚖️',
    destaque: dif === 0 ? 'Peso mantido' : `${perdeu ? '−' : '+'}${n(Math.abs(dif), 1)} kg`,
    subtitulo: d.dias > 1 ? `em ${n(d.dias)} dias` : 'desde o primeiro registro',
    stats: [
      { rotulo: 'kg no início', valor: n(d.inicial, 1) },
      { rotulo: 'kg agora', valor: n(d.atual, 1) },
      ...(d.meta ? [{ rotulo: 'kg de meta', valor: n(d.meta, 1) }] : []),
    ],
    texto: `${perdeu ? `Já foram ${n(Math.abs(dif), 1)} kg` : 'Minha evolução'} com o R2 Fit Pro ${perdeu ? '🔥' : '⚖️'} ${convite}`,
  }
}

export function cartaoReceita(d: { nome: string; calorias: number; proteina_g: number; carboidrato_g: number; gordura_g: number }): Cartao {
  return {
    etiqueta: 'RECEITA FIT', emoji: '🍽️', destaque: d.nome, subtitulo: `${n(d.calorias)} kcal por porção`,
    stats: [
      { rotulo: 'proteína', valor: `${n(d.proteina_g)} g` },
      { rotulo: 'carbo', valor: `${n(d.carboidrato_g)} g` },
      { rotulo: 'gordura', valor: `${n(d.gordura_g)} g` },
    ],
    texto: `Receita: ${d.nome} (${n(d.calorias)} kcal por porção) 🍽️ ${convite}`,
  }
}

/** Quebra um texto em linhas que caibam na largura (medida fornecida pelo canvas). */
export function quebrarLinhas(texto: string, medir: (s: string) => number, largura: number, maxLinhas = 3): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p
    if (medir(tentativa) <= largura || !atual) atual = tentativa
    else { linhas.push(atual); atual = p }
  }
  if (atual) linhas.push(atual)
  if (linhas.length > maxLinhas) {
    const corte = linhas.slice(0, maxLinhas)
    corte[maxLinhas - 1] += '…'
    return corte
  }
  return linhas
}
