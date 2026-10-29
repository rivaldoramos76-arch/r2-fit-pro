import assert from 'node:assert/strict'
import { taxaBasal, gastoDiario, calcularMeta, distribuirMacros, idadeEm, caloriasDosMacros, CALORIAS_MINIMAS, ajustarPorCalorias, ajustarPorMacro, percentuais } from '../src/lib/metas'
import { carregarTaco, buscarBase, medidasDe, paraAlimento } from '../src/lib/alimentosBase'
import { grupoRefeicao, escalarAlimento, recentesUnicos, lerQuantidade, ajustarQuantidade, passoQuantidade } from '../src/lib/diario'

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

console.log(`\n${ok} testes de metas e diário passaram`)
