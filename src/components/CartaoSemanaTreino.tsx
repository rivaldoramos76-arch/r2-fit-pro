import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, Split, CalendarPlus, Undo2 } from 'lucide-react'
import EditorDiasSemana from './treino/EditorDiasSemana'
import { agendarAvisosSemana, carregarSemana, marcarConcluido, salvarAjuste, type Semana } from '../lib/semana'
import {
  ajustesDaSemana, aplicarSemana, dataComDia, desfazerAjuste, diasLivres, encaixar, encaixeDeHoje, opcoesEncaixe,
  planejarDivisao, temDiasDaSemana, treinosPerdidos, type Divisao,
} from '../lib/semanaBase'

const CHAVE_DEPOIS = 'r2-dias-semana-depois'
const lerDepois = (id: string) => { try { return localStorage.getItem(CHAVE_DEPOIS) === id } catch { return false } }

/**
 * Início: semana de treino.
 *  - primeira vez: pergunta os dias da semana de treino;
 *  - treino que ficou para trás: marcar como concluído, dividir (nesta semana, ou nesta e na próxima) ou encaixar
 *    num dia livre. A divisão mostra o planejamento antes de gravar. Mesmo volume, temporário; o plano não muda;
 *  - "Semana ajustada · desfazer" e o treino encaixado de hoje.
 */
export default function CartaoSemanaTreino({ userId }: { userId: string }) {
  const [semana, setSemana] = useState<Semana | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [escolhendoDia, setEscolhendoDia] = useState(false)
  const [previa, setPrevia] = useState<Divisao | null>(null)
  const [depois, setDepois] = useState(false)

  useEffect(() => {
    carregarSemana(userId).then(s => { setSemana(s); if (s) setDepois(lerDepois(s.treino.id)) }).catch(() => {})
  }, [userId])
  if (!semana) return null

  const { treino, hoje, feitos, hojeFeito } = semana
  const plano = treino.plano

  async function aplicar(fazer: () => Promise<Semana>, msg: string) {
    setOcupado(true); setErro('')
    try {
      const nova = await fazer()
      setSemana(nova); setAviso(msg); setEscolhendoDia(false); setPrevia(null)
      agendarAvisosSemana(nova).catch(() => {})
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  const comPlano = async (novo: typeof plano) => ({ ...semana!, treino: await salvarAjuste(treino, novo) })

  // Primeira vez: dias da semana
  if (!temDiasDaSemana(plano)) {
    if (depois) return null
    return (
      <section aria-label="Dias de treino" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-fade-up">
        <h2 className="font-bold text-zinc-50 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-green-400" />Em quais dias você treina?</h2>
        <p className="text-sm text-zinc-400 mt-1 mb-3">Com os dias, o app percebe quando um treino ficou para trás e ajuda a encaixar no resto da semana.</p>
        <EditorDiasSemana plano={plano} salvando={ocupado} textoCancelar="Agora não"
          onCancelar={() => { try { localStorage.setItem(CHAVE_DEPOIS, treino.id) } catch { /* ignore */ } setDepois(true) }}
          onSalvar={dias => aplicar(() => comPlano(aplicarSemana(plano, dias)), 'Dias salvos. Se faltar um treino, eu aviso aqui.')} />
        {erro && <p role="alert" className="text-sm text-red-400 mt-2">{erro}</p>}
      </section>
    )
  }

  const perdidos = treinosPerdidos(plano, hoje, feitos)
  const perdido = perdidos[0]
  const ajustes = ajustesDaSemana(plano, hoje)
  const encaixeHoje = !hojeFeito ? encaixeDeHoje(plano, hoje) : undefined
  const idxEncaixe = encaixeHoje ? plano.dias.findIndex(d => d.letra === encaixeHoje.letra) : -1
  if (!perdido && !ajustes.length && !aviso) return null

  const livres = diasLivres(plano, hoje)
  const div1 = perdido ? planejarDivisao(plano, perdido, hoje, hojeFeito, 1) : null
  const div2 = perdido ? planejarDivisao(plano, perdido, hoje, hojeFeito, 2) : null
  // sugere a que termina mais cedo, se não pesa; senão a de duas semanas
  const sugerida = div1 && !div1.alertas.length ? 1 : div2 ? 2 : 1
  const foco = (letra: string) => plano.dias.find(d => d.letra === letra)?.foco

  return (
    <section aria-label="Semana de treino" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3 animate-fade-up">
      {perdido && (
        <div>
          <h2 className="font-bold text-zinc-50 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-amber-400" />Ficou faltando o treino {perdido.letra}</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Era {dataComDia(perdido.data)}{foco(perdido.letra) ? ` · ${foco(perdido.letra)}` : ''}.
            {perdidos.length > 1 && ` Mais ${perdidos.length - 1} ${perdidos.length === 2 ? 'treino ficou' : 'treinos ficaram'} para trás; os de grupos maiores vêm primeiro.`}
          </p>
          <div className="flex flex-col gap-2 mt-3">
            <button type="button" disabled={ocupado} onClick={() => aplicar(async () => {
              await marcarConcluido(userId, treino, perdido)
              return { ...semana, feitos: [...feitos, perdido.diaIdx] }
            }, `Treino ${perdido.letra} marcado como concluído.`)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-100 border border-zinc-700 disabled:opacity-50">
              <Check className="w-4 h-4 text-green-400" />Marcar como concluído
            </button>
            {([[1, div1, 'Dividir no restante desta semana', 'Não tem outro treino até domingo'],
              [2, div2, 'Dividir nesta semana e na próxima', 'Não tem outro treino nas duas semanas']] as const).map(([n, d, rotulo, sem]) => (
              <button key={n} type="button" disabled={ocupado || !d} aria-pressed={previa?.semanas === n} onClick={() => { setPrevia(x => (x?.semanas === n ? null : d)); setEscolhendoDia(false) }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 ${previa?.semanas === n ? 'bg-green-500/10 border-green-500/40 text-zinc-100' : 'bg-zinc-800 border-zinc-700 text-zinc-100'}`}>
                <Split className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-left flex-1">{rotulo}
                  {!d && <span className="block text-xs font-normal text-zinc-500">{sem}</span>}
                  {d && d.alertas.length > 0 && <span className="block text-xs font-normal text-amber-400">Fica puxado em algum dia</span>}
                </span>
                {d && n === sugerida && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500 text-zinc-950">sugerido</span>}
              </button>
            ))}
            {previa && (
              <div role="group" aria-label="Planejamento da divisão" className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-2">
                <p className="text-xs text-zinc-400">O treino {perdido.letra} separado por músculo, sem pesar nenhum dia e sem o mesmo grupo em dias seguidos:</p>
                <ul className="flex flex-col gap-1.5">
                  {previa.destinos.map(d => (
                    <li key={d.data} className="text-sm">
                      <span className="font-semibold text-zinc-100">{dataComDia(d.data)} · Treino {d.letra}</span>
                      <span className="text-zinc-500"> (+{d.series} séries)</span>
                      <span className="block text-xs text-zinc-400">{d.exercicios.map(e => `${e.nome} ${e.series}×`).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
                {previa.alertas.map(a => <p key={a} className="text-xs text-amber-400">⚠ {a}</p>)}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPrevia(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">Voltar</button>
                  <button type="button" disabled={ocupado} onClick={() => aplicar(() => comPlano(previa.plano),
                    `Treino ${perdido.letra} dividido em ${previa.destinos.length} ${previa.destinos.length === 1 ? 'treino' : 'treinos'} até ${dataComDia(previa.ate)}.`)}
                    className="flex-1 py-2 rounded-lg text-sm font-bold bg-green-500 text-zinc-950 disabled:opacity-50">Confirmar divisão</button>
                </div>
              </div>
            )}
            <button type="button" disabled={ocupado || !livres.length} aria-expanded={escolhendoDia} onClick={() => { setEscolhendoDia(x => !x); setPrevia(null) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-100 border border-zinc-700 disabled:opacity-50">
              <CalendarPlus className="w-4 h-4 text-green-400" /><span className="text-left">Encaixar num dia livre{!livres.length && <span className="block text-xs font-normal text-zinc-500">Não tem dia livre até domingo</span>}</span>
            </button>
            {escolhendoDia && (
              <div role="group" aria-label="Dias livres" className="flex flex-wrap gap-2 pl-1">
                {opcoesEncaixe(plano, perdido, hoje).map(({ data: d, colado, semDescanso }) => (
                  <button key={d} type="button" disabled={ocupado}
                    onClick={() => aplicar(() => comPlano(encaixar(plano, perdido, d, hoje)),
                      `Treino ${perdido.letra} encaixado ${d === hoje ? 'hoje' : `em ${dataComDia(d)}`}.${semDescanso ? ' Atenção: ficou sem dia de descanso até domingo.' : ''}`)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold text-left disabled:opacity-50 ${colado.length || semDescanso ? 'bg-zinc-800 text-zinc-200 border border-amber-500/40' : 'bg-green-500 text-zinc-950'}`}>
                    {d === hoje ? 'Hoje' : dataComDia(d)}
                    {colado.length > 0 && <span className="block text-[10px] font-normal text-amber-400">{colado.join(' e ')} em dias seguidos</span>}
                    {semDescanso && <span className="block text-[10px] font-normal text-amber-400">fica sem descanso até domingo</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-2">Sem mudar o volume e só por um tempo: o plano continua o mesmo.</p>
        </div>
      )}

      {aviso && <p role="status" className="text-sm text-green-400">{aviso}</p>}
      {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}

      {encaixeHoje && idxEncaixe >= 0 && (
        <Link to={`/treino/${treino.id}/dia/${idxEncaixe}`} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30">
          <span className="text-sm text-zinc-100">Hoje: treino {encaixeHoje.letra} encaixado</span>
          <span className="text-xs font-bold text-green-400">Começar →</span>
        </Link>
      )}

      {ajustes.length > 0 && (
        <div className={perdido ? 'pt-3 border-t border-zinc-800' : ''}>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Semana ajustada</p>
          <ul className="flex flex-col gap-1 mt-1">
            {ajustes.map(a => (
              <li key={`${a.tipo}-${a.origem}`} className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="flex-1 min-w-0">
                  Treino {a.letra} de {dataComDia(a.origem)}: {a.tipo === 'dividido' ? `dividido até ${dataComDia(a.ate)}` : `encaixado ${a.data === hoje ? 'hoje' : `em ${dataComDia(a.data!)}`}`}
                </span>
                <button type="button" disabled={ocupado} onClick={() => aplicar(() => comPlano(desfazerAjuste(plano, a.origem)), `Ajuste do treino ${a.letra} desfeito.`)}
                  aria-label={`Desfazer ajuste do treino ${a.letra}`} className="flex items-center gap-1 text-xs font-semibold text-amber-400 disabled:opacity-50">
                  <Undo2 className="w-3.5 h-3.5" />desfazer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
