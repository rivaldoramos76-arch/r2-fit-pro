import assert from 'node:assert/strict'
import { taxaBasal, gastoDiario, calcularMeta, distribuirMacros, idadeEm, caloriasDosMacros, CALORIAS_MINIMAS, ajustarPorCalorias, ajustarPorMacro, percentuais } from '../src/lib/metas'
import { ATIVIDADES, caloriasExercicio, metaAguaSugerida, resumoPeso, restanteDia } from '../src/lib/exercicios'
import { porcaoReceita, receitaComoItem, totaisIngredientes, inicioSemana, resumoSemana } from '../src/lib/relatorio'
import { montarPrato, gramasHabituais } from '../src/lib/fotoPrato'
import { comPadroes, proximoHorarioAgua, resumoDias, normalizarLembrete } from '../src/lib/lembretesBase'
import { carregarTaco, buscarBase, medidasDe, paraAlimento } from '../src/lib/alimentosBase'
import { grupoRefeicao, escalarAlimento, recentesUnicos, lerQuantidade, ajustarQuantidade, passoQuantidade, pesoDaQuantidade, alimentoEmPeso } from '../src/lib/diario'

let ok = 0
const t = async (n: string, f: () => void | Promise<void>) => { await f(); ok++; console.log('✓', n) }
const base = { sexo: 'masculino' as const, idade: 30, altura_cm: 180, peso_kg: 80, atividade: 'moderado' as const }

await t('taxa basal pela fórmula de Mifflin-St Jeor', () => {
  assert.equal(taxaBasal(base), 1780)
  assert.equal(taxaBasal({ ...base, sexo: 'feminino' }), 1614)
  assert.equal(Math.round(gastoDiario(base)), 2759)
})

await t('meta por objetivo: perder, manter e ganhar', () => {
  const manter = calcularMeta({ ...base, objetivo: 'manter', ritmo_kg_semana: 0.5 })
  assert.equal(manter.calorias, 2760)
  assert.equal(manter.gasto, 2760)
  const perder = calcularMeta({ ...base, objetivo: 'perder', ritmo_kg_semana: 0.5 })
  assert.equal(perder.calorias, 2210) // 2759 − 550
  const ganhar = calcularMeta({ ...base, objetivo: 'ganhar', ritmo_kg_semana: 0.25 })
  assert.equal(ganhar.calorias, 3030) // 2759 + 275
  for (const m of [manter, perder, ganhar]) {
    assert.ok(Math.abs(caloriasDosMacros(m) - m.calorias) <= 10, 'macros somam a meta')
    assert.equal(m.calorias % 10, 0)
  }
  assert.equal(perder.proteina_g, 160) // 2 g/kg
})

await t('meta nunca fica abaixo do mínimo seguro', () => {
  const m = calcularMeta({ sexo: 'feminino', idade: 60, altura_cm: 150, peso_kg: 48, atividade: 'sedentario', objetivo: 'perder', ritmo_kg_semana: 1 })
  assert.equal(m.calorias, CALORIAS_MINIMAS.feminino)
  assert.equal(m.abaixoDoMinimo, true)
  assert.ok(caloriasDosMacros(m) <= m.calorias + 10)
  assert.ok(m.carboidrato_g > 0)
  assert.equal(calcularMeta({ ...base, objetivo: 'perder', ritmo_kg_semana: 0.25 }).abaixoDoMinimo, false)
})

await t('ritmo é limitado a 1 kg/semana', () => {
  assert.equal(calcularMeta({ ...base, objetivo: 'perder', ritmo_kg_semana: 5 }).calorias, calcularMeta({ ...base, objetivo: 'perder', ritmo_kg_semana: 1 }).calorias)
})

await t('distribuição de macros respeita as calorias', () => {
  const m = distribuirMacros(2000, 70, 'manter')
  assert.equal(m.proteina_g, 112)
  assert.equal(m.gordura_g, 56)
  assert.equal(m.carboidrato_g, 262)
})

await t('meta manual: calorias e macros acompanham um ao outro', () => {
  const base = { proteina_g: 150, carboidrato_g: 200, gordura_g: 60 } // 1940 kcal
  const mais = ajustarPorMacro({ ...base, calorias: 1940 }, 'proteina_g', 175)
  assert.equal(mais.calorias, 2040) // +25 g × 4
  assert.equal(mais.carboidrato_g, 200)
  assert.equal(ajustarPorMacro({ ...base, calorias: 1940 }, 'gordura_g', 50).calorias, 1850)
  const dobro = ajustarPorCalorias(base, 3880)
  assert.deepEqual([dobro.proteina_g, dobro.carboidrato_g, dobro.gordura_g], [300, 400, 120])
  assert.ok(Math.abs(caloriasDosMacros(ajustarPorCalorias(base, 2500)) - 2500) <= 10)
  const vazio = ajustarPorCalorias({ proteina_g: 0, carboidrato_g: 0, gordura_g: 0 }, 2000)
  assert.ok(Math.abs(caloriasDosMacros(vazio) - 2000) <= 10)
  const p = percentuais(base)
  assert.equal(p.proteina_g + p.carboidrato_g + p.gordura_g, 100)
})

await t('idade completa a partir do nascimento', () => {
  const hoje = new Date(2026, 9, 29)
  assert.equal(idadeEm('1990-10-29', hoje), 36)
  assert.equal(idadeEm('1990-10-30', hoje), 35)
  assert.equal(idadeEm('2000-01-01', hoje), 26)
})

await t('refeições antigas entram nos 4 grupos do diário', () => {
  assert.equal(grupoRefeicao('Café da manhã'), 'Café da manhã')
  assert.equal(grupoRefeicao('Almoço'), 'Almoço')
  assert.equal(grupoRefeicao('Jantar'), 'Jantar')
  for (const r of ['Lanche da manhã', 'Lanche da tarde', 'Ceia', 'Outro', null, '']) assert.equal(grupoRefeicao(r), 'Lanches')
})

await t('porções multiplicam calorias e macros', () => {
  const a = { nome: 'Arroz', quantidade: '100 g', calorias: 130, proteina_g: 2.5, carboidrato_g: 28, gordura_g: 0.3 }
  assert.deepEqual(escalarAlimento(a, 1), a)
  const d = escalarAlimento(a, 1.5)
  assert.equal(d.calorias, 195); assert.equal(d.proteina_g, 3.8); assert.equal(d.carboidrato_g, 42); assert.equal(d.gordura_g, 0.5)
  assert.equal(d.quantidade, '1,5 × 100 g')
  assert.equal(escalarAlimento(a, 2).quantidade, '2 × 100 g')
})

await t('recentes: sem repetidos e mais novos primeiro', () => {
  const r = recentesUnicos([
    { nome: 'Arroz', quantidade: '100 g', calorias: 130, proteina_g: 2, carboidrato_g: 28, gordura_g: 0, created_at: '2026-10-29T12:00:00Z' },
    { nome: 'arroz ', quantidade: '100 g', calorias: 130, proteina_g: 2, carboidrato_g: 28, gordura_g: 0, created_at: '2026-10-28T12:00:00Z' },
    { nome: 'Ovo', quantidade: '1 un', calorias: 70, proteina_g: 6, carboidrato_g: 0, gordura_g: 5, created_at: '2026-10-27T12:00:00Z' },
  ])
  assert.deepEqual(r.map(x => x.nome), ['Arroz', 'Ovo'])
})

await t('quantidade editável: 4 ovos → 2 ovos, 150 g → 200 g', () => {
  assert.deepEqual(lerQuantidade('4 ovos'), { valor: 4, unidade: 'ovos' })
  assert.deepEqual(lerQuantidade('150g'), { valor: 150, unidade: 'g' })
  assert.deepEqual(lerQuantidade('1,5 xícara'), { valor: 1.5, unidade: 'xícara' })
  assert.deepEqual(lerQuantidade('1/2 copo'), { valor: 0.5, unidade: 'copo' })
  assert.deepEqual(lerQuantidade('½ maçã'), { valor: 0.5, unidade: 'maçã' })
  assert.equal(lerQuantidade('uma porção'), null)
  const ovos = { nome: 'Ovo cozido', quantidade: '4 ovos', calorias: 312, proteina_g: 25, carboidrato_g: 2.4, gordura_g: 21 }
  const dois = ajustarQuantidade(ovos, 2)
  assert.equal(dois.quantidade, '2 ovos'); assert.equal(dois.calorias, 156); assert.equal(dois.proteina_g, 12.5)
  assert.equal(ajustarQuantidade(ovos, 1).quantidade, '1 ovo')
  const arroz = { nome: 'Arroz', quantidade: '150 g', calorias: 195, proteina_g: 4, carboidrato_g: 42, gordura_g: 0.4 }
  assert.equal(ajustarQuantidade(arroz, 200).quantidade, '200 g'); assert.equal(ajustarQuantidade(arroz, 200).calorias, 260)
  assert.equal(ajustarQuantidade({ ...arroz, quantidade: '1 colher' }, 3).quantidade, '3 colheres')
  assert.equal(ajustarQuantidade({ ...arroz, quantidade: '2 colheres' }, 1).quantidade, '1 colher')
  assert.equal(ajustarQuantidade({ ...arroz, quantidade: '1 unidade (50 g)' }, 2).quantidade, '2 unidades (50 g)')
  assert.equal(passoQuantidade({ valor: 150, unidade: 'g' }), 10)
  assert.equal(passoQuantidade({ valor: 4, unidade: 'ovos' }), 1)
  assert.equal(passoQuantidade({ valor: 0.5, unidade: 'copo' }), 0.5)
})

await t('medida com peso pode virar gramas: 1 porção (100 g) → 300 g', () => {
  assert.deepEqual(pesoDaQuantidade('1 porção (100 g)'), { valor: 100, unidade: 'g' })
  assert.deepEqual(pesoDaQuantidade('1 copo (240 ml)'), { valor: 240, unidade: 'ml' })
  assert.equal(pesoDaQuantidade('2 ovos'), null)
  const porcao = { nome: 'Escondidinho', quantidade: '1 porção (100 g)', calorias: 120, proteina_g: 8, carboidrato_g: 10, gordura_g: 5 }
  const prato = alimentoEmPeso(porcao, 300)
  assert.equal(prato.quantidade, '300 g'); assert.equal(prato.calorias, 360); assert.equal(prato.proteina_g, 24)
  // peso entre parênteses é de cada unidade: 2 unidades (50 g) = 100 g
  assert.equal(alimentoEmPeso({ ...porcao, quantidade: '2 unidades (50 g)' }, 50).calorias, 60)
  assert.equal(alimentoEmPeso({ ...porcao, quantidade: '2 ovos' }, 50).quantidade, '2 ovos', 'sem peso não muda')
})

await t('busca na TACO: resultados mais comuns primeiro e medidas caseiras', async () => {
  const taco = await carregarTaco()
  assert.ok(taco.length > 590, `${taco.length} alimentos`)
  const primeiro = (q: string) => buscarBase(taco, q)[0]?.nome
  assert.equal(primeiro('arroz branco'), 'Arroz, tipo 1, cozido')
  assert.equal(primeiro('feijão'), 'Feijão, carioca, cozido')
  assert.equal(primeiro('ovo'), 'Ovo, de galinha, inteiro, cozido/10minutos')
  assert.equal(primeiro('leite'), 'Leite, de vaca, integral (líquido)')
  assert.match(primeiro('maçã') ?? '', /^Maçã/)
  assert.match(primeiro('carne moida') ?? '', /moído/)
  assert.equal(buscarBase(taco, 'xyzqw').length, 0)
  const arroz = taco.find(x => x.nome === 'Arroz, tipo 1, cozido')!
  const m = medidasDe(arroz)
  assert.deepEqual(m.map(x => x.rotulo), ['colher de servir', 'escumadeira cheia', 'gramas'])
  const a = paraAlimento(arroz, m[1])
  assert.equal(a.quantidade, '1 escumadeira cheia (90 g)'); assert.equal(a.calorias, 115)
  assert.equal(paraAlimento(arroz, m[2]).quantidade, '100 g')
  // Líquidos em ml; cremosos com gramas e ml; sólidos só gramas
  const leite = taco.find(x => x.nome.startsWith('Leite, de vaca, integral (líquido)'))!
  assert.deepEqual(medidasDe(leite).map(x => x.rotulo), ['copo (200 ml)', 'xícara (240 ml)', 'ml'])
  assert.equal(paraAlimento(leite, { rotulo: 'ml', gramas: 100 }).quantidade, '100 ml')
  const iogurte = taco.find(x => x.nome.startsWith('Iogurte, natural'))!
  assert.deepEqual(medidasDe(iogurte).map(x => x.rotulo).slice(-2), ['gramas', 'ml'])
  assert.ok(!medidasDe(arroz).some(x => x.rotulo === 'ml'))
  const suco = { id: 'x', nome: 'Suco de laranja integral', detalhe: 'Produto', fonte: 'off' as const, kcal: 45, proteina: 0.7, carboidrato: 10, gordura: 0, porcaoG: 200 }
  assert.deepEqual(medidasDe(suco).map(x => x.rotulo), ['porção do rótulo', 'ml'])
  assert.equal(paraAlimento(suco, medidasDe(suco)[0]).quantidade, '1 porção do rótulo (200 ml)')
})

await t('exercício: calorias pelo MET, peso padrão e meta de água', () => {
  assert.equal(caloriasExercicio(9.8, 80, 30), 392) // corrida 10 km/h, 80 kg, 30 min
  assert.equal(caloriasExercicio(3.5, 70, 60), 245) // musculação, 1 h
  assert.equal(caloriasExercicio(3.5, null, 60), 245, 'sem peso usa 70 kg')
  assert.equal(caloriasExercicio(5, 80, -10), 0)
  assert.ok(ATIVIDADES.length >= 25 && new Set(ATIVIDADES.map(a => a.id)).size === ATIVIDADES.length)
  assert.equal(metaAguaSugerida(80), 2800)
  assert.equal(metaAguaSugerida(30), 1500)
  assert.equal(metaAguaSugerida(150), 4000)
  assert.equal(metaAguaSugerida(null), 2000)
})

await t('peso: resumo do período e restante do dia com ou sem exercício', () => {
  const r = resumoPeso([
    { data: '2026-10-01', peso_kg: 85 }, { data: '2026-10-20', peso_kg: 83.4 },
    { data: '2026-10-27', peso_kg: 82.6 }, { data: '2026-10-10', peso_kg: 84.1 },
  ], 78)!
  assert.equal(r.atual, 82.6); assert.equal(r.variacao, -2.4); assert.equal(r.variacaoSemana, -0.8)
  assert.equal(r.minimo, 82.6); assert.equal(r.maximo, 85); assert.equal(r.faltaMeta, 4.6)
  assert.equal(resumoPeso([]), null)
  assert.equal(restanteDia(2200, 1500, 400, false), 700, 'exercício não muda a meta por padrão')
  assert.equal(restanteDia(2200, 1500, 400, true), 1100)
})

await t('receita: totais e valores por porção', () => {
  const ing = [
    { nome: 'Frango', quantidade: '500 g', calorias: 800, proteina_g: 150, carboidrato_g: 0, gordura_g: 18 },
    { nome: 'Arroz', quantidade: '300 g', calorias: 384, proteina_g: 7.5, carboidrato_g: 84.3, gordura_g: 0.6 },
  ]
  assert.equal(totaisIngredientes(ing).calorias, 1184)
  const p = porcaoReceita('Frango com arroz', ing, 4)
  assert.deepEqual(p, { nome: 'Frango com arroz', quantidade: '1 porção', calorias: 296, proteina_g: 39.4, carboidrato_g: 21.1, gordura_g: 4.7 })
  assert.equal(porcaoReceita('X', ing, 0).calorias, 1184, 'rendimento inválido vira 1 porção')
})

await t('receita com peso final: registrar em gramas no diário', () => {
  const ing = [
    { nome: 'Frango', quantidade: '500 g', calorias: 800, proteina_g: 150, carboidrato_g: 0, gordura_g: 18 },
    { nome: 'Arroz', quantidade: '300 g', calorias: 384, proteina_g: 7.5, carboidrato_g: 84.3, gordura_g: 0.6 },
  ]
  const r = { id: 'r1', nome: 'Sopa de frango', ingredientes: ing, porcoes: 4, peso_final_g: 1400 }
  assert.equal(receitaComoItem({ ...r, peso_final_g: null }), null, 'sem peso continua por porção')
  assert.equal(porcaoReceita(r.nome, ing, 4, 1400).quantidade, '1 porção (350 g)')
  const item = receitaComoItem(r)!
  assert.equal(item.kcal, 84.6) // 1184 kcal / 1400 g × 100
  const medidas = medidasDe(item)
  assert.deepEqual(medidas.map(m => m.rotulo), ['porção', 'gramas'], 'sempre em gramas, mesmo com nome de sopa')
  assert.equal(paraAlimento(item, medidas[0]).quantidade, '1 porção (350 g)')
  assert.equal(paraAlimento(item, medidas[0]).calorias, 296)
  const prato = ajustarQuantidade(paraAlimento(item, medidas[1]), 300)
  assert.equal(prato.quantidade, '300 g')
  assert.ok(Math.abs(prato.calorias - 254) <= 1, `300 g ≈ 254 kcal (${prato.calorias})`)
})

await t('relatório semanal: segunda-feira, médias, dias na meta e peso', () => {
  assert.equal(inicioSemana('2026-10-29'), '2026-10-26') // quinta → segunda
  assert.equal(inicioSemana('2026-11-01'), '2026-10-26') // domingo → segunda anterior
  assert.equal(inicioSemana('2026-10-26'), '2026-10-26')
  const al = (data: string, calorias: number, nome = 'Arroz') => ({ data, nome, calorias, proteina_g: 100, carboidrato_g: 200, gordura_g: 50 })
  const r = resumoSemana({
    inicio: '2026-10-26',
    alimentos: [al('2026-10-26', 1900), al('2026-10-27', 2500), al('2026-10-28', 1500, 'Ovo'), al('2026-10-28', 300), al('2026-11-02', 9999)],
    agua: [{ data: '2026-10-26', ml: 2500 }, { data: '2026-10-27', ml: 1500 }],
    exercicios: [{ data: '2026-10-27', calorias: 400, duracao_min: 45 }],
    pesos: [{ data: '2026-10-20', peso_kg: 83 }, { data: '2026-10-28', peso_kg: 82.2 }],
    treinosConcluidos: 3,
    meta: { calorias: 2000, proteina_g: 150, carboidrato_g: 200, gordura_g: 60, agua_ml: 2000, somar_exercicio: false },
  })
  assert.equal(r.diasRegistrados, 3); assert.equal(r.mediaCalorias, 2067)
  assert.equal(r.diasNaMeta, 2, '1900 e 1800 ficam entre 80% e 100% da meta; 2500 passa')
  assert.equal(r.aguaMedia, 2000); assert.equal(r.diasMetaAgua, 1)
  assert.deepEqual(r.exercicio, { calorias: 400, minutos: 45, sessoes: 1 })
  assert.deepEqual(r.peso, { atual: 82.2, variacao: -0.8 })
  assert.deepEqual(r.alimentoMaisRegistrado, { nome: 'Arroz', vezes: 3 })
  assert.equal(r.melhorDia, '2026-10-26')
  assert.equal(r.dias.length, 7); assert.equal(r.dias[6].calorias, 0)
})

await t('lembretes: sugestões desligadas, horários de água e dias', () => {
  const lista = comPadroes([])
  assert.equal(lista.length, 9)
  assert.ok(lista.every(l => !l.ativo), 'sugestões começam desligadas')
  assert.deepEqual(lista.map(l => l.tipo).slice(0, 4), ['cafe', 'almoco', 'lanche', 'jantar'])
  // tipo já configurado não recebe sugestão
  const salvos = comPadroes([{ id: 'x', tipo: 'agua', horario: '09:00', dias: [0, 1, 2, 3, 4, 5, 6], ativo: true }])
  assert.equal(salvos.filter(l => l.tipo === 'agua').length, 1)
  assert.equal(proximoHorarioAgua(salvos), '11:00')
  assert.equal(proximoHorarioAgua([]), '10:00')
  assert.equal(proximoHorarioAgua([{ tipo: 'agua', horario: '21:30', dias: [1], ativo: true }]), '22:30')
  assert.equal(resumoDias([1, 2, 3, 4, 5]), 'seg a sex')
  assert.equal(resumoDias([0, 1, 2, 3, 4, 5, 6]), 'todos os dias')
  assert.equal(resumoDias([5, 1, 3]), 'seg, qua, sex')
  assert.deepEqual(normalizarLembrete({ tipo: 'peso', horario: '07:00', dias: [3, 1, 1], ativo: true })?.dias, [1, 3])
  assert.equal(normalizarLembrete({ tipo: 'peso', horario: '7h', dias: [1], ativo: true }), null)
  assert.equal(normalizarLembrete({ tipo: 'peso', horario: '07:00', dias: [], ativo: true }), null)
})

await t('foto do prato: valores da TACO, gramas ajustáveis e quantidade de costume', async () => {
  const taco = await carregarTaco()
  const ia = [
    { nome: 'Arroz branco', busca: 'arroz branco cozido', gramas: 120, quantidade: '4 colheres', calorias: 160, proteina_g: 3, carboidrato_g: 34, gordura_g: 0.3 },
    { nome: 'Feijão', busca: 'feijão carioca cozido', gramas: 100, quantidade: '1 concha', calorias: 80, proteina_g: 5, carboidrato_g: 14, gordura_g: 0.5 },
    { nome: 'Molho especial da casa', busca: 'molho especial da casa', gramas: 30, quantidade: '2 colheres', calorias: 90, proteina_g: 0, carboidrato_g: 3, gordura_g: 9 },
    { nome: 'Pudim', quantidade: '1 fatia', calorias: 250, proteina_g: 5, carboidrato_g: 40, gordura_g: 8 },
  ]
  const hab = gramasHabituais([{ nome: 'Feijão, carioca, cozido', quantidade: '150 g' }, { nome: 'Feijão, carioca, cozido', quantidade: '130 g' }, { nome: 'Feijão, carioca, cozido', quantidade: '1 concha' }])
  assert.equal(hab.get('feijao, carioca, cozido'), 140)
  const prato = montarPrato(ia, taco, hab)
  assert.equal(prato[0].nome, 'Arroz, tipo 1, cozido'); assert.equal(prato[0].quantidade, '120 g'); assert.equal(prato[0].fonte, 'taco')
  assert.ok(Math.abs(prato[0].calorias - 154) <= 2, `arroz 120 g pela TACO (${prato[0].calorias})`)
  assert.equal(prato[1].quantidade, '140 g', 'usa a quantidade de costume'); assert.equal(prato[1].habitual, true)
  assert.equal(prato[2].fonte, 'ia', 'sem item na TACO fica a estimativa da IA'); assert.equal(prato[2].quantidade, '30 g')
  assert.equal(prato[3].fonte, 'ia'); assert.equal(prato[3].quantidade, '1 fatia', 'sem gramas mantém a porção da IA')
  // Valor muito diferente do que a IA viu: item trocado na busca, fica com a IA
  const trocado = montarPrato([{ nome: 'Arroz', busca: 'arroz branco cozido', gramas: 100, quantidade: '', calorias: 900, proteina_g: 0, carboidrato_g: 0, gordura_g: 0 }], taco, new Map())
  assert.equal(trocado[0].fonte, 'ia')
})

console.log(`\n${ok} testes de metas e diário passaram`)
