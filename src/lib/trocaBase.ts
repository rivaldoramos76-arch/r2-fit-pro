// Trocar exercício (aparelho ocupado, dor, falta de equipamento): alternativas do catálogo que treinam o mesmo músculo.
import { CATALOGO, GRUPOS, type Equipamento, type ExercicioCatalogo, type GrupoMuscular } from '../data/exercicios'
import { encontrarPorNome, normalizar } from './busca'
import type { ExercicioPlano } from './treinoModel'

const GRUPO_POR_NOME = new Map((Object.keys(GRUPOS) as GrupoMuscular[]).map(g => [normalizar(GRUPOS[g]), g]))

/** Exercício do catálogo correspondente (pelo id ou pelo nome). */
export const doCatalogo = (ex: Pick<ExercicioPlano, 'catalogo_id' | 'nome'>) =>
  (ex.catalogo_id ? CATALOGO.find(c => c.id === ex.catalogo_id) : undefined) ?? encontrarPorNome(ex.nome)

/**
 * Até `limite` alternativas para o mesmo músculo principal, das mais parecidas para as menos:
 * mesmo tipo de movimento (composto/isolado), equipamento disponível no plano, mesmos músculos secundários
 * e nível parecido. Equipamento diferente do atual vem antes (quem troca geralmente não tem aquele aparelho livre).
 */
export function alternativas(ex: ExercicioPlano, equipamentos: Equipamento[], limite = 10): ExercicioCatalogo[] {
  if (ex.tipo === 'cardio') return []
  const atual = doCatalogo(ex)
  const grupo = atual?.grupo ?? GRUPO_POR_NOME.get(normalizar(ex.grupos_musculares?.[0] ?? ''))
  if (!grupo) return []
  const nivel = { iniciante: 0, intermediario: 1, avancado: 2 }
  return CATALOGO.filter(c => c.grupo === grupo && c.id !== atual?.id && normalizar(c.nome) !== normalizar(ex.nome))
    .map(c => {
      let p = 0
      if (atual && c.tipo !== atual.tipo) p += 3
      if (equipamentos.length && !equipamentos.includes(c.equipamento)) p += 4
      if (atual && c.equipamento === atual.equipamento) p += 1
      if (atual) p += Math.abs(nivel[c.nivel] - nivel[atual.nivel]) * 0.5 - c.secundarios.filter(g => atual.secundarios.includes(g)).length * 0.5
      return { c, p }
    })
    .sort((a, b) => a.p - b.p || CATALOGO.indexOf(a.c) - CATALOGO.indexOf(b.c))
    .slice(0, limite)
    .map(x => x.c)
}

/** O novo exercício no lugar do antigo: mantém séries, repetições e tempos; a carga recomeça (aparelho diferente). */
export function trocarPor(ex: ExercicioPlano, c: ExercicioCatalogo, novoId: string): ExercicioPlano {
  return {
    ...ex,
    id: novoId,
    catalogo_id: c.id,
    nome: c.nome,
    grupos_musculares: [GRUPOS[c.grupo], ...c.secundarios.map(g => GRUPOS[g])],
    equipamento: c.equipamento,
    instrucoes: c.instrucoes,
    dica: undefined,
    carga: undefined,
  }
}
