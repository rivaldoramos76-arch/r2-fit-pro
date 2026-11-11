import assert from 'node:assert/strict'
import { CATALOGO, GRUPOS } from '../src/data/exercicios'
import { buscarExercicios, encontrarPorNome } from '../src/lib/busca'
import { montarCronograma, estadoEm, renderizarFaixa, aparar, maximizar, chaveSerie, textoDoClipe, TreinoPlayer } from '../src/lib/workoutAudio'
import { passoReps, passoCarga, lerTempo, mss } from '../src/components/treino/AjustesExercicio'
import { marcarVez, desfazerVez, situacao, normalizarItem, normalizarRotina, textoAviso, somarDias, pendentesHoje, pendentesDoTreino, historicoPorDia, diaCompleto } from '../src/lib/rotinaBase'
import { opcoesEncaixe, alertasSemana, familiaDoExercicio, treinosPerdidos, dividirNaSemana, desfazerAjuste, encaixar, diasLivres, podeDividir, ajustesDaSemana, avisosDaSemana, inicioSemana, semanaDoPlano, aplicarSemana, temDiasDaSemana } from '../src/lib/semanaBase'
import { passoTempo, normalizarPlano, opcoesDivisao, agendaPadrao, aplicarDivisao, modeloDivisao, proximoTreino } from '../src/lib/treinoModel'

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
  // Depois da contagem a voz diz a série: primeira, pelo número no meio, última
  const cd = c.fases[0].cues.map(x => x.clip); assert.deepEqual(cd, ['5','4','3','2','1','serie_primeira'])
  assert.equal(c.fases[4].cues.at(-1)!.clip, 'serie_2'); assert.equal(c.fases[8].cues.at(-1)!.clip, 'serie_ultima')
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
  const c = montarCronograma({ series: 2, execSeg: 5, descansoSeg: 5 }, { '5': .5,'4':.5,'3':.5,'2':.5,'1':.5, trabalho:.7, repouso:.7, fim:2 }, k => k in clips)
  assert.equal(c.fases[0].cues.at(-1)!.clip, 'trabalho', 'sem o clipe da série, fala "Trabalho!"')
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
await t('voz maximizada fica mais alta sem distorcer', () => {
  const sr = 24000
  const rms = (a: Float32Array) => Math.sqrt(a.reduce((x, v) => x + v * v, 0) / a.length)
  // Tom constante: a saída precisa continuar um tom puro (sem distorção), só mais alto
  const sen = Float32Array.from({ length: sr }, (_, i) => Math.sin(2 * Math.PI * 300 * i / sr) * 0.2)
  const o = maximizar(sen, sr)
  const a = sen.slice(sr / 2), b = o.slice(sr / 2)
  let ab = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i] }
  assert.ok(ab / Math.sqrt(aa * bb) > 0.9999, 'sem distorção')
  assert.ok(rms(b) > rms(a) * 1.8, `mais alto (${(rms(b) / rms(a)).toFixed(2)}×)`)
  // Picos fortes são segurados pelo limitador, sem passar do teto
  const forte = Float32Array.from({ length: sr }, (_, i) => Math.sin(2 * Math.PI * 300 * i / sr) * (i % 6000 < 600 ? 1 : 0.15))
  assert.ok(Math.max(...maximizar(forte, sr).map(Math.abs)) <= 0.97 + 1e-6, 'sem estourar')
})

await t('fim fraco das palavras não é cortado ("cincO", "quatrO")', () => {
  const sr = 24000
  const w = Float32Array.from({ length: Math.round(sr * 0.8) }, (_, i) => {
    const t = i / sr, amp = t < 0.25 ? 0.8 : t < 0.55 ? 0.8 * Math.exp(-(t - 0.25) / 0.08) : 0
    return Math.sin(2 * Math.PI * 200 * i / sr) * amp
  })
  const ap = aparar(w, sr)
  assert.ok(ap.length / sr > 0.6, `manteve o final (${(ap.length / sr).toFixed(2)} s)`)
})

await t('chiado no fim da gravação é cortado e não é amplificado', () => {
  const sr = 16000
  // "Repouso!": 0,4 s de voz e depois 0,8 s de chiado fraco (3% do pico)
  let semente = 1
  const ruido = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647 * 2 - 1 }
  const s = Float32Array.from({ length: Math.round(sr * 1.2) }, (_, i) => i < sr * 0.4 ? Math.sin(i / 3) * 0.8 : ruido() * 0.025)
  const a = aparar(s, sr)
  assert.ok(a.length < sr * 0.6, `cortou o chiado (${(a.length / sr).toFixed(2)} s)`)
  assert.ok(Math.abs(a[a.length - 1]) < 0.01, 'termina em silêncio, sem estalo')
  // Mesmo se o chiado ficasse, a maximização não o aumenta
  const m = maximizar(s, sr)
  const rms = (x: Float32Array) => Math.sqrt(x.reduce((t, v) => t + v * v, 0) / x.length)
  assert.ok(rms(m.slice(sr * 0.6)) <= rms(s.slice(sr * 0.6)) * 1.01, 'chiado não sobe')
})

await t('aparar remove silêncio inicial', () => {
  const s = new Float32Array(16000); for (let i = 8000; i < 12000; i++) s[i] = 0.3
  const r = aparar(s, 16000); assert.ok(r.length < 7000 && Math.abs(r[600]) > 0.5)
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
await t('treino completo: anuncia o próximo, conta o descanso do anterior e emenda o seguinte', () => {
  const dur = { '5': .5, '4': .5, '3': .5, '2': .5, '1': .5, trabalho: .7, repouso: .7, fim: 2, proximo: 1.8, treino_fim: 2.5, 'nome:Remada': 1.2 }
  const c = montarCronograma([
    { series: 2, execSeg: 30, descansoSeg: 60, nome: 'Supino' },
    { series: 1, execSeg: 20, descansoSeg: 45, nome: 'Remada' },
  ], dur, k => k in dur)
  assert.equal(c.exercicios, 2); assert.equal(c.marcos.length, 2)
  const trans = c.fases.find(f => f.proximo === 1)!
  assert.equal(trans.tipo, 'rest'); assert.equal(trans.exercicio, 0)
  assert.equal(trans.inicio, c.marcos[0], 'anúncio logo ao fim da última série')
  assert.deepEqual(trans.cues.map(x => x.clip), ['proximo', 'nome:Remada'])
  assert.ok(Math.abs(trans.fim - trans.inicio - 60) < 0.01, 'descanso do exercício que terminou')
  const prox = c.fases[c.fases.indexOf(trans) + 1]
  assert.equal(prox.tipo, 'countdown'); assert.equal(prox.exercicio, 1); assert.equal(prox.serie, 1)
  assert.equal(c.fimUltimaSerie, c.marcos[1])
  assert.equal(c.cues.at(-1)!.clip, 'treino_fim')
  assert.equal(estadoEm(c, trans.inicio + 1).fase.proximo, 1)
})
await t('treino completo sem a voz do nome: anuncia só "próximo" e o descanso cobre o aviso', () => {
  const dur = { proximo: 1.8 }
  const c = montarCronograma([{ series: 1, execSeg: 10, descansoSeg: 0, nome: 'A' }, { series: 1, execSeg: 10, descansoSeg: 0, nome: 'B' }], dur, k => k in dur)
  const trans = c.fases.find(f => f.proximo === 1)!
  assert.deepEqual(trans.cues.map(x => x.clip), ['proximo'])
  assert.ok(trans.fim - trans.inicio >= 1.8, 'descanso zero não corta o aviso')
  assert.equal(c.cues.at(-1)!.clip, 'fim', 'sem o clipe de treino completo usa o aviso padrão')
})
await t('um exercício só continua igual', () => {
  const c = montarCronograma({ series: 2, execSeg: 5, descansoSeg: 5 })
  assert.equal(c.marcos.length, 1); assert.equal(c.fases.filter(f => f.proximo != null).length, 0)
  assert.equal(c.cues.filter(x => x.clip === 'proximo').length, 0)
})
await t('setas das repetições: número único e faixa', () => {
  assert.equal(passoReps('10', 1), '11'); assert.equal(passoReps('1', -1), '1')
  assert.equal(passoReps('8-12', 1), '9-13'); assert.equal(passoReps('8 - 12', -1), '7-11')
  assert.equal(passoReps('1-3', -1), '1-3'); assert.equal(passoReps('até a falha', 1), null)
})
await t('setas da carga: kg, par de halteres, vazio e texto livre', () => {
  assert.equal(passoCarga('20 kg', 1), '21 kg'); assert.equal(passoCarga('20', -1), '19 kg'); assert.equal(passoCarga('12,5 kg', 1), '13,5 kg')
  assert.equal(passoCarga('2×10 kg', 1), '2×11 kg'); assert.equal(passoCarga('2x1 kg', -1), '2x1 kg')
  assert.equal(passoCarga('', 1), '1 kg'); assert.equal(passoCarga(undefined, -1), null); assert.equal(passoCarga('1 kg', -1), '')
  assert.equal(passoCarga('elástico médio', 1), null)
})
await t('ajuste no contador: novo trabalho/descanso vale só para as fases que ainda não começaram', () => {
  const dur = (c: ReturnType<typeof montarCronograma>, tipo: string, serie: number) => {
    const f = c.fases.find(x => x.tipo === tipo && x.serie === serie && x.exercicio === 0)!
    return Math.round((f.fim - f.inicio) * 10) / 10
  }
  // Tempos diferentes por série
  const c = montarCronograma({ series: 3, execSeg: 40, descansoSeg: 60, execPorSerie: [40, 50, 55], descPorSerie: [60, 90] }, {}, () => true)
  assert.equal(dur(c, 'work', 2), 50); assert.equal(dur(c, 'work', 3), 55); assert.equal(dur(c, 'rest', 1), 60); assert.equal(dur(c, 'rest', 2), 90)
  // Player parado no início: tudo é futuro
  const ouv = { onFim: () => {}, onSeriesConcluidas: () => {} }
  const p = new TreinoPlayer({ series: 3, execSeg: 40, descansoSeg: 60 }, null, ouv)
  p.atualizarTempos(0, { exec: 45 })
  assert.deepEqual([1, 2, 3].map(s => dur(p.crono, 'work', s)), [45, 45, 45])
  // No meio da série 2: muda o descanso -> a pausa depois da série 2 já usa o novo; a série 2 continua igual
  const w2 = p.crono.fases.find(f => f.tipo === 'work' && f.serie === 2)!
  const meio = w2.inicio + 10
  ;(p as unknown as { t0: number }).t0 = Date.now() - meio * 1000
  p.atualizarTempos(0, { desc: 90, exec: 30 })
  assert.equal(dur(p.crono, 'rest', 1), 60, 'pausa 1 já passou')
  assert.equal(dur(p.crono, 'work', 2), 45, 'série em andamento não muda')
  assert.equal(dur(p.crono, 'rest', 2), 90, 'próxima pausa já usa o novo descanso')
  assert.equal(dur(p.crono, 'work', 3), 30, 'próxima série já usa o novo trabalho')
  // O passado não muda: o ponto atual continua na série 2
  assert.equal(estadoEm(p.crono, meio).fase.serie, 2)
})

await t('ergogênicos: próxima vez, atraso, marcar feito e aviso discreto', () => {
  const base = normalizarItem({ id: 'a', nome: ' Testosterona ', dose: 250, unidade: 'mg', intervaloDias: 7, horario: '09:30', proxima: '2026-11-11', forma: 'injetavel' })!
  assert.equal(base.nome, 'Testosterona'); assert.equal(base.lembrete, true); assert.deepEqual(base.vezes, [{ tipo: 'horario', horario: '09:30' }])
  assert.equal(normalizarItem({ id: 'b', nome: 'X', dose: 0, intervaloDias: 7 }), null, 'dose zero é inválida')
  assert.equal(normalizarItem({ id: 'c', nome: 'X', dose: 1, intervaloDias: 0 }), null, 'intervalo 0 é inválido')
  assert.deepEqual(situacao(base, '2026-11-11'), { tipo: 'hoje', dias: 0, texto: 'hoje' })
  assert.equal(situacao(base, '2026-11-13').texto, 'atrasado 2 dias')
  assert.equal(situacao(base, '2026-11-10').texto, 'amanhã')
  const feito = marcarVez(base, 0, '2026-11-13')
  assert.equal(feito.proxima, '2026-11-20', 'conta a partir do dia em que fez'); assert.deepEqual(feito.historico, ['2026-11-13#0'])
  assert.equal(desfazerVez(feito, 0, '2026-11-13').proxima, '2026-11-13')
  assert.equal(somarDias('2026-12-30', 7), '2027-01-06')
  const r = normalizarRotina({ itens: [base, { id: 'z' }], discreto: undefined })
  assert.equal(r.itens.length, 1); assert.equal(r.discreto, true, 'discreto por padrão')
  assert.equal(pendentesHoje(r, '2026-11-12').length, 1)
  assert.doesNotMatch(textoAviso(base, true).titulo + textoAviso(base, true).corpo, /Testosterona/, 'aviso discreto sem o nome')
  assert.match(textoAviso(base, false).titulo, /Testosterona/)
  // Histórico antigo (só a data) vira a primeira vez do dia
  assert.deepEqual(normalizarItem({ ...base, historico: ['2026-11-04'] })!.historico, ['2026-11-04#0'])
})

await t('ergogênicos: várias vezes no dia, antes e depois do treino e histórico', () => {
  const creatina = normalizarItem({ id: 'k', nome: 'Creatina', dose: 5, unidade: 'g', intervaloDias: 1, proxima: '2026-11-11',
    vezes: [{ tipo: 'antes', horario: '08:00' }, { tipo: 'depois', horario: '08:00' }, { tipo: 'horario', horario: '22:00' }] })!
  const r = { itens: [creatina], discreto: false }
  assert.deepEqual(pendentesDoTreino(r, 'antes', '2026-11-11').map(p => p.vez), [0])
  assert.deepEqual(pendentesDoTreino(r, 'depois', '2026-11-11').map(p => p.vez), [1])
  let c = marcarVez(creatina, 0, '2026-11-11')
  assert.equal(c.proxima, '2026-11-11', 'falta vez no dia: a próxima continua hoje'); assert.equal(diaCompleto(c, '2026-11-11'), false)
  assert.equal(pendentesDoTreino({ ...r, itens: [c] }, 'antes', '2026-11-11').length, 0)
  c = marcarVez(marcarVez(c, 1, '2026-11-11'), 2, '2026-11-11')
  assert.equal(c.proxima, '2026-11-12', 'dia completo: próxima = amanhã')
  assert.deepEqual(historicoPorDia(c), [{ dia: '2026-11-11', vezes: [0, 1, 2] }])
  assert.equal(desfazerVez(c, 2, '2026-11-11').proxima, '2026-11-11', 'desfazer uma vez reabre o dia')
  assert.match(textoAviso(creatina, true, 'depois').corpo, /depois do treino/)
})

await t('setas de execução e descanso: sempre de 5 em 5 segundos', () => {
  assert.equal(passoTempo(60, 1, 0), 65); assert.equal(passoTempo(60, -1, 0), 55); assert.equal(passoTempo(90, 1, 0), 95)
  assert.equal(passoTempo(3, 1, 5), 5); assert.equal(passoTempo(3, -1, 0), 0); assert.equal(passoTempo(47, 1, 0), 50); assert.equal(passoTempo(47, -1, 0), 45)
  assert.equal(passoTempo(5, -1, 5), 5); assert.equal(passoTempo(0, -1, 0), 0); assert.equal(passoTempo(600, 1, 0), 600)
})
await t('tempo digitado no card: 1:30, 130, 45 e 90', () => {
  assert.equal(lerTempo('1:30'), 90); assert.equal(lerTempo('130'), 90); assert.equal(lerTempo('45'), 45); assert.equal(lerTempo('90'), 90)
  assert.equal(lerTempo('2.05'), 125); assert.equal(lerTempo('abc'), null); assert.equal(mss(90), '1:30'); assert.equal(mss(5), '0:05')
})
await t('anúncio da série: única, primeira, número e última', () => {
  assert.equal(chaveSerie(1, 1), 'serie_unica'); assert.equal(chaveSerie(1, 4), 'serie_primeira')
  assert.equal(chaveSerie(3, 4), 'serie_3'); assert.equal(chaveSerie(4, 4), 'serie_ultima')
  assert.equal(textoDoClipe('serie_3'), 'Série três!'); assert.equal(textoDoClipe('serie_ultima'), 'Última série!')
})

// Semana de 9/11 (segunda) a 15/11/2026 (domingo); treinos A (peito) seg, B (perna) qua, C (costas) sex
const planoSemana = () => normalizarPlano({ versao: 2, dias: [
  { letra: 'A', foco: 'Peito', grupos: ['peito', 'triceps'], exercicios: [{ nome: 'Supino', series: 4 }, { nome: 'Crucifixo', series: 3 }, { nome: 'Tríceps corda', series: 3 }] },
  { letra: 'B', foco: 'Perna', grupos: ['quadriceps'], exercicios: [{ nome: 'Agachamento', series: 4 }] },
  { letra: 'C', foco: 'Costas', grupos: ['costas'], exercicios: [{ nome: 'Remada', series: 4 }] },
], agenda: [{ letra: 'A', diaSemana: 'Segunda' }, { letra: 'B', diaSemana: 'Quarta' }, { letra: 'C', diaSemana: 'Sexta' }] })

await t('treino perdido: detecta no dia seguinte e quem fez em outro dia não perdeu', () => {
  const p = planoSemana()
  assert.equal(inicioSemana('2026-11-15'), '2026-11-09'); assert.equal(inicioSemana('2026-11-09'), '2026-11-09')
  assert.deepEqual(treinosPerdidos(p, '2026-11-09', []), [], 'no próprio dia ainda não é perdido')
  assert.deepEqual(treinosPerdidos(p, '2026-11-10', []).map(a => a.letra + a.data), ['A2026-11-09'])
  assert.deepEqual(treinosPerdidos(p, '2026-11-10', [0]), [], 'fez o A (em qualquer dia da semana)')
  // perdeu A e B: perna (grupo maior) vem primeiro
  assert.deepEqual(treinosPerdidos(p, '2026-11-12', []).map(a => a.letra), ['B', 'A'])
  assert.deepEqual(treinosPerdidos(p, '2026-11-16', []), [], 'semana nova zera')
})

await t('treino perdido: dividir no restante da semana sem mudar o volume e desfazer', () => {
  const p = planoSemana()
  const [perdido] = treinosPerdidos(p, '2026-11-10', [])
  assert.equal(podeDividir(p, perdido, '2026-11-10', false), true)
  const d = dividirNaSemana(p, perdido, '2026-11-10', false)
  const extras = d.dias.flatMap(x => x.exercicios.filter(e => e.temporarioAte))
  assert.deepEqual(extras.map(e => [e.nome, e.series]).sort(), [['Crucifixo', 3], ['Supino', 4], ['Tríceps corda', 3]])
  assert.equal(extras.reduce((s, e) => s + e.series, 0), 10, 'mesmas séries')
  assert.deepEqual(d.dias[1].exercicios.map(e => e.nome), ['Agachamento', 'Supino', 'Tríceps corda'], 'B (quarta) recebe o 1º e o 3º')
  assert.deepEqual(d.dias[2].exercicios.map(e => e.nome), ['Remada', 'Crucifixo'], 'C (sexta) recebe o 2º')
  assert.equal(d.dias[0].exercicios.length, 3, 'o treino A fica igual')
  assert.ok(extras.every(e => e.temporarioAte === '2026-11-15' && e.origemTemp === '2026-11-09'))
  assert.deepEqual(treinosPerdidos(d, '2026-11-10', []), [], 'ajustado: o card some')
  assert.deepEqual(ajustesDaSemana(d, '2026-11-10').map(a => [a.letra, a.tipo]), [['A', 'dividido']])
  const volta = desfazerAjuste(d, '2026-11-09')
  assert.deepEqual(volta.dias.map(x => x.exercicios.length), [3, 1, 1])
  // depois de sexta não tem para onde dividir
  assert.equal(podeDividir(p, perdido, '2026-11-14', false), false)
  // passou domingo: os temporários somem ao carregar o plano
  const velho = { ...d, dias: d.dias.map(x => ({ ...x, exercicios: x.exercicios.map(e => (e.temporarioAte ? { ...e, temporarioAte: '2020-01-05' } : e)) })) }
  assert.deepEqual(normalizarPlano(JSON.parse(JSON.stringify(velho))).dias.map(x => x.exercicios.length), [3, 1, 1])
})

await t('treino perdido: encaixar num dia livre e aviso de manhã no app', () => {
  const p = planoSemana()
  const [perdido] = treinosPerdidos(p, '2026-11-10', [])
  assert.deepEqual(diasLivres(p, '2026-11-10'), ['2026-11-10', '2026-11-12', '2026-11-14', '2026-11-15'])
  const e = encaixar(p, perdido, '2026-11-12', '2026-11-10')
  assert.deepEqual(e.encaixes, [{ data: '2026-11-12', letra: 'A', origem: '2026-11-09', ate: '2026-11-15' }])
  assert.ok(!diasLivres(e, '2026-11-10').includes('2026-11-12'))
  assert.deepEqual(treinosPerdidos(e, '2026-11-10', []), [])
  assert.equal(proximoTreino(e, 0), 1, 'a sequência dos treinos não muda')
  assert.equal(desfazerAjuste(e, '2026-11-09').encaixes?.length, 0)
  const n = normalizarPlano(JSON.parse(JSON.stringify({ ...e, encaixes: [{ ...e.encaixes![0], ate: '2020-01-05' }] })))
  assert.equal(n.encaixes, undefined, 'encaixe de semana passada some')
  // aviso: um por dia de treino de hoje até sábado ainda sem treino; o de domingo não (a semana vira)
  assert.deepEqual(avisosDaSemana(p, '2026-11-09', []).map(a => a.data), ['2026-11-09', '2026-11-11', '2026-11-13'])
  assert.deepEqual(avisosDaSemana(p, '2026-11-09', [0]).map(a => a.data), ['2026-11-11', '2026-11-13'], 'treinou hoje: sem aviso amanhã')
})

await t('dias da semana: sugestão na primeira vez e gravação no plano', () => {
  const sem = normalizarPlano({ versao: 2, dias: [{ letra: 'A' }, { letra: 'B' }, { letra: 'C' }], agenda: [{ letra: 'A' }, { letra: 'B' }, { letra: 'C' }] })
  assert.equal(temDiasDaSemana(sem), false)
  assert.deepEqual(semanaDoPlano(sem), ['A', null, 'B', null, 'C', null, null])
  const com = aplicarSemana(sem, ['A', 'B', null, 'C', 'A', null, null])
  assert.deepEqual(com.agenda, [{ letra: 'A', diaSemana: 'Segunda' }, { letra: 'B', diaSemana: 'Terça' }, { letra: 'C', diaSemana: 'Quinta' }, { letra: 'A', diaSemana: 'Sexta' }])
  assert.equal(com.frequencia_semanal, 4); assert.equal(temDiasDaSemana(com), true)
  assert.deepEqual(semanaDoPlano(com), ['A', 'B', null, 'C', 'A', null, null])
  assert.deepEqual(normalizarPlano(JSON.parse(JSON.stringify(com))).agenda, com.agenda)
})

await t('treino perdido: evita o mesmo grupamento em dias seguidos e avisa quando não sobra descanso', () => {
  // A peito seg (perdido), B perna ter, C costas qua, D peito qui; hoje é terça
  const p = normalizarPlano({ versao: 2, dias: [
    { letra: 'A', grupos: ['peito'], exercicios: [{ nome: 'Supino reto com barra', series: 4 }, { nome: 'Crucifixo', grupos_musculares: ['Peito'], series: 3 }, { nome: 'Rosca direta', series: 3 }] },
    { letra: 'B', grupos: ['quadriceps'], exercicios: [{ nome: 'Agachamento', grupos_musculares: ['Quadríceps'], series: 4 }] },
    { letra: 'C', grupos: ['costas'], exercicios: [{ nome: 'Remada', grupos_musculares: ['Costas'], series: 4 }] },
    { letra: 'D', grupos: ['peito'], exercicios: [{ nome: 'Supino inclinado', grupos_musculares: ['Peito'], series: 4 }] },
  ], agenda: [{ letra: 'A', diaSemana: 'Segunda' }, { letra: 'B', diaSemana: 'Terça' }, { letra: 'C', diaSemana: 'Quarta' }, { letra: 'D', diaSemana: 'Quinta' }] })
  assert.equal(familiaDoExercicio(p.dias[0].exercicios[0]), 'Peito'); assert.equal(familiaDoExercicio(p.dias[1].exercicios[0]), 'Pernas')
  const [perdido] = treinosPerdidos(p, '2026-11-10', [])
  const d = dividirNaSemana(p, perdido, '2026-11-10', false)
  const extras = (i: number) => d.dias[i].exercicios.filter(e => e.temporarioAte).map(e => e.nome)
  assert.deepEqual(extras(2), ['Rosca direta'], 'peito não vai para quarta (colada no peito de quinta)')
  assert.equal([...extras(1), ...extras(3)].filter(n => n !== 'Rosca direta').length, 2)
  const ops = opcoesEncaixe(p, perdido, '2026-11-10')
  assert.deepEqual(ops.find(o => o.data === '2026-11-13')?.colado, ['Peito'], 'sexta encosta no peito de quinta')
  assert.equal(ops.at(-1)?.data, '2026-11-13', 'os dias colados vão para o fim')
  assert.ok(ops.every(o => !o.semDescanso))
  const cheio = normalizarPlano({ ...p, agenda: [...p.agenda, { letra: 'B', diaSemana: 'Sexta' }, { letra: 'C', diaSemana: 'Sábado' }] })
  assert.deepEqual(opcoesEncaixe(cheio, perdido, '2026-11-10').map(o => [o.data, o.semDescanso]), [['2026-11-15', true]])
  assert.deepEqual(alertasSemana(p, ['A', 'D', null, null, null, null, null]), ['Peito em dias seguidos (Segunda e Terça).'])
  assert.deepEqual(alertasSemana(p, ['A', 'B', 'C', 'D', 'B', 'C', 'A']).sort(), ['Peito e Bíceps em dias seguidos (Domingo e Segunda).', 'Sem nenhum dia de descanso na semana.'])
})
console.log(`\n${ok} testes passaram`)
