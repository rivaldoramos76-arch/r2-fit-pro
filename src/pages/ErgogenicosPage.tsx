import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, EyeOff, Eye, ShieldAlert, X, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { carregarRotina, salvarRotina } from '../lib/rotina'
import {
  FORMAS, UNIDADES, MOMENTOS, MAX_ITENS, MAX_VEZES, dataCurta, desfazerVez, diaLocal, ehDeHoje, historicoPorDia, marcarVez,
  normalizarItem, situacao, textoDose, textoIntervalo, textoVez, textoVezes, vezFeita, type ItemRotina, type Momento, type Rotina,
} from '../lib/rotinaBase'
import { ehAppNativo } from '../lib/nativo'
import { Button, Spinner } from '../components/UI'

const CAMPO = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-100 text-base focus:outline-none focus:ring-2 focus:ring-green-500 [color-scheme:dark]'
const INTERVALOS = [1, 2, 3, 7, 14, 30]
const novoId = () => Math.random().toString(36).slice(2, 10)

function Formulario({ inicial, onSalvar, onCancelar }: { inicial: ItemRotina; onSalvar: (i: ItemRotina) => void; onCancelar: () => void }) {
  const [f, setF] = useState({ ...inicial, dose: String(inicial.dose || '').replace('.', ','), intervalo: String(inicial.intervaloDias) })
  const [erro, setErro] = useState('')
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  const mudarVez = (k: number, p: Partial<ItemRotina['vezes'][number]>) => set({ vezes: f.vezes.map((v, i) => (i === k ? { ...v, ...p } : v)) })
  const salvar = () => {
    const item = normalizarItem({ ...f, dose: Number(f.dose.replace(',', '.')), intervaloDias: Number(f.intervalo) })
    if (!item) { setErro('Confira o nome, a dose (maior que zero) e o intervalo (de 1 a 365 dias).'); return }
    onSalvar(item)
  }
  return (
    <section aria-label={inicial.nome ? 'Editar item' : 'Novo item'} className="bg-zinc-900 border border-green-500/30 rounded-2xl p-4 flex flex-col gap-3 animate-fade-up">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-zinc-400">Nome</span>
        <input value={f.nome} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Testosterona, Tirzepatida, Creatina" className={CAMPO} maxLength={60} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-zinc-400">Forma</span>
        <select value={f.forma} onChange={e => set({ forma: e.target.value as ItemRotina['forma'] })} className={CAMPO}>
          {Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-zinc-400">Dose (cada vez)</span>
          <input value={f.dose} onChange={e => set({ dose: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) })} inputMode="decimal" placeholder="Ex.: 250" className={CAMPO} aria-label="Dose" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-zinc-400">Unidade</span>
          <select value={f.unidade} onChange={e => set({ unidade: e.target.value as ItemRotina['unidade'] })} className={CAMPO} aria-label="Unidade">
            {UNIDADES.map(u => <option key={u} value={u}>{u === 'unid' ? 'unidade' : u}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-zinc-400">Intervalo entre os dias de uso</span>
        <div className="flex flex-wrap gap-1.5">
          {INTERVALOS.map(d => (
            <button key={d} type="button" aria-pressed={f.intervalo === String(d)} onClick={() => set({ intervalo: String(d) })}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${f.intervalo === String(d) ? 'bg-green-500 text-zinc-950 border-green-500' : 'border-zinc-700 text-zinc-300'}`}>
              {textoIntervalo(d)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          a cada
          <input value={f.intervalo} onChange={e => set({ intervalo: e.target.value.replace(/\D/g, '').slice(0, 3) })} inputMode="numeric" aria-label="Intervalo em dias"
            className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-center text-zinc-100" />
          dias
        </label>
      </div>
      <div className="flex flex-col gap-1.5" role="group" aria-label="Vezes no dia">
        <span className="text-xs text-zinc-400">Vezes no dia</span>
        {f.vezes.map((v, k) => (
          <div key={k} className="flex items-center gap-2">
            <select value={v.tipo} onChange={e => mudarVez(k, { tipo: e.target.value as Momento })} aria-label={`Quando (${k + 1}ª vez)`}
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-2.5 text-zinc-100 text-sm">
              {Object.entries(MOMENTOS).map(([m, r]) => <option key={m} value={m}>{r}</option>)}
            </select>
            {v.tipo === 'horario' && (
              <input type="time" value={v.horario} onChange={e => e.target.value && mudarVez(k, { horario: e.target.value })} aria-label={`Horário (${k + 1}ª vez)`}
                className="w-28 bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2.5 text-zinc-100 text-sm [color-scheme:dark]" />
            )}
            {f.vezes.length > 1 && (
              <button type="button" onClick={() => set({ vezes: f.vezes.filter((_, i) => i !== k) })} aria-label={`Tirar a ${k + 1}ª vez`} className="p-2 text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>
            )}
          </div>
        ))}
        {f.vezes.length < MAX_VEZES && (
          <button type="button" onClick={() => set({ vezes: [...f.vezes, { tipo: 'horario', horario: '20:00' }] })}
            className="self-start flex items-center gap-1 text-xs font-semibold text-green-400 py-1"><Plus className="w-3.5 h-3.5" />Mais uma vez no dia</button>
        )}
        <span className="text-[11px] text-zinc-500">"Antes/depois do treino": o lembrete aparece quando você abre e quando termina o treino no contador.</span>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-zinc-400">Próximo dia de uso</span>
        <input type="date" value={f.proxima} onChange={e => e.target.value && set({ proxima: e.target.value })} className={CAMPO} aria-label="Próximo dia de uso" />
      </label>
      {ehAppNativo() ? (
        <label className="flex items-center justify-between gap-3 py-1">
          <span className="text-sm text-zinc-300">Lembrete no celular</span>
          <input type="checkbox" checked={f.lembrete} onChange={e => set({ lembrete: e.target.checked })} className="w-5 h-5 accent-green-500" aria-label="Lembrete no celular" />
        </label>
      ) : (
        <p className="text-[11px] text-zinc-500">No iPhone não tem alarme: o que é para hoje aparece no Início e na tela do treino.</p>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-zinc-400">Observação <span className="text-zinc-600">(opcional)</span></span>
        <input value={f.obs ?? ''} onChange={e => set({ obs: e.target.value })} placeholder="Ex.: alternar o local de aplicação" className={CAMPO} maxLength={200} />
      </label>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={salvar}>Salvar</Button>
      </div>
    </section>
  )
}

export default function ErgogenicosPage() {
  const { user } = useAuth()
  const [rotina, setRotina] = useState<Rotina | null>(null)
  const [editando, setEditando] = useState<ItemRotina | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const hoje = diaLocal()

  useEffect(() => {
    if (user) carregarRotina(user.id).then(setRotina).catch(() => setErro('Não foi possível carregar. Confira a internet.'))
  }, [user])

  const gravar = async (nova: Rotina) => {
    const anterior = rotina
    setRotina(nova); setErro('')
    try { await salvarRotina(user!.id, nova) } catch (e) { setRotina(anterior); setErro(e instanceof Error ? e.message : 'Não foi possível salvar.') }
  }
  const salvarItem = (i: ItemRotina) => {
    const existe = rotina!.itens.some(x => x.id === i.id)
    gravar({ ...rotina!, itens: existe ? rotina!.itens.map(x => (x.id === i.id ? i : x)) : [...rotina!.itens, i] })
    setEditando(null)
  }
  const remover = (i: ItemRotina) => {
    if (confirm(`Remover "${i.nome}"?`)) gravar({ ...rotina!, itens: rotina!.itens.filter(x => x.id !== i.id) })
  }
  const trocarVez = (i: ItemRotina, k: number) =>
    gravar({ ...rotina!, itens: rotina!.itens.map(x => (x.id === i.id ? (vezFeita(x, k, hoje) ? desfazerVez(x, k, hoje) : marcarVez(x, k, hoje)) : x)) })

  if (!rotina) return erro ? <p className="text-sm text-red-400">{erro}</p> : <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const ordenados = [...rotina.itens].sort((a, b) => a.proxima.localeCompare(b.proxima) || a.nome.localeCompare(b.nome))
  const doDia = ordenados.filter(i => ehDeHoje(i, hoje))
  const novo = (): ItemRotina => ({ id: novoId(), nome: '', forma: 'injetavel', dose: 0, unidade: 'mg', intervaloDias: 7, vezes: [{ tipo: 'horario', horario: '08:00' }], proxima: hoje, lembrete: true, historico: [] })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Ergogênicos</h1>
        <p className="text-sm text-zinc-400 mt-1">Hormônios, medicamentos e suplementos: dose, intervalo e lembrete. Só você vê esta lista.</p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}

      {doDia.length > 0 && (
        <section aria-label="Para hoje" className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <h2 className="px-4 pt-3.5 pb-2 font-semibold text-zinc-100">Para hoje</h2>
          <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
            {doDia.flatMap(i => i.vezes.map((v, k) => {
              const feito = vezFeita(i, k, hoje), s = situacao(i, hoje)
              return (
                <li key={`${i.id}-${k}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${feito ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{i.nome}</p>
                    <p className="text-xs text-zinc-500">{textoDose(i)} · {feito ? 'feito' : s.tipo === 'atrasado' ? <span className="text-amber-400">{s.texto}</span> : textoVez(v)}</p>
                  </div>
                  <button type="button" onClick={() => trocarVez(i, k)} aria-pressed={feito}
                    aria-label={feito ? `Desfazer ${i.nome} (${textoVez(v)})` : `Marcar ${i.nome} como feito (${textoVez(v)})`}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95 ${feito ? 'bg-zinc-800 text-zinc-400' : 'bg-green-500 text-zinc-950'}`}>
                    <Check className="w-4 h-4" />{feito ? 'Feito' : 'Marcar feito'}
                  </button>
                </li>
              )
            }))}
          </ul>
        </section>
      )}

      {editando && <Formulario inicial={editando} onSalvar={salvarItem} onCancelar={() => setEditando(null)} />}

      <section aria-label="Meus itens" className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <h2 className="px-4 pt-3.5 pb-2 font-semibold text-zinc-100">Meus itens</h2>
        {ordenados.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-zinc-500">Nada cadastrado ainda. Toque em "Adicionar" para colocar o primeiro, com dose, intervalo e lembrete.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
            {ordenados.map(i => {
              const hist = historicoPorDia(i)
              return (
                <li key={i.id} className="pl-4 pr-2 py-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAberto(a => (a === i.id ? null : i.id))} aria-expanded={aberto === i.id} aria-label={`Histórico de ${i.nome}`}
                      className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-zinc-100 truncate flex items-center gap-1">{i.nome}<ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition ${aberto === i.id ? 'rotate-180' : ''}`} /></p>
                      <p className="text-xs text-zinc-500">{textoDose(i)} · {textoIntervalo(i.intervaloDias)} · {textoVezes(i.vezes)}</p>
                      <p className="text-xs text-zinc-500">próxima: {situacao(i, hoje).texto}{i.lembrete || !ehAppNativo() ? '' : ' · sem lembrete'}</p>
                      {i.obs && <p className="text-[11px] text-zinc-600 truncate">{i.obs}</p>}
                    </button>
                    <button onClick={() => setEditando(i)} aria-label={`Editar ${i.nome}`} className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remover(i)} aria-label={`Remover ${i.nome}`} className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {aberto === i.id && (
                    <div className="mt-2 mr-2 rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2" aria-label={`Histórico de uso de ${i.nome}`}>
                      <p className="text-[11px] font-semibold text-zinc-400 mb-1">Histórico</p>
                      {hist.length === 0 ? <p className="text-xs text-zinc-600">Nenhum uso marcado ainda.</p> : (
                        <ul className="flex flex-col gap-0.5">
                          {hist.slice(0, 15).map(h => (
                            <li key={h.dia} className="text-xs text-zinc-400 tabular-nums">
                              {dataCurta(h.dia)} · {i.vezes.length > 1 ? `${h.vezes.length} de ${i.vezes.length} (${h.vezes.map(k => (i.vezes[k] ? textoVez(i.vezes[k]) : '')).join(', ')})` : 'feito'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {!editando && rotina.itens.length < MAX_ITENS && (
          <button onClick={() => setEditando(novo())} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/5 border-t border-zinc-800/70">
            <Plus className="w-4 h-4" />Adicionar
          </button>
        )}
      </section>

      <section aria-label="Privacidade" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <button type="button" role="switch" aria-checked={rotina.discreto} aria-label="Modo discreto" onClick={() => gravar({ ...rotina, discreto: !rotina.discreto })}
          className="w-full flex items-center gap-3 text-left">
          {rotina.discreto ? <EyeOff className="w-5 h-5 text-green-400 shrink-0" /> : <Eye className="w-5 h-5 text-zinc-500 shrink-0" />}
          <span className="flex-1">
            <span className="block text-sm font-semibold text-zinc-100">Modo discreto</span>
            <span className="block text-xs text-zinc-500">{rotina.discreto
              ? 'Ligado: no Início, no treino e nos avisos do celular aparece só "item da sua rotina", sem o nome.'
              : 'Desligado: o nome aparece no Início, no treino e nos avisos do celular.'}</span>
          </span>
          <span className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${rotina.discreto ? 'bg-green-500' : 'bg-zinc-700'}`}>
            <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${rotina.discreto ? 'translate-x-4' : ''}`} />
          </span>
        </button>
        {!ehAppNativo() && <p className="text-xs text-zinc-500 mt-3">Os alarmes no celular são do app Android. No iPhone, o que é para hoje aparece no Início e na tela do treino.</p>}
      </section>

      <p className="flex gap-2 text-[11px] text-zinc-500 leading-relaxed px-1">
        <ShieldAlert className="w-4 h-4 shrink-0 text-zinc-600" />
        O R2 Fit Pro só organiza e lembra o que você cadastra. Doses e intervalos devem seguir a orientação do seu médico.
      </p>
    </div>
  )
}
