// Bonequinho de traço mostrando a execução do exercício, animado em loop (ida e volta).
// Cada movimento tem poses-chave: posição do quadril, inclinação do tronco e onde ficam mãos e pés;
// braços e pernas se dobram sozinhos (cinemática inversa), então as proporções ficam sempre certas.
// Desenhado no próprio app (SVG): nítido, leve e funciona sem internet.

type P = [number, number]
/** Pose-chave. Ângulos em graus na tela: 0 = direita, 90 = baixo, -90 = cima, 180 = esquerda. */
interface Chave {
  q: P // quadril
  t: number // direção do tronco (quadril → pescoço)
  m: P // mão (ponto que a mão tenta alcançar)
  p: P // pé
  /** lado para onde dobram cotovelo e joelho (1 ou -1) */
  dc?: number
  dj?: number
  /** braço e perna do outro lado (vista de lado). Na vista de frente são espelhados sozinhos. */
  m2?: P
  p2?: P
}
interface Movimento {
  rotulo: string
  chaves: Chave[]
  segundos: number
  frente?: boolean // vista de frente (braços e pernas espelhados)
  peso?: 'barra' | 'halter' | 'kb'
  pesoEm?: 'mao' | 'costas' | 'peito'
  banco?: [P, P] // assento/banco (linha) com pés até o chão
  barraFixa?: number // altura da barra fixa
  cabo?: P // polia: o cabo vai daqui até a mão
  linhas?: [number, number, number, number][] // peças fixas (máquina, apoio)
}

const L = { tronco: 29, braco: 15, antebraco: 14, coxa: 21, perna: 21 }
const CHAO = 92
const rad = (g: number) => (g * Math.PI) / 180
const vai = (o: P, ang: number, d: number): P => [o[0] + d * Math.cos(rad(ang)), o[1] + d * Math.sin(rad(ang))]

/** Dois segmentos (ex.: braço e antebraço) saindo de `a` e terminando o mais perto possível de `alvo`. */
function ik(a: P, alvo: P, l1: number, l2: number, lado = 1): [P, P] {
  const vx = alvo[0] - a[0], vy = alvo[1] - a[1]
  const d0 = Math.hypot(vx, vy) || 0.01
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 0.5), l1 + l2 - 0.05)
  const ux = vx / d0, uy = vy / d0
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  const meio: P = [a[0] + ux * x, a[1] + uy * x]
  const junta: P = [meio[0] - uy * h * lado, meio[1] + ux * h * lado]
  return [junta, [a[0] + ux * d, a[1] + uy * d]]
}

interface Esqueleto {
  cabeca: P; pescoco: P; quadril: P
  cotovelo: P; mao: P; joelho: P; pe: P
  cotovelo2?: P; mao2?: P; joelho2?: P; pe2?: P
}

function montar(c: Chave, frente: boolean): Esqueleto {
  const pescoco = vai(c.q, c.t, L.tronco)
  const cabeca = vai(c.q, c.t, L.tronco + 7)
  const ombro = vai(c.q, c.t, L.tronco - 2)
  const [cotovelo, mao] = ik(ombro, c.m, L.braco, L.antebraco, c.dc ?? 1)
  const [joelho, pe] = ik(c.q, c.p, L.coxa, L.perna, c.dj ?? -1)
  const e: Esqueleto = { cabeca, pescoco, quadril: c.q, cotovelo, mao, joelho, pe }
  const espelho = (x: P): P => [2 * c.q[0] - x[0], x[1]]
  const m2 = frente ? espelho(c.m) : c.m2
  const p2 = frente ? espelho(c.p) : c.p2
  if (m2) [e.cotovelo2, e.mao2] = ik(ombro, m2, L.braco, L.antebraco, -(c.dc ?? 1) * (frente ? 1 : -1))
  if (p2) [e.joelho2, e.pe2] = ik(c.q, p2, L.coxa, L.perna, (c.dj ?? -1) * (frente ? -1 : 1))
  return e
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mixP = (a: P, b: P, k: number): P => [mix(a[0], b[0], k), mix(a[1], b[1], k)]
function entre(a: Chave, b: Chave, k: number): Chave {
  return {
    q: mixP(a.q, b.q, k), t: mix(a.t, b.t, k), m: mixP(a.m, b.m, k), p: mixP(a.p, b.p, k), dc: a.dc, dj: a.dj,
    m2: a.m2 && b.m2 ? mixP(a.m2, b.m2, k) : a.m2, p2: a.p2 && b.p2 ? mixP(a.p2, b.p2, k) : a.p2,
  }
}

// ── Movimentos ──────────────────────────────────────────────────────────────────────────────
// Base em pé (de lado, olhando para a direita): quadril (60,50), pés no chão (60,92).
const EM_PE = { q: [60, 50] as P, t: -90, p: [60, CHAO] as P }

function deitadoSupino(inclina = 0, bracoReto = false): Movimento {
  // Deitado no banco, cabeça à esquerda. inclina > 0 = banco inclinado (cabeça mais alta)
  const q: P = [76, 60], t = 180 + inclina
  const ombro = vai(q, t, L.tronco - 2)
  const banco: [P, P] = [vai(q, t, L.tronco + 10), [q[0] + 6, q[1] + 4]]
  banco[0] = [banco[0][0], banco[0][1] + 4]
  const pe: P = [q[0] + 18, CHAO]
  return {
    rotulo: bracoReto ? 'Crucifixo' : 'Supino', segundos: 1.7, peso: 'barra', banco,
    chaves: bracoReto
      ? [{ q, t, m: [ombro[0], ombro[1] - 28], p: pe }, { q, t, m: [ombro[0] - 4, ombro[1] + 22], p: pe, dc: -1 }]
      : [{ q, t, m: [ombro[0], ombro[1] - 28], p: pe, dc: -1 }, { q, t, m: [ombro[0] + 2, ombro[1] - 4], p: pe, dc: -1 }],
  }
}

const MOV: Record<string, Movimento> = {
  supino: deitadoSupino(0),
  supinoInclinado: deitadoSupino(28),
  supinoDeclinado: deitadoSupino(-14),
  crucifixo: deitadoSupino(0, true),
  crucifixoInclinado: deitadoSupino(28, true),
  pullover: {
    rotulo: 'Pullover', segundos: 2, peso: 'halter', banco: [[30, 64], [82, 64]],
    chaves: [{ q: [76, 60], t: 180, m: [49, 30], p: [94, CHAO] }, { q: [76, 60], t: 180, m: [20, 66], p: [94, CHAO] }],
  },
  crossover: {
    rotulo: 'Crossover', segundos: 1.7, frente: true, cabo: [24, 12],
    chaves: [{ ...EM_PE, m: [32, 22], dc: -1 }, { ...EM_PE, m: [57, 50], dc: -1 }],
  },
  flexao: {
    rotulo: 'Flexão', segundos: 1.6,
    chaves: [{ q: [52, 75], t: -24, m: [80, CHAO], p: [14, CHAO], dc: 1, dj: 1 }, { q: [55, 84], t: -9, m: [80, CHAO], p: [14, CHAO], dc: 1, dj: 1 }],
  },
  mergulho: {
    rotulo: 'Mergulho', segundos: 1.6, linhas: [[44, 52, 76, 52], [52, 52, 52, 92], [70, 52, 70, 92]],
    chaves: [{ q: [60, 47], t: -90, m: [62, 52], p: [50, 80], dc: 1, dj: 1 }, { q: [60, 62], t: -84, m: [62, 52], p: [50, 92], dc: 1, dj: 1 }],
  },
  puxada: {
    rotulo: 'Puxada', segundos: 1.7, cabo: [64, 2], banco: [[46, 66], [72, 66]],
    chaves: [{ q: [58, 62], t: -96, m: [64, 6], p: [80, CHAO], dc: -1 }, { q: [58, 62], t: -100, m: [62, 30], p: [80, CHAO], dc: -1 }],
  },
  barraFixa: {
    rotulo: 'Barra fixa', segundos: 1.8, barraFixa: 8,
    chaves: [{ q: [60, 66], t: -90, m: [62, 8], p: [56, 100], dc: -1 }, { q: [60, 46], t: -90, m: [62, 8], p: [56, 82], dc: -1 }],
  },
  remadaCurvada: {
    rotulo: 'Remada', segundos: 1.6, peso: 'barra',
    chaves: [{ q: [52, 54], t: -25, m: [74, 76], p: [62, CHAO], dc: 1 }, { q: [52, 54], t: -25, m: [62, 62], p: [62, CHAO], dc: 1 }],
  },
  remadaSentada: {
    rotulo: 'Remada sentada', segundos: 1.6, cabo: [104, 66], banco: [[40, 72], [64, 72]], linhas: [[86, 70, 86, 92]],
    chaves: [{ q: [52, 68], t: -78, m: [84, 66], p: [86, 72], dc: 1 }, { q: [52, 68], t: -96, m: [64, 58], p: [86, 72], dc: 1 }],
  },
  terra: {
    rotulo: 'Levantamento terra', segundos: 2, peso: 'barra',
    chaves: [{ q: [50, 66], t: -32, m: [66, 85], p: [62, CHAO] }, { ...EM_PE, m: [62, 50] }],
  },
  stiff: {
    rotulo: 'Stiff', segundos: 1.9, peso: 'barra',
    chaves: [{ ...EM_PE, m: [62, 50] }, { q: [52, 52], t: -12, m: [70, 80], p: [60, CHAO] }],
  },
  encolhimento: {
    rotulo: 'Encolhimento', segundos: 1.4, peso: 'halter',
    chaves: [{ ...EM_PE, m: [61, 52] }, { q: [60, 48], t: -90, m: [61, 46], p: [60, CHAO] }],
  },
  desenvolvimento: {
    rotulo: 'Desenvolvimento', segundos: 1.7, peso: 'barra', banco: [[46, 62], [70, 62]],
    chaves: [{ q: [58, 58], t: -90, m: [62, 24], p: [78, CHAO], dc: 1 }, { q: [58, 58], t: -90, m: [60, -2], p: [78, CHAO], dc: 1 }],
  },
  elevacaoLateral: {
    rotulo: 'Elevação lateral', segundos: 1.6, frente: true, peso: 'halter',
    chaves: [{ ...EM_PE, m: [54, 50], dc: -1 }, { ...EM_PE, m: [33, 22], dc: -1 }],
  },
  elevacaoFrontal: {
    rotulo: 'Elevação frontal', segundos: 1.6, peso: 'halter',
    chaves: [{ ...EM_PE, m: [63, 50] }, { ...EM_PE, m: [88, 22] }],
  },
  crucifixoInvertido: {
    rotulo: 'Crucifixo invertido', segundos: 1.6, peso: 'halter',
    chaves: [{ q: [52, 54], t: -20, m: [70, 76], p: [62, CHAO], dc: -1 }, { q: [52, 54], t: -20, m: [62, 40], p: [62, CHAO], dc: -1 }],
  },
  remadaAlta: {
    rotulo: 'Remada alta', segundos: 1.5, peso: 'barra',
    chaves: [{ ...EM_PE, m: [63, 50] }, { ...EM_PE, m: [64, 24], dc: 1 }],
  },
  rosca: {
    rotulo: 'Rosca', segundos: 1.5, peso: 'barra',
    chaves: [{ ...EM_PE, m: [64, 50], dc: -1 }, { ...EM_PE, m: [72, 26], dc: -1 }],
  },
  roscaPunho: {
    rotulo: 'Rosca de punho', segundos: 1.2, peso: 'barra', banco: [[40, 64], [70, 64]],
    chaves: [{ q: [50, 60], t: -80, m: [80, 66], p: [74, CHAO], dc: -1 }, { q: [50, 60], t: -80, m: [80, 60], p: [74, CHAO], dc: -1 }],
  },
  tricepsPulley: {
    rotulo: 'Tríceps no pulley', segundos: 1.4, cabo: [70, 0],
    chaves: [{ q: [58, 50], t: -84, m: [70, 30], p: [58, CHAO], dc: 1 }, { q: [58, 50], t: -84, m: [66, 52], p: [58, CHAO], dc: 1 }],
  },
  tricepsFrances: {
    rotulo: 'Tríceps francês', segundos: 1.6, peso: 'halter',
    chaves: [{ ...EM_PE, m: [52, 14], dc: -1 }, { ...EM_PE, m: [62, -6], dc: -1 }],
  },
  tricepsTesta: {
    rotulo: 'Tríceps testa', segundos: 1.6, peso: 'barra', banco: [[30, 64], [82, 64]],
    chaves: [{ q: [76, 60], t: 180, m: [38, 30], p: [94, CHAO], dc: 1 }, { q: [76, 60], t: 180, m: [24, 46], p: [94, CHAO], dc: 1 }],
  },
  coice: {
    rotulo: 'Tríceps coice', segundos: 1.4, peso: 'halter',
    chaves: [{ q: [52, 54], t: -20, m: [68, 66], p: [62, CHAO], dc: 1 }, { q: [52, 54], t: -20, m: [50, 52], p: [62, CHAO], dc: 1 }],
  },
  abdominal: {
    rotulo: 'Abdominal', segundos: 1.4,
    chaves: [{ q: [66, 88], t: 180, m: [44, 84], p: [92, CHAO], dc: 1, dj: -1 }, { q: [66, 88], t: 212, m: [50, 70], p: [92, CHAO], dc: 1, dj: -1 }],
  },
  elevacaoPernas: {
    rotulo: 'Elevação de pernas', segundos: 1.6,
    chaves: [{ q: [60, 88], t: 180, m: [44, 90], p: [102, 90] }, { q: [60, 88], t: 180, m: [44, 90], p: [64, 46] }],
  },
  elevacaoPernasBarra: {
    rotulo: 'Elevação de pernas', segundos: 1.7, barraFixa: 6,
    chaves: [{ q: [60, 64], t: -90, m: [62, 6], p: [60, 106], dc: -1 }, { q: [60, 64], t: -90, m: [62, 6], p: [100, 60], dc: -1 }],
  },
  prancha: {
    rotulo: 'Prancha', segundos: 2.2,
    chaves: [{ q: [50, 76], t: -8, m: [80, CHAO], p: [14, CHAO], dc: 1, dj: 1 }, { q: [50, 73], t: -10, m: [80, CHAO], p: [14, CHAO], dc: 1, dj: 1 }],
  },
  escalador: {
    rotulo: 'Escalador', segundos: 1, p2: undefined,
    chaves: [{ q: [50, 72], t: -20, m: [80, CHAO], p: [14, CHAO], p2: [52, 86], dc: 1, dj: 1 }, { q: [50, 72], t: -20, m: [80, CHAO], p: [52, 86], p2: [14, CHAO], dc: 1, dj: 1 }],
  } as Movimento,
  hiperextensao: {
    rotulo: 'Hiperextensão', segundos: 1.7, linhas: [[50, 61, 64, 65], [57, 63, 57, 92], [14, 77, 22, 77]],
    chaves: [{ q: [56, 58], t: 120, m: [46, 76], p: [17, 74], dj: 1 }, { q: [56, 58], t: -14, m: [76, 46], p: [17, 74], dj: 1 }],
  },
  agachamento: {
    rotulo: 'Agachamento', segundos: 1.8, peso: 'barra', pesoEm: 'costas',
    chaves: [{ ...EM_PE, m: [54, 24], dc: 1 }, { q: [44, 66], t: -60, m: [58, 46], p: [60, CHAO], dc: 1 }],
  },
  agachamentoLivre: {
    rotulo: 'Agachamento', segundos: 1.6,
    chaves: [{ ...EM_PE, m: [82, 26] }, { q: [44, 66], t: -60, m: [88, 46], p: [60, CHAO] }],
  },
  afundo: {
    rotulo: 'Afundo', segundos: 1.8, peso: 'halter',
    chaves: [{ q: [60, 52], t: -90, m: [61, 54], p: [80, CHAO], p2: [38, CHAO] }, { q: [60, 66], t: -90, m: [61, 68], p: [82, CHAO], p2: [38, CHAO] }],
  },
  subidaBanco: {
    rotulo: 'Subida no banco', segundos: 1.8, peso: 'halter', linhas: [[66, 74, 96, 74], [66, 74, 66, 92], [96, 74, 96, 92]],
    chaves: [{ q: [56, 50], t: -90, m: [57, 52], p: [56, CHAO], p2: [76, 74] }, { q: [70, 33], t: -88, m: [71, 35], p: [70, 74], p2: [72, 60] }],
  },
  legPress: {
    rotulo: 'Leg press', segundos: 1.7, banco: [[30, 74], [50, 74]], linhas: [[30, 74, 20, 52]],
    chaves: [{ q: [44, 72], t: -125, m: [44, 70], p: [88, 34], dj: 1 }, { q: [44, 72], t: -125, m: [44, 70], p: [66, 46], dj: 1 }],
  },
  extensora: {
    rotulo: 'Cadeira extensora', segundos: 1.5, banco: [[40, 66], [62, 66]], linhas: [[40, 66, 36, 30]],
    chaves: [{ q: [46, 62], t: -100, m: [56, 66], p: [66, 90], dj: 1 }, { q: [46, 62], t: -100, m: [56, 66], p: [86, 60], dj: 1 }],
  },
  flexora: {
    rotulo: 'Mesa flexora', segundos: 1.5, banco: [[18, 70], [74, 70]],
    chaves: [{ q: [56, 66], t: 180, m: [24, 74], p: [98, 66], dj: 1 }, { q: [56, 66], t: 180, m: [24, 74], p: [66, 40], dj: 1 }],
  },
  elevacaoPelvica: {
    rotulo: 'Elevação pélvica', segundos: 1.6, peso: 'barra', banco: [[14, 66], [34, 66]],
    chaves: [{ q: [52, 86], t: 200, m: [52, 82], p: [74, CHAO], dc: -1 }, { q: [52, 66], t: 180, m: [52, 62], p: [74, CHAO], dc: -1 }],
  },
  coiceGluteo: {
    rotulo: 'Coice de glúteo', segundos: 1.4,
    chaves: [{ q: [48, 66], t: -4, m: [76, CHAO], p: [50, CHAO], p2: [30, CHAO], dc: 1, dj: -1 }, { q: [48, 66], t: -4, m: [76, CHAO], p: [14, 50], p2: [30, CHAO], dc: 1, dj: 1 }],
  },
  abdutora: {
    rotulo: 'Abdutora', segundos: 1.5, frente: true, banco: [[46, 66], [74, 66]],
    chaves: [{ q: [60, 62], t: -90, m: [52, 66], p: [56, 92] }, { q: [60, 62], t: -90, m: [52, 66], p: [36, 88] }],
  },
  abducaoEmPe: {
    rotulo: 'Abdução', segundos: 1.4, frente: true,
    chaves: [{ ...EM_PE, m: [52, 50], p: [56, CHAO] }, { ...EM_PE, m: [52, 50], p: [40, 88] }],
  },
  panturrilha: {
    rotulo: 'Panturrilha', segundos: 1.2,
    linhas: [[50, 92, 76, 92]],
    chaves: [{ ...EM_PE, m: [61, 52] }, { q: [60, 41], t: -90, m: [61, 43], p: [63, 83] }],
  },
  swing: {
    rotulo: 'Kettlebell swing', segundos: 1.4, peso: 'kb',
    chaves: [{ q: [48, 60], t: -30, m: [56, 80], p: [62, CHAO] }, { ...EM_PE, m: [92, 28] }],
  },
  caminhada: {
    rotulo: 'Caminhada', segundos: 1.1, peso: 'halter',
    chaves: [{ q: [60, 51], t: -90, m: [61, 52], p: [72, CHAO], p2: [48, CHAO] }, { q: [60, 51], t: -90, m: [61, 52], p: [48, CHAO], p2: [72, CHAO] }],
  },
  suspensao: {
    rotulo: 'Suspensão', segundos: 2.2, barraFixa: 8,
    chaves: [{ q: [60, 66], t: -90, m: [62, 8], p: [58, 104], dc: -1 }, { q: [60, 64], t: -90, m: [62, 8], p: [58, 102], dc: -1 }],
  },
}

// ── Qual movimento cada exercício usa ───────────────────────────────────────────────────────
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const REGRAS: [RegExp, string][] = [
  // Sem desenho que combine: mostra a descrição em texto
  [/superman|perdigueiro|canoa|pallof|dead bug|roda abdominal|lenhador|remada invertida/, ''],
  [/panturrilha/, 'panturrilha'],
  [/crucifixo inv|face pull/, 'crucifixoInvertido'],
  [/crucifixo inclinado/, 'crucifixoInclinado'],
  [/crossover|crucifixo com cabos|crucifixo na maquina|crucifixo com elastico/, 'crossover'],
  [/crucifixo/, 'crucifixo'],
  [/supino inclinado/, 'supinoInclinado'],
  [/supino declinado/, 'supinoDeclinado'],
  [/supino|jm press|svend/, 'supino'],
  [/pullover/, 'pullover'],
  [/flexao (de braco|diamante|pike)/, 'flexao'],
  [/mergulho/, 'mergulho'],
  [/elevacao de (pernas|joelhos)/, 'elevacaoPernasBarra'],
  [/suspensao/, 'suspensao'],
  [/barra fixa/, 'barraFixa'],
  [/puxada|pulldown/, 'puxada'],
  [/remada (baixa|sentada|unilateral na polia|com elastico)/, 'remadaSentada'],
  [/remada alta/, 'remadaAlta'],
  [/remada/, 'remadaCurvada'],
  [/romeno|stiff|bom dia/, 'stiff'],
  [/levantamento terra|rack pull/, 'terra'],
  [/encolhimento/, 'encolhimento'],
  [/desenvolvimento|push press/, 'desenvolvimento'],
  [/elevacao lateral/, 'elevacaoLateral'],
  [/elevacao frontal/, 'elevacaoFrontal'],
  [/rosca de punho|rolo de punho/, 'roscaPunho'],
  [/rosca/, 'rosca'],
  [/triceps (pulley|na maquina|com elastico)/, 'tricepsPulley'],
  [/triceps (frances|overhead)/, 'tricepsFrances'],
  [/triceps testa/, 'tricepsTesta'],
  [/coice de gluteo/, 'coiceGluteo'],
  [/coice/, 'coice'],
  [/prancha/, 'prancha'],
  [/escalador/, 'escalador'],
  [/abdominal infra|tesoura/, 'elevacaoPernas'],
  [/abdominal|rotacao russa/, 'abdominal'],
  [/hiperextensao/, 'hiperextensao'],
  [/leg press/, 'legPress'],
  [/extensora/, 'extensora'],
  [/flexora|flexao nordica|flexao de joelhos/, 'flexora'],
  [/elevacao pelvica|ponte de gluteo/, 'elevacaoPelvica'],
  [/gluteo na (polia|maquina)/, 'coiceGluteo'],
  [/abdutora|adutora/, 'abdutora'],
  [/abducao|aducao|caminhada lateral/, 'abducaoEmPe'],
  [/bulgaro|afundo|passada|cossaco/, 'afundo'],
  [/subida no banco/, 'subidaBanco'],
  [/agachamento livre$|agachamento com salto|agachamento na parede|agachamento unilateral|sissy/, 'agachamentoLivre'],
  [/agachamento/, 'agachamento'],
  [/kettlebell swing/, 'swing'],
  [/caminhada do fazendeiro/, 'caminhada'],
]

/** Movimento a mostrar para um exercício (nulo se não reconhecer: aí aparece a descrição em texto). */
export function movimentoDe(nome: string): Movimento | null {
  const n = sem(nome)
  const r = REGRAS.find(([re]) => re.test(n))
  return r && r[1] ? MOV[r[1]] : null
}

// ── Desenho ─────────────────────────────────────────────────────────────────────────────────
const PASSOS = 4 // poses intermediárias entre duas chaves (deixa o movimento suave)

function sequencia(m: Movimento): Esqueleto[] {
  const ida: Chave[] = []
  for (let i = 0; i < m.chaves.length - 1; i++) {
    for (let k = 0; k < PASSOS; k++) ida.push(entre(m.chaves[i], m.chaves[i + 1], k / PASSOS))
  }
  ida.push(m.chaves[m.chaves.length - 1])
  // ida, pausa curta no fim, volta e pausa curta no início
  const ciclo = [...ida, ida[ida.length - 1], ...[...ida].reverse().slice(1), ida[0]]
  return ciclo.map(c => montar(c, !!m.frente))
}

/** Nomes dos movimentos desenhados (para conferência visual). */
export const MOVIMENTOS = Object.keys(MOV)

export default function AnimacaoExercicio({ nome, movimento, className = '' }: { nome: string; movimento?: string; className?: string }) {
  const m = movimento ? MOV[movimento] : movimentoDe(nome)
  if (!m) return null
  const seq = sequencia(m)
  const dur = `${m.segundos}s`
  const n = seq.length - 1
  const keyTimes = seq.map((_, i) => (i / n).toFixed(3)).join(';')
  const anim = (attr: string, get: (e: Esqueleto) => number) => (
    <animate attributeName={attr} values={seq.map(e => get(e).toFixed(1)).join(';')} keyTimes={keyTimes} dur={dur} repeatCount="indefinite" />
  )
  const e0 = seq[0]
  type K = keyof Esqueleto
  const linha = (de: K, ate: K, cls?: string) => {
    if (!e0[de] || !e0[ate]) return null
    const g = (k: K, i: 0 | 1) => (e: Esqueleto) => (e[k] as P)[i]
    return (
      <line key={`${de}-${ate}`} x1={(e0[de] as P)[0]} y1={(e0[de] as P)[1]} x2={(e0[ate] as P)[0]} y2={(e0[ate] as P)[1]} className={cls}>
        {anim('x1', g(de, 0))}{anim('y1', g(de, 1))}{anim('x2', g(ate, 0))}{anim('y2', g(ate, 1))}
      </line>
    )
  }
  const pe = (k: 'pe' | 'pe2', cls?: string) => {
    if (!e0[k]) return null
    const dx = m.frente ? (k === 'pe' ? 6 : -6) : 7
    return (
      <line key={k} x1={e0[k]![0]} y1={e0[k]![1]} x2={e0[k]![0] + dx} y2={e0[k]![1]} className={cls}>
        {anim('x1', e => e[k]![0])}{anim('y1', e => e[k]![1])}{anim('x2', e => e[k]![0] + dx)}{anim('y2', e => e[k]![1])}
      </line>
    )
  }
  // Onde fica o peso
  const pesoDe = (e: Esqueleto): P => {
    if (m.pesoEm === 'costas') return [e.pescoco[0] - 4, e.pescoco[1] + 3]
    if (m.pesoEm === 'peito') return [e.pescoco[0] + 6, e.pescoco[1] + 4]
    return e.mao
  }
  // Enquadra todas as poses, o chão e os aparelhos
  const pts: P[] = seq.flatMap(e => [e.cabeca, e.mao, e.pe, e.joelho, e.cotovelo, e.quadril, ...(e.mao2 ? [e.mao2] : []), ...(e.pe2 ? [e.pe2] : [])])
  if (m.banco) pts.push(...m.banco)
  if (m.cabo) pts.push(m.cabo)
  if (m.barraFixa != null) pts.push([40, m.barraFixa], [80, m.barraFixa])
  for (const l of m.linhas ?? []) pts.push([l[0], l[1]], [l[2], l[3]])
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, y0 = Math.min(...ys) - 12, y1 = CHAO + 4
  const alt = y1 - y0, larg = Math.max(x1 - x0, alt * 1.45)
  const cx = (x0 + x1) / 2
  const vb = `${(cx - larg / 2).toFixed(1)} ${y0.toFixed(1)} ${larg.toFixed(1)} ${alt.toFixed(1)}`
  const traco = 5.5
  return (
    <svg viewBox={vb} role="img" aria-label={`Execução: ${m.rotulo}`} className={className}>
      <line x1={cx - larg} y1={CHAO + 0.5} x2={cx + larg} y2={CHAO + 0.5} className="stroke-zinc-700" strokeWidth="2" />
      <g className="stroke-zinc-600" strokeWidth="4" strokeLinecap="round" fill="none">
        {m.banco && <>
          <line x1={m.banco[0][0]} y1={m.banco[0][1]} x2={m.banco[1][0]} y2={m.banco[1][1]} />
          <line x1={m.banco[0][0] + 6} y1={m.banco[0][1]} x2={m.banco[0][0] + 6} y2={CHAO} />
          <line x1={m.banco[1][0] - 6} y1={m.banco[1][1]} x2={m.banco[1][0] - 6} y2={CHAO} />
        </>}
        {m.barraFixa != null && <line x1={cx - larg} y1={m.barraFixa} x2={cx + larg} y2={m.barraFixa} />}
        {(m.linhas ?? []).map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />)}
      </g>
      {m.cabo && (
        <g className="stroke-zinc-500" strokeWidth="1.5">
          <line x1={m.cabo[0]} y1={m.cabo[1]} x2={e0.mao[0]} y2={e0.mao[1]}>{anim('x2', e => e.mao[0])}{anim('y2', e => e.mao[1])}</line>
          {m.frente && e0.mao2 && (
            <line x1={2 * e0.quadril[0] - m.cabo[0]} y1={m.cabo[1]} x2={e0.mao2[0]} y2={e0.mao2[1]}>{anim('x2', e => e.mao2![0])}{anim('y2', e => e.mao2![1])}</line>
          )}
        </g>
      )}
      {/* lado de trás (mais apagado) */}
      <g className="stroke-zinc-500" strokeWidth={traco} strokeLinecap="round" fill="none">
        {!m.frente && <>{linha('quadril', 'joelho2')}{linha('joelho2', 'pe2')}{pe('pe2')}{linha('pescoco', 'cotovelo2')}{linha('cotovelo2', 'mao2')}</>}
      </g>
      <g className="stroke-zinc-100" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {m.frente && <>{linha('quadril', 'joelho2')}{linha('joelho2', 'pe2')}{pe('pe2')}{linha('pescoco', 'cotovelo2')}{linha('cotovelo2', 'mao2')}</>}
        {linha('pescoco', 'quadril')}
        {linha('quadril', 'joelho')}
        {linha('joelho', 'pe')}
        {pe('pe')}
        {linha('pescoco', 'cotovelo')}
        {linha('cotovelo', 'mao')}
        <circle r="6.5" cx={e0.cabeca[0]} cy={e0.cabeca[1]} className="fill-zinc-950">
          {anim('cx', e => e.cabeca[0])}{anim('cy', e => e.cabeca[1])}
        </circle>
      </g>
      {m.peso && [false, true].map(segundo => {
        if (segundo && !(m.frente && e0.mao2)) return null
        const onde = (e: Esqueleto): P => (segundo ? e.mao2! : pesoDe(e))
        const r = m.peso === 'barra' ? 7 : m.peso === 'kb' ? 6 : 4.5
        return (
          <circle key={String(segundo)} r={r} cx={onde(e0)[0]} cy={onde(e0)[1]} className="fill-green-500/25 stroke-green-400" strokeWidth="2.5">
            {anim('cx', e => onde(e)[0])}{anim('cy', e => onde(e)[1])}
          </circle>
        )
      })}
    </svg>
  )
}
