import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, Droplet, Dumbbell, Plus, Scale, Share, Trash2, Utensils } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ativarPush, desativarPush, estadoPush, listarLembretes, salvarLembretes, testarPush, type EstadoPush } from '../lib/lembretes'
import { comPadroes, DIAS_CURTOS, MAX_AGUA, proximoHorarioAgua, REFEICOES, resumoDias, TODOS_OS_DIAS, type Lembrete, type TipoLembrete } from '../lib/lembretesBase'
import { ErroApi } from '../lib/api'
import { Button, Spinner } from '../components/UI'

function Chave({ ativo, onChange, rotulo }: { ativo: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ativo} aria-label={rotulo} onClick={() => onChange(!ativo)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${ativo ? 'bg-green-500' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function Hora({ valor, onChange, rotulo }: { valor: string; onChange: (v: string) => void; rotulo: string }) {
  return (
    <input type="time" value={valor} onChange={e => e.target.value && onChange(e.target.value)} aria-label={rotulo}
      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm tabular-nums text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 [color-scheme:dark]" />
  )
}

function Dias({ valor, onChange, rotulo }: { valor: number[]; onChange: (v: number[]) => void; rotulo: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label={rotulo}>
      {[1, 2, 3, 4, 5, 6, 0].map(d => {
        const ativo = valor.includes(d)
        return (
          <button key={d} type="button" aria-pressed={ativo} aria-label={DIAS_CURTOS[d]}
            onClick={() => { const novo = ativo ? valor.filter(x => x !== d) : [...valor, d]; if (novo.length) onChange(novo) }}
            className={`w-9 h-8 rounded-lg text-xs font-semibold transition ${ativo ? 'bg-green-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>
            {DIAS_CURTOS[d]}
          </button>
        )
      })}
    </div>
  )
}

function Secao({ icone, titulo, nota, children }: { icone: React.ReactNode; titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-fade-up">
      <div className="px-4 pt-3.5 pb-2">
        <h2 className="font-semibold text-zinc-100 flex items-center gap-2">{icone}{titulo}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{nota}</p>
      </div>
      <div className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">{children}</div>
    </section>
  )
}

/** Cartão do aparelho: ativar notificações, instruções do iPhone, teste. */
function Aparelho({ estado, onMudar }: { estado: EstadoPush | null; onMudar: (e: EstadoPush) => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const agir = async (f: () => Promise<void>) => {
    setOcupado(true); setErro(''); setMsg('')
    try { await f() } catch (e) { setErro(e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível concluir.') } finally { setOcupado(false) }
  }
  if (!estado) return <div className="flex justify-center py-6"><Spinner /></div>
  return (
    <section aria-label="Notificações neste aparelho" className={`rounded-2xl border p-4 animate-fade-up ${estado === 'ativo' ? 'border-green-500/30 bg-green-500/5' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="flex items-start gap-3">
        {estado === 'ativo' ? <BellRing className="w-6 h-6 text-green-400 shrink-0" /> : <BellOff className="w-6 h-6 text-zinc-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-100">{estado === 'ativo' ? 'Notificações ativas neste aparelho' : 'Notificações neste aparelho'}</p>
          {estado === 'inativo' && <p className="text-sm text-zinc-400 mt-0.5">Ative para receber os lembretes mesmo com o app fechado.</p>}
          {estado === 'negado' && <p className="text-sm text-zinc-400 mt-0.5">As notificações foram bloqueadas. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço → Notificações → Permitir) e volte aqui.</p>}
          {estado === 'sem_suporte' && <p className="text-sm text-zinc-400 mt-0.5">Este navegador não recebe notificações. No Android use o Chrome; no iPhone, adicione o app à Tela de Início.</p>}
          {estado === 'instalar' && (
            <div className="text-sm text-zinc-400 mt-1">
              <p>No iPhone, os lembretes só funcionam com o app na Tela de Início (iOS 16.4 ou mais novo):</p>
              <ol className="list-decimal ml-5 mt-1.5 space-y-0.5">
                <li>Abra o site no Safari e toque em <Share className="inline w-4 h-4 -mt-0.5" /> Compartilhar</li>
                <li>Escolha <b>Adicionar à Tela de Início</b></li>
                <li>Abra o R2 Fit Pro pelo ícone e volte a esta tela</li>
              </ol>
            </div>
          )}
          {estado === 'ativo' && <p className="text-sm text-zinc-400 mt-0.5">Os lembretes ligados abaixo chegam aqui, mesmo com o app fechado.</p>}
        </div>
      </div>
      {estado === 'inativo' && (
        <Button className="w-full mt-3" loading={ocupado} onClick={() => agir(async () => onMudar(await ativarPush()))}><Bell className="w-4 h-4" />Ativar notificações</Button>
      )}
      {estado === 'ativo' && (
        <div className="flex gap-2 mt-3">
          <Button variant="secondary" className="flex-1" loading={ocupado} onClick={() => agir(async () => {
            const r = await testarPush()
            setMsg(r.enviados ? 'Notificação de teste enviada. Deve chegar em alguns segundos.' : 'Não foi possível entregar a notificação. Desative e ative de novo.')
          })}>Enviar teste</Button>
          <Button variant="secondary" className="flex-1" disabled={ocupado} onClick={() => agir(async () => { await desativarPush(); onMudar('inativo') })}>Desativar</Button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-green-400">{msg}</p>}
      {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}
    </section>
  )
}

export default function LembretesPage() {
  const { user } = useAuth()
  const [lista, setLista] = useState<Lembrete[] | null>(null)
  const [removidos, setRemovidos] = useState<string[]>([])
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(() => {
    if (!user) return
    listarLembretes(user.id).then(l => setLista(comPadroes(l))).catch(() => setLista(comPadroes([])))
  }, [user])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { estadoPush().then(setEstado).catch(() => setEstado('sem_suporte')) }, [])

  const mudar = (i: number, parcial: Partial<Lembrete>) => {
    setLista(l => l!.map((x, j) => (j === i ? { ...x, ...parcial } : x))); setAlterado(true); setAviso('')
  }
  const remover = (i: number) => {
    const id = lista![i].id
    if (id) setRemovidos(r => [...r, id])
    setLista(l => l!.filter((_, j) => j !== i)); setAlterado(true); setAviso('')
  }
  const adicionarAgua = () => {
    setLista(l => [...l!, { tipo: 'agua' as TipoLembrete, horario: proximoHorarioAgua(l!), dias: [...TODOS_OS_DIAS], ativo: true }])
    setAlterado(true); setAviso('')
  }

  const salvar = async () => {
    setErro(''); setAviso(''); setSalvando(true)
    try {
      await salvarLembretes(user!.id, lista!, removidos)
      setRemovidos([]); setAlterado(false)
      setAviso(estado === 'ativo' ? 'Lembretes salvos.' : 'Lembretes salvos. Ative as notificações acima para recebê-los neste aparelho.')
      carregar()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar') } finally { setSalvando(false) }
  }

  if (!lista) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  const indices = (tipo: TipoLembrete) => lista.map((l, i) => [l, i] as const).filter(([l]) => l.tipo === tipo)
  const linha = (l: Lembrete, i: number, nome: string, extra?: React.ReactNode) => (
    <div key={l.id ?? `${l.tipo}-${i}`} className="px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className={`flex-1 text-sm ${l.ativo ? 'text-zinc-100' : 'text-zinc-500'}`}>{nome}</span>
        <Hora valor={l.horario} onChange={v => mudar(i, { horario: v })} rotulo={`Horário: ${nome}`} />
        {extra}
        <Chave ativo={l.ativo} onChange={v => mudar(i, { ativo: v })} rotulo={nome} />
      </div>
    </div>
  )
  const aguas = indices('agua')

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2"><Bell className="w-6 h-6 text-green-400" />Lembretes</h1>
        <p className="text-sm text-zinc-500 mt-1">Avisos só nos momentos certos: se você já registrou, o lembrete não toca.</p>
      </div>

      <Aparelho estado={estado} onMudar={setEstado} />

      <Secao icone={<Utensils className="w-4 h-4 text-green-400" />} titulo="Refeições" nota="Avisa só se a refeição ainda não foi registrada no diário.">
        {REFEICOES.map(r => indices(r.tipo).map(([l, i]) => linha(l, i, r.nome)))}
      </Secao>

      <Secao icone={<Droplet className="w-4 h-4 text-sky-400" />} titulo="Água" nota="Para de avisar quando você bate a meta de água do dia.">
        {aguas.map(([l, i], n) => linha(l, i, `Água ${n + 1}`,
          <button type="button" onClick={() => remover(i)} aria-label={`Remover horário da água ${n + 1}`} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>))}
        {aguas.length < MAX_AGUA && (
          <button type="button" onClick={adicionarAgua} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-sky-400 hover:bg-sky-500/5">
            <Plus className="w-4 h-4" />Adicionar horário
          </button>
        )}
      </Secao>

      <Secao icone={<Dumbbell className="w-4 h-4 text-green-400" />} titulo="Treino" nota="Não avisa se você já treinou no dia.">
        {indices('treino').map(([l, i]) => (
          <div key={l.id ?? `treino-${i}`}>
            {linha(l, i, 'Hora do treino')}
            <div className="px-4 pb-3 -mt-1"><Dias valor={l.dias} onChange={v => mudar(i, { dias: v })} rotulo="Dias do treino" /><p className="text-[11px] text-zinc-500 mt-1">{resumoDias(l.dias)}</p></div>
          </div>
        ))}
      </Secao>

      <Secao icone={<Scale className="w-4 h-4 text-green-400" />} titulo="Peso" nota="Lembrete para se pesar e acompanhar o gráfico.">
        {indices('peso').map(([l, i]) => (
          <div key={l.id ?? `peso-${i}`}>
            {linha(l, i, 'Pesar')}
            <div className="px-4 pb-3 -mt-1"><Dias valor={l.dias} onChange={v => mudar(i, { dias: v })} rotulo="Dias de pesar" /><p className="text-[11px] text-zinc-500 mt-1">{resumoDias(l.dias)}</p></div>
          </div>
        ))}
      </Secao>

      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {aviso && <p className="text-sm text-green-400">{aviso}</p>}
      <div className="sticky bottom-24 bg-zinc-950/90 backdrop-blur py-2">
        <Button size="lg" className="w-full" loading={salvando} disabled={!alterado && !removidos.length} onClick={salvar}>Salvar lembretes</Button>
      </div>
      <p className="text-[11px] text-zinc-500 text-center">Os horários seguem o fuso deste aparelho. <Link to="/suporte" className="underline">Precisa de ajuda?</Link></p>
    </div>
  )
}
