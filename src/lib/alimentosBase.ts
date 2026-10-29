// Base de alimentos para a busca do diário: TACO (UNICAMP) com medidas caseiras.
// Os valores da TACO são por 100 g; as medidas convertem para porções do dia a dia.
import type { Alimento } from './diario'

export interface ItemBase {
  id: string
  nome: string
  /** Texto curto abaixo do nome (categoria, marca) */
  detalhe: string
  fonte: 'taco' | 'off' | 'rotulo' | 'ia'
  /** Valores por 100 g (ou 100 ml) */
  kcal: number
  proteina: number
  carboidrato: number
  gordura: number
  /** Porção declarada no rótulo ou porção típica estimada, em gramas */
  porcaoG?: number
  porcaoRotulo?: string
  codigo?: string
}

export interface Medida { rotulo: string; gramas: number }

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Linha = [number, string, number, number, number, number, number, number, number?]
interface ArquivoTaco { categorias: Record<string, string>; alimentos: Linha[] }

let cache: Promise<ItemBase[]> | null = null

/** Carrega a TACO sob demanda (arquivo separado, só quando a pessoa abre a busca). */
export function carregarTaco(): Promise<ItemBase[]> {
  if (!cache) {
    cache = import('../data/taco.json').then(m => {
      const d = (m.default ?? m) as unknown as ArquivoTaco
      return d.alimentos.map(([id, nome, cat, kcal, p, c, g, , extra]) => ({
        id: `taco-${id}`, nome, fonte: 'taco' as const,
        detalhe: `${d.categorias[String(cat)] ?? ''}${extra ? ' · média de rótulos' : ''}`,
        kcal, proteina: p, carboidrato: c, gordura: g,
      }))
    })
  }
  return cache
}

// Palavras que as pessoas usam × como a TACO escreve
const SINONIMOS: [RegExp, string][] = [
  [/\bbranco\b/g, 'tipo 1'],
  [/\bbatata frita\b/g, 'batata, frita'],
  [/\bovo cozido\b/g, 'ovo inteiro cozido'],
  [/\bpeito de frango\b/g, 'frango peito'],
  [/\bpao frances\b/g, 'pao trigo frances'],
  [/\bpao de forma\b/g, 'pao trigo forma'],
]

function preparar(q: string): string[] {
  let s = semAcento(q).replace(/[,;]/g, ' ')
  for (const [re, troca] of SINONIMOS) s = s.replace(re, troca)
  return s.split(/\s+/).filter(t => t.length >= 2 || /^\d$/.test(t))
}

// Itens mais consumidos no Brasil sobem na lista quando a busca é genérica ("arroz", "ovo")
const POPULARES = [
  /^arroz, tipo 1, cozido/, /^feijao, carioca, cozido/, /^feijao, preto, cozido/, /^ovo, de galinha, inteiro, (cozido|frito)/,
  /^banana, (prata|nanica)/, /^batata, inglesa, cozida/, /^pao, trigo, frances/,
  /^frango, peito, sem pele, grelhado/, /^maca, fuji/, /^queijo, (minas, frescal|mozarela)/, /^carne, bovina, patinho/,
  /^cafe, infusao/, /^alface, crespa/, /^tomate, com semente/, /^leite, de vaca, (integral|desnatado|semidesnatado) \(liquido\)/,
  /^macarrao, trigo, cozido/,
]
// Categorias em que o alimento costuma ser comido pronto (cru só se a pessoa pedir)
const COZINHA = /^(cereais|carnes|pescados|leguminosas|ovos)/i

/** Raiz da palavra para ignorar gênero/número: "moida" → "moid", "cozidas" → "cozid", "crua" → "cru". */
const raiz = (t: string) => (t.length > 3 ? t.replace(/(as|os|a|o|s)$/, '') : t)

/** Busca por palavras (sem acento, em qualquer ordem). Prioriza o que começa com o termo,
 *  nomes mais curtos e alimentos prontos (cozido/assado) quando a pessoa não pede "cru". */
export function buscarBase(itens: ItemBase[], q: string, limite = 40): ItemBase[] {
  const termos = preparar(q)
  if (!termos.length) return []
  const pedeCru = termos.includes('cru') || termos.includes('crua')
  const res: { item: ItemBase; pontos: number }[] = []
  for (const item of itens) {
    const nome = semAcento(item.nome)
    const palavras = nome.split(/[\s,/()-]+/).filter(Boolean)
    let pontos = 0
    let todas = true
    for (const t of termos) {
      const r = raiz(t)
      const exata = palavras.includes(t) || palavras.some(p => raiz(p) === r)
      const prefixo = palavras.some(p => p.startsWith(t) || p.startsWith(r))
      if (!exata && !prefixo && !nome.includes(t)) { todas = false; break }
      pontos += exata ? 3 : prefixo ? 2 : 1
    }
    if (!todas) continue
    if (palavras[0] === termos[0] || raiz(palavras[0]) === raiz(termos[0])) pontos += 3
    else if (nome.startsWith(termos[0])) pontos += 1.5
    const pop = POPULARES.findIndex(re => re.test(nome))
    if (pop >= 0) pontos += 2 + (POPULARES.length - pop) * 0.05
    if (!pedeCru && COZINHA.test(item.detalhe) && /\bcru(a|s|as)?\b/.test(nome)) pontos -= 2.5
    if (/\b(gema|clara)\b/.test(nome) && !termos.some(t => t === 'gema' || t === 'clara')) pontos -= 1
    if (/\b(cozid|assad|grelhad)/.test(nome)) pontos += 0.5
    pontos -= nome.length / 60
    res.push({ item, pontos })
  }
  return res.sort((a, b) => b.pontos - a.pontos).slice(0, limite).map(r => r.item)
}

// Medidas caseiras (gramas) por tipo de alimento, conferidas com tabelas de medidas usuais no Brasil
const REGRAS: [RegExp, Medida[]][] = [
  [/^arroz.*cozid/, [{ rotulo: 'colher de servir', gramas: 45 }, { rotulo: 'escumadeira cheia', gramas: 90 }]],
  [/^feijao.*cozid|^feijao tropeiro|^feijoada/, [{ rotulo: 'concha média', gramas: 86 }, { rotulo: 'colher de servir', gramas: 45 }]],
  [/^(lentilha|grao-de-bico|ervilha).*cozid/, [{ rotulo: 'colher de servir', gramas: 45 }]],
  [/^macarrao.*cozid|^espaguete|^lasanha/, [{ rotulo: 'pegador', gramas: 110 }, { rotulo: 'escumadeira cheia', gramas: 90 }]],
  [/^pao.*frances/, [{ rotulo: 'unidade', gramas: 50 }]],
  [/^pao.*forma|^pao.*integral|^pao.*centeio/, [{ rotulo: 'fatia', gramas: 25 }]],
  [/^pao.*queijo/, [{ rotulo: 'unidade média', gramas: 40 }]],
  [/^biscoito/, [{ rotulo: 'unidade', gramas: 6 }]],
  [/^ovo.*codorna/, [{ rotulo: 'unidade', gramas: 10 }]],
  [/^ovo/, [{ rotulo: 'unidade', gramas: 50 }]],
  [/^leite.*\bpo\b/, [{ rotulo: 'colher de sopa', gramas: 16 }]],
  [/^leite, de vaca|^leite, fermentado|^bebida lactea/, [{ rotulo: 'copo (200 ml)', gramas: 200 }, { rotulo: 'xícara (240 ml)', gramas: 240 }]],
  [/^leite, condensado/, [{ rotulo: 'colher de sopa', gramas: 20 }]],
  [/^iogurte/, [{ rotulo: 'pote', gramas: 170 }]],
  [/^queijo.*(minas|mussarela|prato|coalho|parmesao)|^queijo/, [{ rotulo: 'fatia', gramas: 20 }]],
  [/^requeijao/, [{ rotulo: 'colher de sopa', gramas: 30 }]],
  [/^(manteiga|margarina)/, [{ rotulo: 'colher de chá', gramas: 5 }, { rotulo: 'colher de sopa', gramas: 14 }]],
  [/^(oleo|azeite)/, [{ rotulo: 'colher de sopa', gramas: 8 }]],
  [/^acucar|^mel\b/, [{ rotulo: 'colher de chá', gramas: 5 }, { rotulo: 'colher de sopa', gramas: 12 }]],
  [/^cafe.*infusao|^cafe.*(bebida|pronto)/, [{ rotulo: 'xícara (50 ml)', gramas: 50 }]],
  [/^(suco|refrigerante|cerveja|bebida|agua de coco|cha\b)/, [{ rotulo: 'copo (200 ml)', gramas: 200 }, { rotulo: 'lata (350 ml)', gramas: 350 }]],
  [/^banana/, [{ rotulo: 'unidade média', gramas: 80 }]],
  [/^maca\b/, [{ rotulo: 'unidade média', gramas: 130 }]],
  [/^laranja/, [{ rotulo: 'unidade média', gramas: 180 }]],
  [/^tangerina|^mexerica/, [{ rotulo: 'unidade média', gramas: 135 }]],
  [/^pera\b/, [{ rotulo: 'unidade média', gramas: 130 }]],
  [/^kiwi/, [{ rotulo: 'unidade', gramas: 75 }]],
  [/^mamao/, [{ rotulo: 'fatia média', gramas: 170 }]],
  [/^(melancia|melao|abacaxi)/, [{ rotulo: 'fatia média', gramas: 200 }]],
  [/^(uva|morango)/, [{ rotulo: 'xícara', gramas: 150 }]],
  [/^abacate/, [{ rotulo: 'colher de sopa', gramas: 45 }]],
  [/^(frango|carne|bife|porco|lombo|file|peixe|tilapia|merluza|salmao|atum|sardinha|pescada|linguica|hamburguer|presunto|peru|cupim|alcatra|contra-file|patinho|picanha|fraldinha|costela|cação|bacalhau)/, [{ rotulo: 'porção / filé médio', gramas: 100 }]],
  [/^(batata|mandioca|aipim|macaxeira|inhame|cara|batata-doce).*(cozid|assad|frit|pure)/, [{ rotulo: 'colher de servir', gramas: 60 }, { rotulo: 'unidade média', gramas: 135 }]],
  [/^(alface|rucula|agriao|couve|espinafre|repolho|acelga|chicoria)/, [{ rotulo: 'prato de sobremesa', gramas: 30 }]],
  [/^(tomate|cenoura|beterraba|pepino|abobrinha|chuchu|brocolis|couve-flor|vagem|berinjela|abobora)/, [{ rotulo: 'colher de sopa', gramas: 25 }, { rotulo: 'unidade média', gramas: 100 }]],
  [/^farinha|^farofa|^aveia|^granola|^tapioca|^goma/, [{ rotulo: 'colher de sopa', gramas: 15 }]],
  [/^(amendoim|castanha|noz|amendoa|pistache)/, [{ rotulo: 'punhado (30 g)', gramas: 30 }]],
  [/^(chocolate|doce|brigadeiro)/, [{ rotulo: 'unidade / quadrado', gramas: 25 }]],
]

/** Medidas oferecidas para um item: as caseiras do tipo dele, a porção do rótulo e 100 g. */
export function medidasDe(item: ItemBase): Medida[] {
  const nome = semAcento(item.nome)
  const lista: Medida[] = []
  if (item.porcaoG && item.porcaoG > 0) lista.push({ rotulo: item.porcaoRotulo || (item.fonte === 'ia' ? 'porção típica' : 'porção do rótulo'), gramas: Math.round(item.porcaoG) })
  if (item.fonte === 'taco') {
    const regra = REGRAS.find(([re]) => re.test(nome))
    if (regra) lista.push(...regra[1])
  }
  lista.push({ rotulo: 'gramas', gramas: 100 })
  return lista
}

const um = (n: number) => Math.round(n * 10) / 10

/** Converte o item numa porção para o diário. Medida "gramas" vira "100 g" (ajustável). */
export function paraAlimento(item: ItemBase, medida: Medida): Alimento {
  const f = medida.gramas / 100
  const quantidade = medida.rotulo === 'gramas' ? `${medida.gramas} g`
    : medida.rotulo.includes('(') ? `1 ${medida.rotulo}` : `1 ${medida.rotulo} (${medida.gramas} g)`
  return {
    nome: item.nome, quantidade,
    calorias: Math.round(item.kcal * f), proteina_g: um(item.proteina * f),
    carboidrato_g: um(item.carboidrato * f), gordura_g: um(item.gordura * f),
  }
}
