import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, Split, CalendarPlus, Undo2 } from 'lucide-react'
import EditorDiasSemana from './treino/EditorDiasSemana'
import { agendarAvisosSemana, carregarSemana, marcarConcluido, salvarAjuste, type Semana } from '../lib/semana'
import {
  ajustesDaSemana, aplicarSemana, dataComDia, desfazerAjuste, diasDeTreinoRestantes, diasLivres, dividirNaSemana,
  encaixar, encaixeDeHoje, opcoesEncaixe, podeDividir, temDiasDaSemana, treinosPerdidos,
} from '../lib/semanaBase'

const CHAVE_DEPOIS = 'r2-dias-semana-depois'
const lerDepois = (id: string) => { try { return localStorage.getItem(CHAVE_DEPOIS) === id } catch { return false } }

/**
 * Início: semana de treino.
 *  - primeira vez: pergunta os dias da semana de treino;
 *  - treino que ficou para trás: marcar como concluído, dividir no restante da semana ou encaixar num dia livre
 *    (o mesmo volume, só até domingo; o plano não muda);
 *  - "Semana ajustada · desfazer" e o treino encaixado de hoje.
 */
export default function CartaoSemanaTreino({ userId }: { userId: string }) {
  const [semana, setSemana] = useState<Semana | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [escolhendoDia, setEscolhendoDia] = useState(false)
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
      setSemana(nova); setAviso(msg); setEscolhendoDia(false)
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
  const dividir = perdido && podeDividir(plano, perdido, hoje, hojeFeito)
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
            <button type="button" disabled={ocupado || !dividir} onClick={() => aplicar(() => comPlano(dividirNaSemana(plano, perdido, hoje, hojeFeito)),
              `Exercícios do treino ${perdido.letra} divididos em: ${[...new Set(diasDeTreinoRestantes(plano, hoje, hojeFeito).filter(a => a.diaIdx !== perdido.diaIdx).map(a => `${dataComDia(a.data).split(',')[0]} (${a.letra})`))].join(', ')}.`)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-100 border border-zinc-700 disabled:opacity-50">
              <Split className="w-4 h-4 text-green-400" /><span className="text-left">Dividir esse treino no restante da semana{!dividir && <span className="block text-xs font-normal text-zinc-500">Não tem outro treino até domingo</span>}</span>
            </button>
            <button type="button" disabled={ocupado || !livres.length} aria-expanded={escolhendoDia} onClick={() => setEscolhendoDia(x => !x)}
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
          <p className="text-xs text-zinc-500 mt-2">Sem mudar o volume; vale só até domingo. O plano continua o mesmo.</p>
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
                  Treino {a.letra} de {dataComDia(a.origem).split(',')[0]}: {a.tipo === 'dividido' ? 'dividido na semana' : `encaixado ${a.data === hoje ? 'hoje' : `em ${dataComDia(a.data!)}`}`}
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
