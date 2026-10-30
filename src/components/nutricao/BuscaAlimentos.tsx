import { useEffect, useMemo, useRef, useState } from 'react'
import { ScanBarcode, FileImage, Sparkles, Plus, ChevronRight, Database } from 'lucide-react'
import { carregarTaco, buscarBase, medidasDe, paraAlimento, semAcento } from '../../lib/alimentosBase'
import type { ItemBase } from '../../lib/alimentosBase'
import { buscarNoBanco, buscarCodigoNoBanco, salvarNoBanco } from '../../lib/bancoAlimentos'
import { produtoPorCodigo, buscarProdutos } from '../../lib/openFoodFacts'
import { estimarAlimentoBase, lerTabelaNutricional } from '../../lib/foodAI'
import type { EstimativaBase } from '../../lib/foodAI'
import { redimensionarImagem } from '../../lib/imagem'
import { Button, Input, Spinner } from '../UI'
import { fmt } from './Graficos'
import LeitorCodigo from './LeitorCodigo'

const ROTULO_FONTE: Record<ItemBase['fonte'], string> = { taco: 'TACO', off: 'Produto', ia: 'IA', rotulo: 'Rótulo', receita: 'Receita' }

/** Guarda no banco compartilhado sem travar a pessoa se falhar (ex.: limite diário). */
async function guardar(item: Omit<ItemBase, 'id' | 'detalhe'>, fallback: ItemBase): Promise<ItemBase> {
  try { return await salvarNoBanco(item) } catch { return fallback }
}

const deEstimativa = (e: EstimativaBase, fonte: 'ia' | 'rotulo', codigo?: string): ItemBase => ({
  id: `novo-${fonte}-${codigo ?? e.nome}`, nome: e.nome, fonte, codigo,
  detalhe: fonte === 'ia' ? 'Estimado pela IA' : 'Tabela nutricional',
  kcal: e.kcal, proteina: e.proteina, carboidrato: e.carboidrato, gordura: e.gordura,
  porcaoG: e.porcao_g, porcaoRotulo: e.porcao_rotulo,
})

/** Resultados da busca (TACO + banco compartilhado + Open Food Facts), código de barras,
 *  foto da tabela nutricional e estimativa pela IA quando nada for encontrado. */
export default function BuscaAlimentos({ q, onAbrir, onAdicionarRapido }: {
  q: string; onAbrir: (item: ItemBase) => void; onAdicionarRapido: (item: ItemBase) => void
}) {
  const [taco, setTaco] = useState<ItemBase[] | null>(null)
  const [banco, setBanco] = useState<ItemBase[]>([])
  const [produtos, setProdutos] = useState<ItemBase[]>([])
  const [buscandoProdutos, setBuscandoProdutos] = useState(false)
  const [leitor, setLeitor] = useState(false)
  const [codigo, setCodigo] = useState<null | { valor: string; estado: 'buscando' | 'nao_achou' }>(null)
  const [nomeProduto, setNomeProduto] = useState('')
  const [trabalhando, setTrabalhando] = useState<'' | 'ia' | 'rotulo'>('')
  const [erro, setErro] = useState('')
  const fotoRotulo = useRef<HTMLInputElement>(null)
  const termo = q.trim()

  useEffect(() => { carregarTaco().then(setTaco) }, [])

  // Banco compartilhado (rápido) e Open Food Facts (só com a pessoa parada de digitar)
  useEffect(() => {
    setErro('')
    if (termo.length < 2) { setBanco([]); setProdutos([]); return }
    let vivo = true
    const t1 = setTimeout(() => { buscarNoBanco(termo).then(r => vivo && setBanco(r)).catch(() => {}) }, 300)
    const ctl = new AbortController()
    const t2 = setTimeout(() => {
      if (termo.length < 3) return
      setBuscandoProdutos(true)
      buscarProdutos(termo, ctl.signal).then(r => vivo && setProdutos(r)).catch(() => {}).finally(() => vivo && setBuscandoProdutos(false))
    }, 900)
    return () => { vivo = false; clearTimeout(t1); clearTimeout(t2); ctl.abort() }
  }, [termo])

  const resultados = useMemo(() => {
    if (!termo || !taco) return []
    const vistos = new Set<string>()
    const lista: ItemBase[] = []
    for (const item of [...buscarBase(banco, termo, 15), ...buscarBase(taco, termo, 30), ...buscarBase(produtos, termo, 15)]) {
      const k = semAcento(item.nome) + '|' + (item.codigo ?? '')
      if (vistos.has(k)) continue
      vistos.add(k); lista.push(item)
    }
    return lista
  }, [termo, taco, banco, produtos])

  const lerCodigo = async (c: string) => {
    setLeitor(false); setErro('')
    setCodigo({ valor: c, estado: 'buscando' })
    try {
      const salvo = await buscarCodigoNoBanco(c)
      if (salvo) { setCodigo(null); onAbrir(salvo); return }
      const off = await produtoPorCodigo(c).catch(() => null)
      if (off) { setCodigo(null); onAbrir(await guardar(off, off)); return }
      setCodigo({ valor: c, estado: 'nao_achou' })
    } catch {
      setCodigo({ valor: c, estado: 'nao_achou' })
    }
  }

  const calcularComIA = async () => {
    setErro(''); setTrabalhando('ia')
    try {
      const e = await estimarAlimentoBase(termo)
      const item = deEstimativa(e, 'ia')
      onAbrir(await guardar(item, item))
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível calcular') }
    finally { setTrabalhando('') }
  }

  const lerRotulo = async (file: File) => {
    setErro(''); setTrabalhando('rotulo')
    try {
      const img = await redimensionarImagem(file, 1600, 0.85)
      const e = await lerTabelaNutricional(img, nomeProduto.trim() || termo)
      if (nomeProduto.trim()) e.nome = nomeProduto.trim()
      const item = deEstimativa(e, 'rotulo', codigo?.valor)
      setCodigo(null)
      onAbrir(await guardar(item, item))
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível ler a tabela') }
    finally { setTrabalhando(''); if (fotoRotulo.current) fotoRotulo.current.value = '' }
  }

  return (
    <div>
      <input ref={fotoRotulo} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && lerRotulo(e.target.files[0])} />
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button type="button" onClick={() => setLeitor(true)} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 py-2.5 text-sm font-semibold text-zinc-100 hover:border-green-500/50 active:scale-[0.98] transition">
          <ScanBarcode className="w-4 h-4 text-green-400" />Código de barras
        </button>
        <button type="button" onClick={() => fotoRotulo.current?.click()} disabled={!!trabalhando} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 py-2.5 text-sm font-semibold text-zinc-100 hover:border-green-500/50 active:scale-[0.98] transition">
          {trabalhando === 'rotulo' ? <Spinner size="sm" /> : <FileImage className="w-4 h-4 text-green-400" />}Foto do rótulo
        </button>
      </div>

      {codigo && (
        <div className="mt-3 rounded-2xl border border-zinc-700 bg-zinc-800/40 p-3.5 animate-fade-up" role="status">
          {codigo.estado === 'buscando'
            ? <p className="flex items-center gap-2 text-sm text-zinc-300"><Spinner size="sm" />Procurando o produto {codigo.valor}…</p>
            : <>
                <p className="text-sm font-semibold text-zinc-100">Produto {codigo.valor} ainda não está na base</p>
                <p className="text-xs text-zinc-400 mt-1">Fotografe a tabela nutricional da embalagem: a IA lê e o produto fica salvo para as próximas vezes.</p>
                <Input label="Nome do produto (opcional)" value={nomeProduto} onChange={e => setNomeProduto(e.target.value)} placeholder="Ex.: Iogurte grego natural" className="mt-1" />
                <div className="flex gap-2 mt-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setCodigo(null)}>Cancelar</Button>
                  <Button className="flex-[2]" loading={trabalhando === 'rotulo'} onClick={() => fotoRotulo.current?.click()}><FileImage className="w-4 h-4" />Fotografar tabela</Button>
                </div>
              </>}
        </div>
      )}

      {termo && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-1 flex items-center gap-1.5"><Database className="w-3.5 h-3.5" />Tabela de alimentos</p>
          {taco === null ? <div className="flex justify-center py-6"><Spinner /></div> : (
            <ul className="flex flex-col gap-2">
              {resultados.map((item, idx) => {
                const m = medidasDe(item)[0]
                const porcao = paraAlimento(item, m)
                return (
                  <li key={item.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx, 10) * 25}ms` }}>
                    <div className="flex items-center gap-1 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 rounded-2xl pr-1.5 transition">
                      <button type="button" onClick={() => onAbrir(item)} className="flex-1 min-w-0 text-left pl-3.5 py-2">
                        <span className="block text-sm font-semibold text-zinc-100 truncate">{item.nome}</span>
                        <span className="flex items-center gap-1 text-xs text-zinc-500 min-w-0">
                          <span className="shrink-0 rounded bg-zinc-700/60 px-1 text-[10px] font-semibold text-zinc-300">{ROTULO_FONTE[item.fonte]}</span>
                          <span className="truncate">{fmt(porcao.calorias)} kcal · {porcao.quantidade}</span><ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        </span>
                      </button>
                      <button type="button" aria-label={`Adicionar ${item.nome}`} onClick={() => onAdicionarRapido(item)}
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-green-500/15 text-green-400 hover:bg-green-500/25 transition active:scale-90"><Plus className="w-5 h-5" /></button>
                    </div>
                  </li>
                )
              })}
              {buscandoProdutos && <li className="flex items-center gap-2 text-xs text-zinc-500 px-1 py-1"><Spinner size="sm" />Procurando produtos industrializados…</li>}
              {!buscandoProdutos && resultados.length === 0 && <li className="text-sm text-zinc-400 px-1 py-2">Nada encontrado na tabela para "{termo}".</li>}
              <li>
                <button type="button" onClick={calcularComIA} disabled={trabalhando === 'ia'}
                  className="w-full flex items-center gap-2 justify-center rounded-2xl border border-dashed border-zinc-700 py-3 text-sm font-semibold text-green-400 hover:border-green-500/50 disabled:opacity-60">
                  {trabalhando === 'ia' ? <Spinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                  {resultados.length ? 'Não achou? ' : ''}Calcular "{termo}" com IA
                </button>
                <p className="text-[11px] text-zinc-500 text-center mt-1.5">O alimento calculado fica salvo na tabela para as próximas buscas.</p>
              </li>
            </ul>
          )}
          <p className="text-[10px] text-zinc-600 mt-3 px-1">Fontes: TACO 4ª ed. (NEPA/UNICAMP) e Open Food Facts (licença ODbL).</p>
        </div>
      )}
      {erro && <p className="mt-3 text-sm text-red-400" role="alert">{erro}</p>}
      {leitor && <LeitorCodigo onCodigo={lerCodigo} onClose={() => setLeitor(false)} />}
    </div>
  )
}
