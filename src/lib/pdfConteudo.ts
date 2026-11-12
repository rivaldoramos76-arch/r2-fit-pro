// PDFs do treino, da dieta e do relatório da semana (para mandar ao personal ou nutricionista, ou imprimir).
import { DocPdf } from './pdfSimples'
import type { PlanoTreino } from './treinoModel'
import type { PlanoAlimentar } from './openai'

const hojeBR = () => new Date().toLocaleDateString('pt-BR')
const seg = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`)

export function pdfTreino(p: PlanoTreino): Blob {
  const d = new DocPdf(`Treino · ${p.nome}`)
  d.titulo1(p.nome)
  d.texto(`${p.objetivo} · ${p.nivel} · ${p.frequencia_semanal}x por semana · Treino ${p.divisao} · gerado em ${hojeBR()}`, { cor: [0.4, 0.4, 0.45] })
  const semana = p.agenda.filter(s => s.diaSemana).map(s => `${s.diaSemana}: ${s.letra}`).join('   ')
  if (semana) d.texto(`Semana: ${semana}`, { cor: [0.4, 0.4, 0.45], espacoAntes: 2 })
  for (const dia of p.dias) {
    d.titulo2(`${dia.dia}${dia.foco ? ` — ${dia.foco}` : ''}`)
    dia.exercicios.filter(e => !e.temporarioAte).forEach((e, i) => {
      d.texto(`${i + 1}. ${e.nome}`, { negrito: true, espacoAntes: 4 })
      const partes = e.tipo === 'cardio'
        ? [`${e.series} ${e.series === 1 ? 'rodada' : 'rodadas'}`, `${seg(e.tempo_execucao_segundos)} de trabalho`, `${seg(e.tempo_descanso_segundos)} de descanso`]
        : [`${e.series} séries de ${e.repeticoes}`, e.carga ? `carga ${e.carga}` : '', `descanso ${seg(e.tempo_descanso_segundos)}`]
      d.texto(partes.filter(Boolean).join(' · '), { recuo: 14, cor: [0.3, 0.3, 0.34] })
      if (e.dica) d.texto(`Dica: ${e.dica}`, { recuo: 14, tamanho: 9, cor: [0.45, 0.45, 0.5] })
    })
  }
  if (p.observacoes.length) { d.titulo2('Observações'); p.observacoes.forEach(o => d.texto(`• ${o}`, { recuo: 4 })) }
  return d.blob()
}

export function pdfDieta(nome: string, p: PlanoAlimentar): Blob {
  const d = new DocPdf(`Dieta · ${nome}`)
  d.titulo1(nome)
  d.texto(`${p.calorias_dia} kcal por dia${p.macros ? ` · proteína ${p.macros.proteina_g} g · carboidrato ${p.macros.carboidrato_g} g · gordura ${p.macros.gordura_g} g` : ''}`, { cor: [0.4, 0.4, 0.45] })
  d.texto(`Objetivo: ${p.objetivo} · gerado em ${hojeBR()}`, { cor: [0.4, 0.4, 0.45], espacoAntes: 2 })
  for (const r of p.refeicoes ?? []) {
    d.titulo2(`${r.nome}${r.horario ? ` · ${r.horario}` : ''} — ${r.calorias} kcal`)
    for (const a of r.alimentos ?? []) d.texto(`• ${a.nome}${a.quantidade ? ` — ${a.quantidade}` : ''} (${a.calorias} kcal)`, { recuo: 4 })
  }
  if (p.dicas?.length) { d.titulo2('Dicas'); p.dicas.forEach(t => d.texto(`• ${t}`, { recuo: 4 })) }
  return d.blob()
}

export interface DadosRelatorioPdf {
  periodo: string
  mediaCalorias: number
  metaCalorias: number | null
  diasRegistrados: number
  diasNaMeta: number | null
  macros?: { proteina_g: number; carboidrato_g: number; gordura_g: number }
  aguaMedia?: number
  treinos: number
  peso?: { atual: number; variacao: number | null } | null
  dias: { data: string; calorias: number; registrou: boolean }[]
}

export function pdfRelatorio(r: DadosRelatorioPdf): Blob {
  const n = (v: number, c = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: c })
  const d = new DocPdf(`Relatório da semana · ${r.periodo}`)
  d.titulo1('Relatório da semana')
  d.texto(r.periodo, { cor: [0.4, 0.4, 0.45] })
  d.titulo2('Alimentação')
  d.texto(`Média: ${n(r.mediaCalorias)} kcal por dia${r.metaCalorias ? ` (meta ${n(r.metaCalorias)} kcal)` : ''}`)
  d.texto(`Dias registrados: ${r.diasRegistrados} de 7${r.diasNaMeta != null ? ` · dias na meta: ${r.diasNaMeta}` : ''}`)
  if (r.macros) d.texto(`Macros médios: proteína ${n(r.macros.proteina_g)} g · carboidrato ${n(r.macros.carboidrato_g)} g · gordura ${n(r.macros.gordura_g)} g`)
  r.dias.forEach(x => d.texto(`${x.data.split('-').reverse().slice(0, 2).join('/')}: ${x.registrou ? `${n(x.calorias)} kcal` : 'sem registro'}`, { recuo: 8, tamanho: 9, cor: [0.35, 0.35, 0.4] }))
  d.titulo2('Treino, água e peso')
  d.texto(`Treinos feitos: ${r.treinos}`)
  if (r.aguaMedia) d.texto(`Água: ${n(r.aguaMedia)} ml por dia`)
  if (r.peso) d.texto(`Peso: ${n(r.peso.atual, 1)} kg${r.peso.variacao != null ? ` (${r.peso.variacao > 0 ? '+' : ''}${n(r.peso.variacao, 1)} kg na semana)` : ''}`)
  return d.blob()
}
