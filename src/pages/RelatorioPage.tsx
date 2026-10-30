import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ChevronLeft, ChevronRight, Flame, Droplet, Scale, Dumbbell, Trophy, Utensils } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMeta } from '../lib/nutricao'
import { dadosDaSemana } from '../lib/receitasApi'
import { inicioSemana, resumoSemana } from '../lib/relatorio'
import { hojeLocal, somarDias } from '../lib/diario'
import { metaAguaSugerida } from '../lib/exercicios'
import { Spinner } from '../components/UI'
import { BarraMacro, fmt } from '../components/nutricao/Graficos'
import CompartilharCartao from '../components/CompartilharCartao'
import { cartaoSemana } from '../lib/cartoesBase'

const DIA_CURTO = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const dataBR = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const diaSemana = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const nome = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' }); return nome.charAt(0).toUpperCase() + nome.slice(1) }

type Resumo = ReturnType<typeof resumoSemana>

/** Barras de calorias por dia com a linha da meta (animadas). */
function GraficoSemana({ dias, meta }: { dias: Resumo['dias']; meta: number | null }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setMontado(true)); return () => cancelAnimationFrame(r) }, [])
  const maximo = Math.max(meta ?? 0, ...dias.map(d => d.calorias), 1) * 1.1
  const hoje = hojeLocal()
  return (
    <div className="mt-4" role="img" aria-label={`Calorias por dia: ${dias.map((d, i) => `${DIA_CURTO[i]} ${d.calorias}`).join(', ')}`}>
      <div className="relative h-36 flex items-end gap-2">
        {meta && (
          <div className="absolute left-0 right-0 border-t border-dashed border-lime-400/70 pointer-events-none z-10" style={{ bottom: `${(meta / maximo) * 100}%` }}>
            <span className="absolute -top-4 right-0 text-[10px] text-lime-400 bg-zinc-900 pl-1">meta {fmt(meta)}</span>
          </div>
        )}
        {dias.map((d, i) => {
          const passou = d.metaDia !== null && d.calorias > d.metaDia
          const altura = Math.max(d.registrou ? 4 : 2, (d.calorias / maximo) * 100)
          return (
            <div key={d.data} className="relative flex-1 h-full flex items-end">
              <div className={`w-full rounded-t-lg ${!d.registrou ? 'bg-zinc-800' : passou ? 'bg-amber-400' : 'bg-gradient-to-t from-green-600 to-green-400'}`}
                style={{ height: montado ? `${altura}%` : '0%', transition: `height 0.8s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms` }} />
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 mt-1.5">
        {dias.map((d, i) => (
          <div key={d.data} className="flex-1 text-center">
            <p className={`text-[11px] ${d.data === hoje ? 'text-green-400 font-semibold' : 'text-zinc-500'}`}>{DIA_CURTO[i]}</p>
            <p className="text-[10px] tabular-nums text-zinc-400">{d.calorias ? fmt(d.calorias) : '·'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Indicador({ icone, titulo, valor, detalhe, cor }: { icone: React.ReactNode; titulo: string; valor: string; detalhe?: string; cor: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5">
      <p className="text-xs text-zinc-500 flex items-center gap-1.5">{icone}{titulo}</p>
      <p className={`text-xl font-bold tabular-nums mt-1 ${cor}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-zinc-500 mt-0.5">{detalhe}</p>}
    </div>
  )
}

export default function RelatorioPage() {
  const { user } = useAuth()
  const { meta, carregando: carregandoMeta } = useMeta(user?.id)
  const [inicio, setInicio] = useState(() => inicioSemana(hojeLocal()))
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const fim = somarDias(inicio, 6)
  const semanaAtual = inicio === inicioSemana(hojeLocal())
  const cartao = useMemo(() => resumo && resumo.diasRegistrados > 0 ? cartaoSemana({
    diasRegistrados: resumo.diasRegistrados, diasNaMeta: resumo.diasNaMeta, mediaCalorias: resumo.mediaCalorias,
    treinos: resumo.treinosConcluidos, variacaoPeso: resumo.peso?.variacao ?? null,
  }) : null, [resumo])

  useEffect(() => {
    if (!user || carregandoMeta) return
    setResumo(null)
    dadosDaSemana(user.id, inicio, fim).then(d => setResumo(resumoSemana({
      inicio, ...d,
      meta: meta ? {
        calorias: meta.calorias, proteina_g: meta.proteina_g, carboidrato_g: meta.carboidrato_g, gordura_g: meta.gordura_g,
        agua_ml: meta.meta_agua_ml ?? metaAguaSugerida(meta.peso_kg), somar_exercicio: meta.somar_exercicio,
      } : null,
    }))).catch(() => setResumo(resumoSemana({ inicio, alimentos: [], agua: [], exercicios: [], pesos: [], treinosConcluidos: 0, meta: null })))
  }, [user, inicio, fim, meta, carregandoMeta])

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-green-400" />Relatório da semana</h1>
        <div className="mt-2 flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-1 py-1">
          <button onClick={() => setInicio(i => somarDias(i, -7))} aria-label="Semana anterior" className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronLeft className="w-5 h-5" /></button>
          <span className="text-sm font-semibold text-zinc-200">{semanaAtual ? 'Esta semana' : 'Semana'} · {dataBR(inicio)} a {dataBR(fim)}</span>
          <button onClick={() => setInicio(i => somarDias(i, 7))} disabled={semanaAtual} aria-label="Próxima semana" className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      {!resumo ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <>
          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-fade-up" aria-label="Calorias da semana">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-zinc-500">Média por dia registrado</p>
                <p className="text-3xl font-bold tabular-nums text-zinc-50">{fmt(resumo.mediaCalorias)} <span className="text-base font-medium text-zinc-400">kcal</span></p>
              </div>
              {resumo.diasNaMeta !== null && (
                <p className="text-right text-xs text-zinc-500">Dias na meta<span className="block text-xl font-bold text-green-400 tabular-nums">{resumo.diasNaMeta}/{resumo.diasRegistrados || 0}</span></p>
              )}
            </div>
            <GraficoSemana dias={resumo.dias} meta={meta?.calorias ?? null} />
            <p className="text-[11px] text-zinc-500 mt-2">Na meta = entre 80% e 100% das calorias do dia. {resumo.diasRegistrados < 7 ? `Você registrou ${resumo.diasRegistrados} de 7 dias.` : 'Você registrou todos os dias! 🎉'}</p>
          </section>

          {meta && resumo.diasRegistrados > 0 && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-fade-up" style={{ animationDelay: '60ms' }} aria-label="Macros médios">
              <h2 className="font-bold text-zinc-50 mb-3">Macros médios por dia</h2>
              <div className="flex gap-4">
                <BarraMacro rotulo="Carbo" atual={resumo.macrosMedios.carboidrato_g} meta={meta.carboidrato_g} cor="carboidrato" />
                <BarraMacro rotulo="Proteína" atual={resumo.macrosMedios.proteina_g} meta={meta.proteina_g} cor="proteina" />
                <BarraMacro rotulo="Gordura" atual={resumo.macrosMedios.gordura_g} meta={meta.gordura_g} cor="gordura" />
              </div>
            </section>
          )}

          <div className="grid grid-cols-2 gap-2 animate-fade-up" style={{ animationDelay: '120ms' }}>
            <Indicador icone={<Droplet className="w-3.5 h-3.5 text-sky-400" />} titulo="Água por dia" valor={resumo.aguaMedia ? `${fmt(resumo.aguaMedia)} ml` : '—'}
              detalhe={resumo.diasMetaAgua !== null ? `meta batida em ${resumo.diasMetaAgua} dia(s)` : undefined} cor="text-sky-300" />
            <Indicador icone={<Flame className="w-3.5 h-3.5 text-orange-400" />} titulo="Exercício" valor={`${fmt(resumo.exercicio.calorias)} kcal`}
              detalhe={resumo.exercicio.sessoes ? `${resumo.exercicio.sessoes} vez(es) · ${fmt(resumo.exercicio.minutos)} min` : 'nenhum registrado'} cor="text-orange-300" />
            <Indicador icone={<Scale className="w-3.5 h-3.5 text-green-400" />} titulo="Peso" valor={resumo.peso ? `${resumo.peso.atual.toLocaleString('pt-BR')} kg` : '—'}
              detalhe={resumo.peso?.variacao != null ? `${resumo.peso.variacao > 0 ? '+' : ''}${resumo.peso.variacao.toLocaleString('pt-BR')} kg na semana` : 'registre seu peso'} cor="text-zinc-100" />
            <Indicador icone={<Dumbbell className="w-3.5 h-3.5 text-green-400" />} titulo="Treinos concluídos" valor={String(resumo.treinosConcluidos)} cor="text-zinc-100" />
          </div>

          {(resumo.melhorDia || resumo.alimentoMaisRegistrado) && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3 animate-fade-up" style={{ animationDelay: '180ms' }} aria-label="Destaques">
              <h2 className="font-bold text-zinc-50">Destaques</h2>
              {resumo.melhorDia && <p className="text-sm text-zinc-300 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400 shrink-0" />Dia mais perto da meta: <b>{diaSemana(resumo.melhorDia)}</b></p>}
              {resumo.alimentoMaisRegistrado && <p className="text-sm text-zinc-300 flex items-center gap-2"><Utensils className="w-4 h-4 text-green-400 shrink-0" />Mais registrado: <b>{resumo.alimentoMaisRegistrado.nome}</b> ({resumo.alimentoMaisRegistrado.vezes}×)</p>}
            </section>
          )}

          {cartao && <CompartilharCartao cartao={cartao} rotulo="Compartilhar minha semana" className="w-full animate-fade-up" />}

          {resumo.diasRegistrados === 0 && (
            <div className="text-center text-sm text-zinc-400 py-4">Nenhum alimento registrado nesta semana. <Link to="/calorias" className="text-green-400 font-semibold">Abrir o diário →</Link></div>
          )}
        </>
      )}
    </div>
  )
}
