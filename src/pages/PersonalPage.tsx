import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { UserCheck, MessageCircle, ChevronDown, ChevronUp, Users, Share2, Copy, RefreshCw, ChevronRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAcesso } from '../context/AcessoContext'
import {
  verConvite, aceitarConvite, meusPersonais, atualizarCompartilhamento, encerrarAcompanhamento,
  meuPerfilPersonal, ativarPersonal, type MeuPersonal, type Compartilhamento, type PerfilPersonal,
} from '../lib/acompanhamento'
import { normalizarCodigo, linkConvite } from '../lib/acompanhamentoBase'
import { Button, Input, Spinner } from '../components/UI'
import Conversa from '../components/acompanhamento/Conversa'
import Compartilhar from '../components/acompanhamento/Compartilhar'

const TUDO: Compartilhamento = { ver_treinos: true, ver_diario: true, ver_peso: true, editar_planos: true }
const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')

/** Convite: confere o código, mostra quem é o personal e o que será compartilhado. */
function Convite({ codigoInicial, aoAceitar }: { codigoInicial: string; aoAceitar: () => void }) {
  const [codigo, setCodigo] = useState(codigoInicial)
  const [personal, setPersonal] = useState<{ nome: string; cref: string | null; proprio: boolean; ja_vinculado: boolean } | null>(null)
  const [escolha, setEscolha] = useState<Compartilhamento>(TUDO)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const conferir = useCallback(async (c: string) => {
    if (c.length !== 6) { setErro('O código tem 6 letras e números.'); return }
    setCarregando(true); setErro(''); setPersonal(null)
    try { setPersonal(await verConvite(c)) } catch (e) { setErro(erroDe(e)) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { if (codigoInicial.length === 6) conferir(codigoInicial) }, [codigoInicial, conferir])

  const aceitar = async () => {
    setCarregando(true); setErro('')
    try { await aceitarConvite(codigo, escolha); aoAceitar() } catch (e) { setErro(erroDe(e)) } finally { setCarregando(false) }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 animate-fade-up">
      <h2 className="font-semibold text-zinc-100">Tem um personal no R2 Fit Pro?</h2>
      {!personal ? (
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); conferir(codigo) }}>
          <Input label="Código de convite" value={codigo} onChange={e => setCodigo(normalizarCodigo(e.target.value))} placeholder="Ex.: K7P2QX"
            autoCapitalize="characters" autoComplete="off" className="tracking-[0.3em] font-mono uppercase" />
          <Button type="submit" loading={carregando} className="shrink-0">Continuar</Button>
        </form>
      ) : personal.proprio ? (
        <p className="text-sm text-amber-300">Este é o seu próprio código de personal. Envie-o para os seus alunos.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 p-3">
            <UserCheck className="w-6 h-6 text-green-400 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-zinc-100 truncate">{personal.nome}</p>
              {personal.cref && <p className="text-xs text-zinc-400">CREF {personal.cref}</p>}
            </div>
          </div>
          <p className="text-sm text-zinc-400">{personal.ja_vinculado ? 'Você já é acompanhado por este personal. Atualize o que ele pode ver:' : 'Escolha o que este personal pode ver e fazer. Você muda isso quando quiser.'}</p>
          <Compartilhar valor={escolha} onChange={setEscolha} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setPersonal(null); setCodigo('') }}>Cancelar</Button>
            <Button className="flex-1" loading={carregando} onClick={aceitar}>{personal.ja_vinculado ? 'Salvar' : 'Aceitar convite'}</Button>
          </div>
        </>
      )}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </section>
  )
}

/** Um personal que acompanha o aluno: mensagens, o que está compartilhado e encerrar. */
function CartaoPersonal({ p, meuId, aoMudar }: { p: MeuPersonal; meuId: string; aoMudar: () => void }) {
  const [aberto, setAberto] = useState<'mensagens' | 'compartilhar' | null>(p.nao_lidas ? 'mensagens' : null)
  const [escolha, setEscolha] = useState<Compartilhamento>({ ver_treinos: p.ver_treinos, ver_diario: p.ver_diario, ver_peso: p.ver_peso, editar_planos: p.editar_planos })
  const [salvo, setSalvo] = useState('')
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const mudar = async (v: Compartilhamento) => {
    const antes = escolha
    setEscolha(v); setErro(''); setSalvo('')
    try { await atualizarCompartilhamento(p.id, v); setSalvo('Salvo') } catch (e) { setEscolha(antes); setErro(erroDe(e)) }
  }
  const encerrar = async () => {
    setOcupado(true)
    try { await encerrarAcompanhamento(p.id); aoMudar() } catch (e) { setErro(erroDe(e)); setOcupado(false) }
  }
  const alternar = (q: 'mensagens' | 'compartilhar') => setAberto(a => (a === q ? null : q))

  return (
    <li className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 animate-fade-up">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-green-500/15 text-green-400 font-bold flex items-center justify-center shrink-0">{p.nome.charAt(0).toUpperCase()}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-100 truncate">{p.nome}</p>
          <p className="text-xs text-zinc-500">Seu personal{p.cref ? ` · CREF ${p.cref}` : ''} · desde {new Date(p.desde).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => alternar('mensagens')} className={`relative flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${aberto === 'mensagens' ? 'bg-green-500/15 border-green-500/30 text-green-300' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}>
          <MessageCircle className="w-4 h-4" />Mensagens
          {p.nao_lidas > 0 && aberto !== 'mensagens' && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">{p.nao_lidas}</span>}
        </button>
        <button onClick={() => alternar('compartilhar')} className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${aberto === 'compartilhar' ? 'bg-green-500/15 border-green-500/30 text-green-300' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}>
          <ShieldCheck className="w-4 h-4" />O que ele vê {aberto === 'compartilhar' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {aberto === 'mensagens' && <Conversa acompanhamentoId={p.id} meuId={meuId} souAluno aoLer={aoMudar} />}
      {aberto === 'compartilhar' && (
        <div className="flex flex-col gap-2">
          <Compartilhar valor={escolha} onChange={mudar} />
          {salvo && <p className="text-xs text-green-400">{salvo}</p>}
          {!confirmar
            ? <button onClick={() => setConfirmar(true)} className="self-start text-sm text-red-400 hover:text-red-300 mt-1">Encerrar acompanhamento</button>
            : (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex flex-col gap-2">
                <p className="text-sm text-red-200">O personal deixa de ver seus dados na hora. Os treinos e dietas que ele enviou continuam com você.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConfirmar(false)}>Voltar</Button>
                  <Button size="sm" variant="danger" loading={ocupado} onClick={encerrar}>Encerrar</Button>
                </div>
              </div>
            )}
        </div>
      )}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </li>
  )
}

/** Modo personal: ativar, código e link de convite. */
function ModoPersonal({ userId, nomePadrao }: { userId: string; nomePadrao: string }) {
  const { premium } = useAcesso()
  const [perfil, setPerfil] = useState<PerfilPersonal | null | undefined>(undefined)
  const [nome, setNome] = useState(nomePadrao)
  const [cref, setCref] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => { meuPerfilPersonal(userId).then(setPerfil).catch(() => setPerfil(null)) }, [userId])

  const ativar = async (novoCodigo = false) => {
    setOcupado(true); setErro(''); setAviso('')
    try {
      const p = await ativarPersonal(perfil ? null : nome, perfil ? null : cref, novoCodigo)
      setPerfil(p)
      if (novoCodigo) setAviso('Código novo gerado. O antigo não funciona mais; quem já é seu aluno continua.')
    } catch (e) { setErro(erroDe(e)) } finally { setOcupado(false) }
  }
  const link = perfil ? linkConvite(window.location.origin, perfil.codigo) : ''
  const compartilhar = async () => {
    const texto = `Quero acompanhar seus treinos e sua dieta pelo R2 Fit Pro. Entre por este link e aceite o convite (código ${perfil!.codigo}): ${link}`
    if (navigator.share) { try { await navigator.share({ text: texto }); return } catch { /* cancelado */ } }
    try { await navigator.clipboard.writeText(texto); setAviso('Convite copiado. Cole no WhatsApp do aluno.') } catch { setAviso(texto) }
  }

  if (perfil === undefined) return null
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2"><Users className="w-5 h-5 text-green-400" /><h2 className="font-semibold text-zinc-100">Você é personal?</h2></div>
      {!perfil ? (
        !premium ? (
          <p className="text-sm text-zinc-400">Acompanhe seus alunos pelo app: veja treinos, diário e peso, envie treinos e dietas e troque mensagens. Disponível no <Link to="/assinatura" className="text-green-400 underline">Premium</Link>.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Ative o modo personal para receber um código de convite. Cada aluno escolhe o que compartilha com você.</p>
            <Input label="Nome que o aluno vai ver" value={nome} onChange={e => setNome(e.target.value)} maxLength={80} />
            <Input label="CREF (opcional)" value={cref} onChange={e => setCref(e.target.value)} maxLength={30} placeholder="000000-G/UF" />
            <Button loading={ocupado} onClick={() => ativar()}>Ativar modo personal</Button>
          </>
        )
      ) : (
        <>
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4 text-center">
            <p className="text-xs text-zinc-500">Seu código de convite</p>
            <p className="text-3xl font-mono font-bold tracking-[0.3em] text-green-400 mt-1" data-testid="codigo-personal">{perfil.codigo}</p>
            <p className="text-xs text-zinc-500 mt-1 break-all">{link}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={compartilhar}><Share2 className="w-4 h-4" />Convidar aluno</Button>
            <Link to="/alunos" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 font-semibold text-sm px-4 py-2.5">Meus alunos<ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="flex gap-4">
            <button onClick={async () => { try { await navigator.clipboard.writeText(perfil.codigo); setAviso('Código copiado.') } catch { /* sem permissão */ } }} className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" />Copiar código</button>
            <button disabled={ocupado} onClick={() => ativar(true)} className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Gerar código novo</button>
          </div>
        </>
      )}
      {aviso && <p className="text-sm text-green-400 break-words">{aviso}</p>}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </section>
  )
}

export default function PersonalPage() {
  const { user } = useAuth()
  const { codigo: codigoRota } = useParams<{ codigo?: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const codigoInicial = normalizarCodigo(codigoRota ?? params.get('codigo') ?? '')
  const [lista, setLista] = useState<MeuPersonal[] | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    meusPersonais().then(l => { setLista(l); setErro('') }).catch(e => { setLista([]); setErro(erroDe(e)) })
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const aceitou = () => { carregar(); if (codigoInicial) navigate('/personal', { replace: true }) }

  if (!user) return null
  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2"><UserCheck className="w-6 h-6 text-green-400" />Personal</h1>
        <p className="text-sm text-zinc-500">Seja acompanhado pelo seu personal ou acompanhe seus alunos.</p>
      </div>
      {lista === null ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : (
        <>
          {(codigoInicial || lista.length === 0) && <Convite key={codigoInicial} codigoInicial={codigoInicial} aoAceitar={aceitou} />}
          {lista.length > 0 && (
            <ul className="flex flex-col gap-3" aria-label="Meus personais">
              {lista.map(p => <CartaoPersonal key={p.id} p={p} meuId={user.id} aoMudar={carregar} />)}
            </ul>
          )}
          {lista.length > 0 && !codigoInicial && (
            <details className="text-sm text-zinc-400">
              <summary className="cursor-pointer select-none">Adicionar outro profissional</summary>
              <div className="mt-3"><Convite codigoInicial="" aoAceitar={aceitou} /></div>
            </details>
          )}
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <ModoPersonal userId={user.id} nomePadrao={String(user.user_metadata?.nome ?? '')} />
        </>
      )}
    </div>
  )
}
