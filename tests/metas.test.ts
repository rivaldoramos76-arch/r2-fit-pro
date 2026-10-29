import assert from 'node:assert/strict'
import { taxaBasal, gastoDiario, calcularMeta, distribuirMacros, idadeEm, caloriasDosMacros, CALORIAS_MINIMAS } from '../src/lib/metas'
import { grupoRefeicao, escalarAlimento, recentesUnicos } from '../src/lib/diario'

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

console.log(`\n${ok} testes de metas e diário passaram`)
