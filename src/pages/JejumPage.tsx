import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timer } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { carregarJejum, salvarJejum } from '../lib/jejum'
import { PROTOCOLOS, duracao, encerrar, situacaoJejum, type DadosJejum } from '../lib/jejumBase'
import { ehAppNativo } from '../lib/nativo'
import { Spinner } from '../components/UI'

const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function JejumPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [d, setD] = useState<DadosJejum | null>(null)
  const [erro, setErro] = useState('')
  const [comecouAs, setComecouAs] = useState('')
  const [, setTick] = useState(0)
  useEffect(() => { if (user) carregarJejum(user.id).then(setD).catch(() => setErro('Não foi possível carregar.')) }, [user])
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30_000); return () => clearInterval(t) }, [])
  if (!user || !d) return <div className="flex justify-center py-16">{erro ? <p className="text-sm text-red-400">{erro}</p> : <Spinner size="lg" />}</div>

  const gravar = (novo: DadosJejum) => { const antes = d; setD(novo); setErro(''); salvarJejum(user.id, novo).catch(e => { setD(antes); setErro((e as Error).message) }) }
  function comecar() {
    let inicio = new Date()
    if (comecouAs) {
      const [h, m] = comecouAs.split(':').map(Number)
      inicio = new Date(); inicio.setHours(h, m, 0, 0)
      if (inicio.getTime() > Date.now()) inicio.setDate(inicio.getDate() - 1) // ex.: 20:00 de ontem
    }
    gravar({ ...d!, ativo: { inicio: inicio.toISOString(), horas: d!.protocolo } })
    setComecouAs('')
  }
  const s = d.ativo ? situacaoJejum(d.ativo) : null
  const R = 88, C = 2 * Math.PI * R

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Jejum intermitente</h1>
          <p className="text-sm text-zinc-500">{ehAppNativo() ? 'O app avisa quando o jejum terminar.' : 'Acompanhe o tempo do seu jejum.'}</p>
        </div>
      </div>

      {s && d.ativo ? (
        <section aria-label="Jejum em andamento" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col items-center gap-3">
          <svg viewBox="0 0 200 200" className="w-52 h-52" role="img" aria-label={`${duracao(s.horas * 3_600_000)} de ${d.ativo.horas} horas`}>
            <circle cx="100" cy="100" r={R} stroke="#27272a" strokeWidth="12" fill="none" />
            <circle cx="100" cy="100" r={R} stroke={s.concluido ? '#22c55e' : '#4ade80'} strokeWidth="12" fill="none" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - s.pct)} transform="rotate(-90 100 100)" />
            <text x="100" y="96" textAnchor="middle" fontSize="34" fontWeight="700" fill="#fafafa">{duracao(s.horas * 3_600_000)}</text>
            <text x="100" y="122" textAnchor="middle" fontSize="13" fill="#a1a1aa">de {d.ativo.horas}h</text>
          </svg>
          <p className="text-sm text-zinc-300 text-center">{s.concluido ? '🎉 Meta do jejum batida!' : `Faltam ${duracao(s.restanteMs)} · termina às ${hora(s.fim)}`}</p>
          <p className="text-xs text-zinc-500">{s.fase}</p>
          <button type="button" onClick={() => gravar(encerrar(d))} className="w-full py-3 rounded-2xl text-sm font-bold bg-green-500 text-zinc-950">Encerrar jejum</button>
          <button type="button" onClick={() => confirm('Cancelar sem registrar?') && gravar({ ...d, ativo: null })} className="text-xs text-zinc-500">Cancelar sem registrar</button>
        </section>
      ) : (
        <section aria-label="Começar jejum" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs text-zinc-400 mb-2">Quantas horas de jejum</p>
            <div role="group" aria-label="Protocolo" className="grid grid-cols-3 gap-2">
              {PROTOCOLOS.map(h => (
                <button key={h} type="button" aria-pressed={d.protocolo === h} onClick={() => setD({ ...d, protocolo: h })}
                  className={`py-2.5 rounded-xl text-sm font-bold border ${d.protocolo === h ? 'bg-green-500/10 border-green-500/40 text-green-400' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}>
                  {h === 24 ? '24h' : `${h}:${24 - h}`}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">Comecei às (opcional)
            <input type="time" value={comecouAs} onChange={e => setComecouAs(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100" aria-label="Horário de início" />
          </label>
          <button type="button" onClick={comecar} className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold bg-green-500 text-zinc-950">
            <Timer className="w-4 h-4" />{comecouAs ? `Registrar jejum desde ${comecouAs}` : 'Começar agora'}
          </button>
        </section>
      )}
      {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}

      {d.historico.length > 0 && (
        <section aria-label="Histórico de jejum" className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <p className="px-4 pt-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Últimos jejuns</p>
          <ul className="divide-y divide-zinc-800/70">
            {d.historico.slice(0, 10).map(h => {
              const ms = Date.parse(h.fim) - Date.parse(h.inicio)
              return (
                <li key={h.inicio} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-zinc-400">{diaHora(h.inicio)}</span>
                  <span className={ms >= h.meta * 3_600_000 ? 'text-green-400 font-semibold' : 'text-zinc-300'}>{duracao(ms)} {ms >= h.meta * 3_600_000 ? '✓' : `de ${h.meta}h`}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <p className="text-[11px] text-zinc-500 leading-relaxed px-1">Jejum não é indicado para gestantes, pessoas com diabetes, histórico de transtorno alimentar ou em uso de alguns remédios. Na dúvida, fale com seu médico ou nutricionista.</p>
    </div>
  )
}
