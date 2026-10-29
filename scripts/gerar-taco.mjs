// Gera src/data/taco.json a partir da Tabela Brasileira de Composição de Alimentos (TACO),
// 4ª edição, NEPA/UNICAMP (reprodução permitida citando a fonte). CSVs do projeto
// raulfdm/taco-api (licença MIT). Uso: node scripts/gerar-taco.mjs
// Formato compacto por alimento (valores por 100 g):
// [id, nome, categoria, kcal, proteína g, carboidrato g, gordura g, fibra g, complemento?]
// A TACO não traz os macronutrientes do leite fluido nem o macarrão cozido; esses entram
// como complemento (valores médios de rótulos brasileiros / USDA), marcados com 1 no fim.
import { writeFile } from 'node:fs/promises'

const BASE = 'https://raw.githubusercontent.com/raulfdm/taco-api/main/references/csv/'

function lerCsv(texto) {
  const linhas = texto.trim().split(/\r?\n/)
  const cab = linhas.shift().split(',')
  return linhas.map(l => {
    const campos = []
    let atual = '', aspas = false
    for (const ch of l) {
      if (ch === '"') aspas = !aspas
      else if (ch === ',' && !aspas) { campos.push(atual); atual = '' }
      else atual += ch
    }
    campos.push(atual)
    return Object.fromEntries(cab.map((c, i) => [c, campos[i] ?? '']))
  })
}

const baixar = async nome => lerCsv(await (await fetch(BASE + nome)).text())
const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Math.round(Number(v) * 10) / 10)

const [alimentos, nutrientes, categorias] = await Promise.all([baixar('food.csv'), baixar('nutrients.csv'), baixar('categories.csv')])
const porId = new Map(nutrientes.map(n => [n.foodId, n]))
const saida = []
for (const a of alimentos) {
  const n = porId.get(a.id)
  if (!n || n.kcal === '') continue // sem energia analisada
  saida.push([Number(a.id), a.name.trim(), Number(a.categoryId), Math.round(Number(n.kcal)), num(n.protein), num(n.carbohydrates), num(n.lipids), num(n.dietaryFiber)])
}
const COMPLEMENTOS = [
  [9001, 'Leite, de vaca, integral (líquido)', 7, 61, 3.2, 4.6, 3.3, 0, 1],
  [9002, 'Leite, de vaca, semidesnatado (líquido)', 7, 46, 3.2, 4.7, 1.6, 0, 1],
  [9003, 'Leite, de vaca, desnatado (líquido)', 7, 35, 3.4, 4.9, 0.2, 0, 1],
  [9004, 'Macarrão, trigo, cozido', 1, 158, 5.8, 30.9, 0.9, 1.8, 1],
]
saida.push(...COMPLEMENTOS)
const json = { fonte: 'TACO 4ª edição (NEPA/UNICAMP)', categorias: Object.fromEntries(categorias.map(c => [c.id, c.name])), alimentos: saida }
await writeFile(new URL('../src/data/taco.json', import.meta.url), JSON.stringify(json))
console.log(`taco.json: ${saida.length} alimentos`)
