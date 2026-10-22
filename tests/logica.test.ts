import assert from 'node:assert/strict'
import { CATALOGO, GRUPOS } from '../src/data/exercicios'
import { buscarExercicios, encontrarPorNome } from '../src/lib/busca'
import { montarCronograma, estadoEm, renderizarFaixa, aparar } from '../src/lib/workoutAudio'
import { normalizarPlano, opcoesDivisao, agendaPadrao, aplicarDivisao, modeloDivisao, proximoTreino } from '../src/lib/treinoModel'

let ok = 0
const t = (n: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => { ok++; console.log('✓', n) })

await t('catálogo: ids únicos e grupos válidos', () => {
  const ids = new Set(CATALOGO.map(e => e.id))
  assert.equal(ids.size, CATALOGO.length)
  for (const e of CATALOGO) { assert.ok(GRUPOS[e.grupo]); e.secundarios.forEach(g => assert.ok(GRUPOS[g], e.nome + ' ' + g)) }
  const grupos = new Set(CATALOGO.map(e => e.grupo))
  for (const g of ['peito','costas','ombros','biceps','triceps','antebracos','abdomen','quadriceps','posteriores','gluteos','panturrilhas']) assert.ok(grupos.has(g as never), g)
  console.log('   exercícios no catálogo:', CATALOGO.length)
})

await t('busca "sup" traz supinos primeiro', () => {
  const r = buscarExercicios('sup').map(e => e.nome)
  for (const n of ['Supino reto com barra','Supino reto com halteres','Supino inclinado com barra','Supino inclinado com halteres','Supino declinado com barra','Supino reto na máquina'])
    assert.ok(r.indexOf(n) >= 0 && r.indexOf(n) < 15, n)
  assert.ok(r[0].startsWith('Supino'))
})
await t('busca "rosca" lista variações de bíceps', () => {
  const r = buscarExercicios('rosca')
  assert.ok(r.length >= 12)
  assert.ok(r.slice(0, 10).every(e => e.nome.startsWith('Rosca')))
  assert.ok(r.filter(e => e.grupo === 'biceps').length >= 10)
})
await t('busca "triceps" sem acento', () => {
  const r = buscarExercicios('triceps')
  assert.ok(r.length >= 15); assert.ok(r[0].nome.startsWith('Tríceps'))
  assert.deepEqual(buscarExercicios('TRÍCEPS').map(e=>e.id).slice(0,5), r.map(e=>e.id).slice(0,5))
})
await t('busca por sinônimo, equipamento e grupo', () => {
  assert.equal(buscarExercicios('peck deck')[0].nome, 'Crucifixo na máquina')
  assert.equal(buscarExercicios('hip thrust')[0].nome, 'Elevação pélvica com barra')
  assert.ok(buscarExercicios('serrote')[0].nome.includes('Remada unilateral'))
  assert.ok(buscarExercicios('halteres ombro').every(e => e.equipamento === 'halteres'))
  assert.ok(buscarExercicios('posteriores').length >= 8)
  assert.ok(buscarExercicios('agach').slice(0,5).every(e=>e.nome.startsWith('Agachamento')))
  assert.equal(buscarExercicios('xyzabc').length, 0)
  assert.equal(encontrarPorNome('supino reto com barra')?.id, 'supino-reto-com-barra')
  assert.equal(encontrarPorNome('Leg press 45°')?.nome, 'Leg press 45°')
  assert.ok(buscarExercicios('leg 45').some(e=>e.nome==='Leg press 45°'))
})
await t('filtro de equipamentos', () => {
  const r = buscarExercicios('', { equipamentos: ['elastico'], limite: 100 })
  assert.ok(r.length > 5 && r.every(e => e.equipamento === 'elastico'))
})

await t('cronograma: ordem e sem sobreposição', () => {
  const c = montarCronograma({ series: 3, execSeg: 30, descansoSeg: 60 }, { '5': .6, '4': .6, '3': .5, '2': .5, '1': .4, trabalho: .8, repouso: .9, fim: 3 })
  const tipos = c.fases.map(f => f.tipo)
  assert.deepEqual(tipos, ['countdown','work','rest_countdown','rest','countdown','work','rest_countdown','rest','countdown','work','final'])
  for (let i = 1; i < c.fases.length; i++) assert.equal(c.fases[i].inicio, c.fases[i-1].fim)
  const cd = c.fases[0].cues.map(x => x.clip); assert.deepEqual(cd, ['5','4','3','2','1','trabalho'])
  assert.deepEqual(c.fases[2].cues.map(x=>x.clip), ['5','4','3','2','1','repouso'])
  assert.equal(c.cues.filter(x => x.clip === 'fim').length, 1)
  const work = c.fases[1]; assert.equal(Math.round((work.fim - work.inicio)*1000), 30000)
  assert.equal(c.fimUltimaSerie, c.fases[9].fim)
  // estado
  assert.equal(estadoEm(c, 0.1).numero, 5); assert.equal(estadoEm(c, 4.2).numero, 1); assert.equal(estadoEm(c, 5.2).numero, 0)
  assert.equal(estadoEm(c, work.inicio + 10).fase.tipo, 'work')
  assert.equal(Math.round(estadoEm(c, work.inicio + 10).restante), 20)
  assert.equal(estadoEm(c, c.total + 5).fase.tipo, 'final')
})
await t('cronograma: clipe longo aumenta o passo sem sobrepor', () => {
  const c = montarCronograma({ series: 1, execSeg: 10, descansoSeg: 0 }, { '4': 1.3 })
  const cu = c.fases[0].cues
  for (let i = 1; i < 5; i++) assert.ok(cu[i].t - cu[i-1].t >= 1.42 - 1e-9)
})
await t('faixa WAV: tamanho e posição dos clipes', () => {
  const sr = 16000
  const tom = (d: number) => Float32Array.from({ length: Math.round(d*sr) }, (_, i) => 0.5*Math.sin(i/5))
  const clips = { '5': tom(.5), '4': tom(.5), '3': tom(.5), '2': tom(.5), '1': tom(.5), trabalho: tom(.7), repouso: tom(.7), fim: tom(2) }
  const c = montarCronograma({ series: 2, execSeg: 5, descansoSeg: 5 }, { '5': .5,'4':.5,'3':.5,'2':.5,'1':.5, trabalho:.7, repouso:.7, fim:2 })
  const blob = renderizarFaixa(c, clips, sr)
  assert.equal(blob.size, 44 + Math.ceil(c.total*sr)*2)
  return blob.arrayBuffer().then(ab => {
    const pcm = new Int16Array(ab, 44)
    const energia = (t0: number, t1: number) => { let s=0; for (let i=Math.round(t0*sr); i<Math.round(t1*sr); i++) s+=Math.abs(pcm[i]); return s }
    for (const cue of c.cues) assert.ok(energia(cue.t, cue.t + 0.3) > 0, 'som em ' + cue.clip)
    const w = c.fases[1]; assert.equal(energia(w.inicio + 0.2, w.fim - 0.1), 0) // silêncio durante a execução
    console.log('   duração', c.total.toFixed(1)+'s', 'tamanho', (blob.size/1024).toFixed(0)+'KB')
  })
})
await t('aparar remove silêncio inicial', () => {
  const s = new Float32Array(16000); for (let i = 8000; i < 12000; i++) s[i] = 0.3
  const r = aparar(s, 16000); assert.ok(r.length < 6000 && Math.abs(r[200]) > 0.5)
})

await t('plano legado é normalizado sem perder exercícios', () => {
  const p = normalizarPlano({ nome:'X', objetivo:'Ganho', nivel:'Iniciante', frequencia_semanal:3, dias:[{dia:'Segunda-feira',foco:'Peito',duracao_estimada_min:50,exercicios:[{nome:'Supino',grupos_musculares:['Peito'],series:4,repeticoes:'8-10',tempo_execucao_segundos:40,tempo_descanso_segundos:90,instrucoes:'i',dica:'d'}]},{dia:'Quarta',foco:'Costas',exercicios:[]}], observacoes:['o'] })
  assert.equal(p.dias[0].dia, 'Treino A'); assert.equal(p.dias[1].letra, 'B'); assert.ok(p.dias[0].foco.includes('Segunda'))
  assert.equal(p.dias[0].exercicios[0].id, 'd0-e0'); assert.equal(p.dias[0].exercicios[0].series, 4)
  assert.equal(p.agenda.map(s=>s.letra).join(''), 'ABA')
  const p2 = normalizarPlano(JSON.parse(JSON.stringify(p))); assert.deepEqual(p2, p)
})
await t('divisões: frequência ≠ nº de treinos', () => {
  const o = opcoesDivisao(4); assert.deepEqual(o.map(x=>x.nome), ['Treino A','Treino AB','Treino ABC','Treino ABCD'])
  assert.equal(o.find(x=>x.sugerida)?.n, 4)
  assert.equal(agendaPadrao(4, 2).map(s=>s.letra).join(''), 'ABAB')
  assert.equal(opcoesDivisao(7).length, 6)
})
await t('aplicarDivisao preserva exercícios por letra', () => {
  const base = aplicarDivisao([], modeloDivisao(2), 60)
  base[0].exercicios.push({ id:'e1', nome:'Supino', grupos_musculares:[], series:3, repeticoes:'10', tempo_execucao_segundos:30, tempo_descanso_segundos:60 })
  const nova = aplicarDivisao(base, modeloDivisao(4), 60)
  assert.equal(nova.length, 4); assert.equal(nova[0].exercicios[0].id, 'e1'); assert.equal(nova[0].id, base[0].id)
})
await t('próximo treino segue a agenda', () => {
  const p = normalizarPlano({ versao:2, dias:[{letra:'A'},{letra:'B'}], agenda:[{letra:'A'},{letra:'B'},{letra:'A'},{letra:'B'}] })
  assert.equal(proximoTreino(p, null), 0); assert.equal(proximoTreino(p, 0), 1); assert.equal(proximoTreino(p, 1), 0)
})
console.log(`\n${ok} testes passaram`)
