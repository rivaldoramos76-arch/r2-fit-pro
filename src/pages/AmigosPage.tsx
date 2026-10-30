import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Users, Trophy, Dumbbell, UserPlus, Share2, Copy, Check, X, ChevronLeft, ChevronRight, Clock, Lock } from 'lucide-react'
import {
  meusAmigos, ativarAmigos, adicionarAmigo, responderPedido, removerAmizade, feedAmigos, curtir, rankingAmigos,
  type DadosAmigos, type ItemFeed, type LinhaRanking,
} from '../lib/amigos'
import { posicoesRanking, tempoRelativo, textoCurtidas } from '../lib/amigosBase'
import { normalizarCodigo } from '../lib/acompanhamentoBase'
import { inicioSemana } from '../lib/relatorio'
import { hojeLocal, somarDias } from '../lib/diario'
import { useAuth } from '../context/AuthContext'
import { Button, Input, Spinner } from '../components/UI'

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')
const dataCurta = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
type Aba = 'feed' | 'ranking' | 'amigos'

function Avatar({ nome, eu }: { nome: string; eu?: boolean }) {
  return <span className={`w-10 h-10 rounded-full font-bold flex items-center justify-center shrink-0 ${eu ? 'bg-green-500 text-zinc-950' : 'bg-green-500/15 text-green-400'}`}>{nome.charAt(0).toUpperCase()}</span>
}

function Feed({ aoConvidar }: { aoConvidar: () => void }) {
  const [itens, setItens] = useState<ItemFeed[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => { feedAmigos().then(setItens).catch(e => { setErro(erroDe(e)); setItens([]) }) }, [])
  const alternar = async (i: ItemFeed) => {
    const novo = !i.curti
    setItens(l => l?.map(x => x.sessao_id === i.sessao_id ? { ...x, curti: novo, curtidas: x.curtidas + (novo ? 1 : -1) } : x) ?? null)
    try { await curtir(i.sessao_id, novo) } catch (e) {
      setErro(erroDe(e))
      setItens(l => l?.map(x => x.sessao_id === i.sessao_id ? i : x) ?? null)
    }
  }
  if (itens === null) return <div className="flex justify-center py-10"><Spinner size="lg" /></div>
  if (itens.length === 0) return (
    <div className="text-center py-10 px-6 bg-zinc-900 border border-zinc-800 rounded-3xl">
      <Dumbbell className="w-10 h-10 text-green-400 mx-auto" />
      <p className="font-semibold text-zinc-100 mt-3">Nenhum treino nos últimos 30 dias</p>
      <p className="text-sm text-zinc-500 mt-1">Quando você ou seus amigos concluírem um treino, ele aparece aqui para todo mundo dar aquele 💪.</p>
      <Button className="mt-4" onClick={aoConvidar}><UserPlus className="w-4 h-4" />Adicionar amigos</Button>
    </div>
  )
  return (
    <ul className="flex flex-col gap-2">
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {itens.map((i, k) => (
        <li key={i.sessao_id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 animate-fade-up" style={{ animationDelay: `${Math.min(k, 10) * 30}ms` }}>
          <div className="flex items-start gap-3">
            <Avatar nome={i.nome} eu={i.eu} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200"><strong className="text-zinc-50">{i.eu ? 'Você' : i.nome}</strong> concluiu {i.treino_nome ? <strong className="text-zinc-50">{i.treino_nome}</strong> : 'um treino'}</p>
              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap">
                <Clock className="w-3 h-3" />{tempoRelativo(i.data_fim)}
                {i.minutos ? ` · ${i.minutos} min` : ''}{i.exercicios ? ` · ${i.exercicios} exercício(s)` : ''}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={() => alternar(i)} aria-pressed={i.curti} aria-label={i.curti ? 'Tirar o 💪' : 'Dar um 💪'}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95 ${i.curti ? 'bg-green-500/15 border-green-500/40 text-green-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}>
              <span aria-hidden>💪</span>{i.curtidas > 0 ? i.curtidas : ''}
            </button>
            {i.curtidas > 0 && <span className="text-xs text-zinc-500 truncate">{textoCurtidas(i.quem_curtiu, i.curtidas)}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Ranking() {
  const [semana, setSemana] = useState(() => inicioSemana(hojeLocal()))
  const [linhas, setLinhas] = useState<LinhaRanking[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    setLinhas(null)
    rankingAmigos(semana, somarDias(semana, 6)).then(setLinhas).catch(e => { setErro(erroDe(e)); setLinhas([]) })
  }, [semana])
  const atual = inicioSemana(hojeLocal())
  const pos = posicoesRanking(linhas ?? [])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl px-2 py-1.5">
        <button onClick={() => setSemana(somarDias(semana, -7))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300" aria-label="Semana anterior"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-sm font-medium text-zinc-200">{semana === atual ? 'Esta semana' : `${dataCurta(semana)} a ${dataCurta(somarDias(semana, 6))}`}</span>
        <button onClick={() => setSemana(somarDias(semana, 7))} disabled={semana >= atual} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30" aria-label="Próxima semana"><ChevronRight className="w-5 h-5" /></button>
      </div>
      {linhas === null ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : (
        <ol className="flex flex-col gap-2" aria-label="Ranking da semana">
          {pos.map(l => (
            <li key={l.user_id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${l.eu ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
              <span className="w-8 text-center text-lg font-bold tabular-nums text-zinc-400">{l.medalha ?? `${l.posicao}º`}</span>
              <Avatar nome={l.nome} eu={l.eu} />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-zinc-100 truncate">{l.eu ? `${l.nome} (você)` : l.nome}</span>
                <span className="block text-xs text-zinc-500">{l.dias_diario} dia(s) com o diário em dia</span>
              </span>
              <span className="text-right">
                <span className="block text-xl font-black tabular-nums text-green-400">{l.treinos}</span>
                <span className="block text-[10px] uppercase tracking-wide text-zinc-500">treino{l.treinos === 1 ? '' : 's'}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {linhas && linhas.length <= 1 && <p className="text-sm text-zinc-500 text-center">Adicione amigos para disputar o ranking da semana.</p>}
      <p className="text-xs text-zinc-500 text-center">Conta treinos concluídos e dias com o diário registrado. Calorias e peso nunca aparecem.</p>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </div>
  )
}

function GerenciarAmigos({ dados, codigoInicial, aoMudar }: { dados: DadosAmigos; codigoInicial: string; aoMudar: () => void }) {
  const perfil = dados.perfil!
  const [codigo, setCodigo] = useState(codigoInicial)
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [apelido, setApelido] = useState(perfil.apelido ?? perfil.nome)
  const link = `${window.location.origin}/amigo/${perfil.codigo}`

  const executar = async (chave: string, f: () => Promise<void>) => {
    setOcupado(chave); setErro(''); setAviso('')
    try { await f() } catch (e) { setErro(erroDe(e)) } finally { setOcupado('') }
  }
  const adicionar = () => executar('adicionar', async () => {
    const r = await adicionarAmigo(codigo)
    setAviso(r.status === 'aceita' ? `Agora você e ${r.nome} são amigos!` : r.status === 'ja_amigos' ? `Você e ${r.nome} já são amigos.` : `Pedido enviado para ${r.nome}. Assim que aceitar, vocês aparecem um no feed do outro.`)
    setCodigo(''); aoMudar()
  })
  const convidar = async () => {
    const texto = `Bora treinar junto no R2 Fit Pro? Me adiciona como amigo pelo link (meu código é ${perfil.codigo}): ${link}`
    if (navigator.share) { try { await navigator.share({ text: texto }); return } catch { /* cancelado */ } }
    try { await navigator.clipboard.writeText(texto); setAviso('Convite copiado. Cole no WhatsApp.') } catch { setAviso(texto) }
  }
  const privacidade = (campo: 'mostrar_treinos' | 'entrar_ranking', valor: boolean) => executar(campo, async () => { await ativarAmigos(null, { [campo]: valor }); aoMudar() })

  return (
    <div className="flex flex-col gap-3">
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4 text-center">
          <p className="text-xs text-zinc-500">Seu código de amigo</p>
          <p className="text-3xl font-mono font-bold tracking-[0.3em] text-green-400 mt-1" data-testid="codigo-amigo">{perfil.codigo}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={convidar}><Share2 className="w-4 h-4" />Convidar</Button>
          <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(perfil.codigo); setAviso('Código copiado.') } catch { /* sem permissão */ } }}><Copy className="w-4 h-4" />Copiar código</Button>
        </div>
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); adicionar() }}>
          <Input label="Código do amigo" value={codigo} onChange={e => setCodigo(normalizarCodigo(e.target.value))} placeholder="Ex.: M4R7QZ" autoCapitalize="characters" autoComplete="off" className="tracking-[0.3em] font-mono uppercase" />
          <Button type="submit" disabled={codigo.length !== 6} loading={ocupado === 'adicionar'} className="shrink-0"><UserPlus className="w-4 h-4" />Adicionar</Button>
        </form>
      </section>

      {!!dados.recebidos?.length && (
        <section className="bg-zinc-900 border border-green-500/30 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-zinc-200">Pedidos de amizade</p>
          {dados.recebidos.map(p => (
            <div key={p.id} className="flex items-center gap-3">
              <Avatar nome={p.nome} />
              <span className="flex-1 text-sm text-zinc-100 truncate">{p.nome}</span>
              <button onClick={() => executar(p.id, async () => { await responderPedido(p.id, true); aoMudar() })} aria-label={`Aceitar ${p.nome}`} className="w-9 h-9 rounded-xl bg-green-500 text-zinc-950 flex items-center justify-center"><Check className="w-5 h-5" /></button>
              <button onClick={() => executar(p.id, async () => { await responderPedido(p.id, false); aoMudar() })} aria-label={`Recusar ${p.nome}`} className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
          ))}
        </section>
      )}

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-zinc-200">Amigos ({dados.amigos?.length ?? 0})</p>
        {!dados.amigos?.length ? <p className="text-sm text-zinc-500">Ainda sem amigos. Mande seu código para quem treina com você.</p>
          : dados.amigos.map(a => (
            <div key={a.id} className="flex items-center gap-3">
              <Avatar nome={a.nome} />
              <span className="flex-1 text-sm text-zinc-100 truncate">{a.nome}</span>
              <button onClick={() => executar(a.id, async () => { await removerAmizade(a.id); aoMudar() })} className="text-xs text-zinc-500 hover:text-red-400">Remover</button>
            </div>
          ))}
        {!!dados.enviados?.length && (
          <div className="border-t border-zinc-800 pt-2 mt-1">
            <p className="text-xs text-zinc-500 mb-1">Aguardando resposta</p>
            {dados.enviados.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1">
                <span className="text-zinc-400 truncate">{p.nome}</span>
                <button onClick={() => executar(p.id, async () => { await removerAmizade(p.id); aoMudar() })} className="text-xs text-zinc-500 hover:text-red-400">Cancelar</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><Lock className="w-4 h-4 text-green-400" />Privacidade</p>
        <label className="flex items-start gap-3 py-1 cursor-pointer">
          <input type="checkbox" role="switch" checked={perfil.mostrar_treinos} disabled={!!ocupado} onChange={e => privacidade('mostrar_treinos', e.target.checked)} className="mt-0.5 w-5 h-5 accent-green-500 shrink-0" />
          <span><span className="block text-sm text-zinc-100">Mostrar meus treinos no feed</span><span className="block text-xs text-zinc-500">Seus amigos veem quando você conclui um treino (nome, duração e exercícios).</span></span>
        </label>
        <label className="flex items-start gap-3 py-1 cursor-pointer">
          <input type="checkbox" role="switch" checked={perfil.entrar_ranking} disabled={!!ocupado} onChange={e => privacidade('entrar_ranking', e.target.checked)} className="mt-0.5 w-5 h-5 accent-green-500 shrink-0" />
          <span><span className="block text-sm text-zinc-100">Entrar no ranking da semana</span><span className="block text-xs text-zinc-500">Mostra quantos treinos e dias de diário você fez. Nunca mostra calorias, comida ou peso.</span></span>
        </label>
        <form className="flex items-end gap-2 pt-1" onSubmit={e => { e.preventDefault(); executar('apelido', async () => { await ativarAmigos(apelido); aoMudar(); setAviso('Nome atualizado.') }) }}>
          <Input label="Nome que seus amigos veem" value={apelido} onChange={e => setApelido(e.target.value)} maxLength={40} />
          <Button type="submit" variant="secondary" loading={ocupado === 'apelido'} className="shrink-0">Salvar</Button>
        </form>
      </section>
      {aviso && <p className="text-sm text-green-400 break-words">{aviso}</p>}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </div>
  )
}

export default function AmigosPage() {
  const { user } = useAuth()
  const { codigo: codigoRota } = useParams<{ codigo?: string }>()
  const navigate = useNavigate()
  const codigoInicial = normalizarCodigo(codigoRota ?? '')
  const [dados, setDados] = useState<DadosAmigos | null>(null)
  const [aba, setAba] = useState<Aba>(codigoInicial ? 'amigos' : 'feed')
  const [apelido, setApelido] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => { meusAmigos().then(setDados).catch(e => { setErro(erroDe(e)); setDados({ perfil: null }) }) }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (user) setApelido(String(user.user_metadata?.nome ?? '').split(' ')[0]) }, [user])

  const comecar = async () => {
    setOcupado(true); setErro('')
    try {
      await ativarAmigos(apelido || null)
      if (codigoInicial) {
        const r = await adicionarAmigo(codigoInicial).catch(() => null)
        if (r) navigate('/amigos', { replace: true })
      }
      carregar()
    } catch (e) { setErro(erroDe(e)) } finally { setOcupado(false) }
  }

  if (dados === null) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  const pendentes = dados.recebidos?.length ?? 0
  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2"><Users className="w-6 h-6 text-green-400" />Amigos</h1>
        <p className="text-sm text-zinc-500">Treine junto: veja os treinos dos amigos, dê um 💪 e dispute o ranking da semana.</p>
      </div>
      {!dados.perfil ? (
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3 animate-fade-up">
          <p className="font-semibold text-zinc-100">{codigoInicial ? 'Um amigo te convidou! 🎉' : 'Comece a treinar com amigos'}</p>
          <ul className="text-sm text-zinc-400 flex flex-col gap-1.5">
            <li>💪 Seus amigos veem quando você conclui um treino, e você vê os deles.</li>
            <li>🏆 Ranking da semana com treinos e dias de diário em dia.</li>
            <li>🔒 Calorias, comida e peso nunca aparecem. Você escolhe o que mostrar.</li>
          </ul>
          <Input label="Nome que seus amigos vão ver" value={apelido} onChange={e => setApelido(e.target.value)} maxLength={40} />
          <Button loading={ocupado} onClick={comecar}>{codigoInicial ? 'Começar e adicionar amigo' : 'Começar'}</Button>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1" role="tablist">
            {([['feed', 'Feed', Dumbbell], ['ranking', 'Ranking', Trophy], ['amigos', 'Amigos', Users]] as const).map(([id, rotulo, Icone]) => (
              <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
                className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition ${aba === id ? 'bg-green-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}>
                <Icone className="w-4 h-4" />{rotulo}
                {id === 'amigos' && pendentes > 0 && <span className="absolute top-0.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{pendentes}</span>}
              </button>
            ))}
          </div>
          {aba === 'feed' ? <Feed aoConvidar={() => setAba('amigos')} />
            : aba === 'ranking' ? <Ranking />
              : <GerenciarAmigos dados={dados} codigoInicial={codigoInicial} aoMudar={carregar} />}
        </>
      )}
    </div>
  )
}
