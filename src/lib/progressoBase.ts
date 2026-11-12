// Lógica pura de progresso (testada em tests/logica.test.ts):
//  - revisão semanal da meta de calorias (gasto real estimado pelo peso e pelo diário);
//  - sequência de semanas treinando e conquistas.
import { CALORIAS_MINIMAS, type Objetivo, type Sexo } from './metas'

const paraData = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const somar = (s: string, n: number) => { const d = paraData(s); d.setDate(d.getDate() + n); return iso(d) }
const dias = (a: string, b: string) => Math.round((paraData(b).getTime() - paraData(a).getTime()) / 86_400_000)
export const segundaDa = (s: string) => { const d = paraData(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d) }
const fmt = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 })

// --- Revisão semanal da meta ---

export interface Revisao {
  tipo: 'ajustar' | 'manter'
  atuais: number
  sugeridas: number
  variacaoKg: number
  semanas: number
  mediaConsumo: number
  gastoEstimado: number
  texto: string
}

/**
 * Compara o que a pessoa comeu com o que o peso fez e estima o gasto real (1 kg ≈ 7.700 kcal).
 * Precisa de 2 pesagens com pelo menos 10 dias entre elas (últimas 3 semanas) e 7 dias de diário (últimas 2 semanas).
 * A meta muda no máximo 250 kcal por semana e nunca fica abaixo do mínimo seguro.
 * Se a pessoa comeu bem acima da meta, não baixa: pede para seguir a meta atual primeiro.
 */
export function revisaoSemanal(p: {
  calorias: number; objetivo: Objetivo; ritmo_kg_semana: number; sexo: Sexo
  pesos: { data: string; peso_kg: number }[]; consumo: { data: string; kcal: number }[]; hoje: string
}): Revisao | null {
  const pesos = p.pesos.filter(x => x.data >= somar(p.hoje, -21) && x.data <= p.hoje).sort((a, b) => a.data.localeCompare(b.data))
  if (pesos.length < 2 || dias(pesos[0].data, pesos[pesos.length - 1].data) < 10) return null
  const consumo = p.consumo.filter(c => c.data >= somar(p.hoje, -14) && c.data < p.hoje && c.kcal >= 600)
  if (consumo.length < 7) return null
  // tendência do peso (regressão linear, kg por dia): menos sensível a um dia de retenção
  const xs = pesos.map(x => dias(pesos[0].data, x.data)), ys = pesos.map(x => x.peso_kg)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const porDia = den ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den : 0
  const media = Math.round(consumo.reduce((s, c) => s + c.kcal, 0) / consumo.length)
  const gasto = Math.round(media - porDia * 7700)
  const ritmo = p.objetivo === 'manter' ? 0 : Math.min(Math.max(p.ritmo_kg_semana, 0.1), 1) * (p.objetivo === 'perder' ? -1 : 1)
  const ideal = gasto + (ritmo * 7700) / 7
  const minimo = CALORIAS_MINIMAS[p.sexo]
  let sugeridas = Math.round(Math.max(minimo, Math.min(p.calorias + 250, Math.max(p.calorias - 250, ideal))) / 50) * 50
  const semanas = Math.max(1, Math.round(dias(pesos[0].data, pesos[pesos.length - 1].data) / 7))
  const variacaoKg = Math.round(porDia * dias(pesos[0].data, pesos[pesos.length - 1].data) * 10) / 10
  const fezPeso = `${variacaoKg < 0 ? 'perdeu' : variacaoKg > 0 ? 'ganhou' : 'manteve o peso'}${variacaoKg ? ` ${fmt(Math.abs(variacaoKg))} kg` : ''}`
  const base = `Em ${semanas} ${semanas === 1 ? 'semana' : 'semanas'} você ${fezPeso}, comendo em média ${fmt(media, 0)} kcal por dia.`
  const objetivoTxt = p.objetivo === 'manter' ? 'manter o peso' : `${p.objetivo === 'perder' ? 'perder' : 'ganhar'} ${fmt(Math.abs(ritmo))} kg por semana`
  // comeu bem acima da meta e quer perder: o ajuste certo é seguir a meta, não baixar
  if (p.objetivo === 'perder' && media > p.calorias * 1.1 && sugeridas < p.calorias) {
    return { tipo: 'manter', atuais: p.calorias, sugeridas: p.calorias, variacaoKg, semanas, mediaConsumo: media, gastoEstimado: gasto,
      texto: `${base} Isso ficou acima da sua meta de ${fmt(p.calorias, 0)} kcal: antes de mudar a meta, tente segui-la por mais uma semana.` }
  }
  if (Math.abs(sugeridas - p.calorias) < 80) {
    sugeridas = p.calorias
    return { tipo: 'manter', atuais: p.calorias, sugeridas, variacaoKg, semanas, mediaConsumo: media, gastoEstimado: gasto,
      texto: `${base} Está no ritmo para ${objetivoTxt}: a meta de ${fmt(p.calorias, 0)} kcal continua boa.` }
  }
  return { tipo: 'ajustar', atuais: p.calorias, sugeridas, variacaoKg, semanas, mediaConsumo: media, gastoEstimado: gasto,
    texto: `${base} Seu gasto real ficou perto de ${fmt(gasto, 0)} kcal. Para ${objetivoTxt}, a meta sugerida é ${fmt(sugeridas, 0)} kcal (${sugeridas > p.calorias ? '+' : ''}${fmt(sugeridas - p.calorias, 0)}).` }
}

// --- Sequência e conquistas ---

export interface Conquista { id: string; titulo: string; descricao: string; emoji: string; obtida: boolean; progresso?: string }
export interface Sequencia { semanasSeguidas: number; melhorSequencia: number; estaSemana: number; metaSemanal: number; total: number; conquistas: Conquista[] }

/**
 * Semanas seguidas (segunda a domingo) com a meta de treinos feita; a semana atual conta quando já bateu a meta,
 * senão a sequência vale até a semana passada (ainda dá tempo).
 * `inicios` = início de cada treino feito (data e hora); `recordes` = recordes de carga batidos.
 */
export function sequenciaETreinos(inicios: string[], frequencia: number, recordes: number, hoje: string): Sequencia {
  const meta = Math.max(1, Math.min(7, frequencia || 3))
  const porSemana = new Map<string, number>()
  const datas = inicios.map(t => { const d = new Date(t); return { dia: iso(d), hora: d.getHours() } })
  datas.forEach(d => { const s = segundaDa(d.dia); porSemana.set(s, (porSemana.get(s) ?? 0) + 1) })
  const atual = segundaDa(hoje)
  const estaSemana = porSemana.get(atual) ?? 0
  let semanasSeguidas = 0
  for (let s = estaSemana >= meta ? atual : somar(atual, -7); (porSemana.get(s) ?? 0) >= meta; s = somar(s, -7)) semanasSeguidas++
  // melhor sequência da história
  const semanas = [...porSemana.keys()].sort()
  let melhor = 0, corrente = 0, anterior = ''
  for (const s of semanas) {
    if ((porSemana.get(s) ?? 0) >= meta) { corrente = anterior && somar(anterior, 7) === s ? corrente + 1 : 1; anterior = s; melhor = Math.max(melhor, corrente) }
  }
  const total = inicios.length
  const perfeita = [...porSemana.values()].some(n => n >= Math.max(meta, 3))
  const lista: [string, string, string, string, boolean, string?][] = [
    ['primeiro', 'Primeiro treino', 'Fez o primeiro treino no app', '🎯', total >= 1],
    ...([10, 25, 50, 100, 250] as const).map(n => [`treinos-${n}`, `${n} treinos`, `Completou ${n} treinos`, n >= 100 ? '🏅' : '💪', total >= n, total < n ? `${total}/${n}` : undefined] as [string, string, string, string, boolean, string?]),
    ...([2, 4, 8, 12] as const).map(n => [`seq-${n}`, `${n} semanas seguidas`, `Bateu a meta de ${meta} treinos por semana ${n} semanas seguidas`, '🔥', melhor >= n, melhor < n ? `${melhor}/${n}` : undefined] as [string, string, string, string, boolean, string?]),
    ['perfeita', 'Semana perfeita', 'Fez todos os treinos da semana', '⭐', perfeita],
    ['recorde-1', 'Primeiro recorde', 'Bateu um recorde de carga', '🏆', recordes >= 1],
    ['recorde-10', '10 recordes', 'Bateu 10 recordes de carga', '🏆', recordes >= 10, recordes < 10 ? `${recordes}/10` : undefined],
    ['madrugador', 'Madrugador', 'Treinou antes das 7h', '🌅', datas.some(d => d.hora < 7)],
    ['coruja', 'Coruja', 'Treinou depois das 21h', '🌙', datas.some(d => d.hora >= 21)],
  ]
  return {
    semanasSeguidas, melhorSequencia: melhor, estaSemana, metaSemanal: meta, total,
    conquistas: lista.map(([id, titulo, descricao, emoji, obtida, progresso]) => ({ id, titulo, descricao, emoji, obtida, ...(progresso ? { progresso } : {}) })),
  }
}
