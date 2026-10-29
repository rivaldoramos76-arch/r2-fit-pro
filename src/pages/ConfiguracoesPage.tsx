import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { chamarApi, ErroApi } from '../lib/api'
import { carregarPreferencias, salvarPreferencias, type Preferencias } from '../lib/preferencias'
import { traduzirErroAuth, validarSenha } from '../lib/formatos'
import { Button, Card, Input, Select, Spinner, Textarea } from '../components/UI'

function Interruptor({ rotulo, descricao, valor, onChange, desabilitado }: { rotulo: string; descricao?: string; valor: boolean; onChange: (v: boolean) => void; desabilitado?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 py-3 ${desabilitado ? 'opacity-60' : 'cursor-pointer'}`}>
      <span><span className="text-sm font-medium block">{rotulo}</span>{descricao && <span className="text-xs text-zinc-500">{descricao}</span>}</span>
      <input type="checkbox" role="switch" checked={valor} disabled={desabilitado} onChange={e => onChange(e.target.checked)} className="mt-1 w-5 h-5 accent-green-500 shrink-0" />
    </label>
  )
}

export default function ConfiguracoesPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<Preferencias | null>(null)
  const [marketing, setMarketing] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [tipoPedido, setTipoPedido] = useState('correcao')
  const [detalhePedido, setDetalhePedido] = useState('')
  const [excluir, setExcluir] = useState({ aberto: false, senha: '', confirmacao: '', processando: false })

  useEffect(() => {
    if (!user) return
    carregarPreferencias(user.id).then(setPrefs)
    supabase.from('profiles').select('marketing_opt_in').eq('id', user.id).single().then(({ data }) => setMarketing(!!data?.marketing_opt_in))
  }, [user])

  const mostrar = (tipo: 'ok' | 'erro', texto: string) => { setMsg({ tipo, texto }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const atualizarPrefs = async (novo: Preferencias) => {
    setPrefs(novo)
    try { await salvarPreferencias(user!.id, novo); setMsg({ tipo: 'ok', texto: 'Preferências salvas.' }) }
    catch { mostrar('erro', 'Não foi possível salvar as preferências.') }
  }

  const atualizarMarketing = async (v: boolean) => {
    setMarketing(v)
    const { error } = await supabase.from('profiles').update({ marketing_opt_in: v }).eq('id', user!.id)
    if (error) mostrar('erro', 'Não foi possível salvar.')
    else setMsg({ tipo: 'ok', texto: v ? 'Você receberá novidades por e-mail.' : 'Consentimento para novidades revogado.' })
  }

  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    const erro = validarSenha(novaSenha)
    if (erro) return mostrar('erro', erro)
    if (novaSenha !== confirmarSenha) return mostrar('erro', 'As senhas não conferem.')
    setTrocandoSenha(true)
    // Confirma a senha atual antes de alterar
    const { error: errLogin } = await supabase.auth.signInWithPassword({ email: user!.email!, password: senhaAtual })
    if (errLogin) { setTrocandoSenha(false); return mostrar('erro', 'Senha atual incorreta.') }
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setTrocandoSenha(false)
    if (error) return mostrar('erro', traduzirErroAuth(error.message))
    setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('')
    mostrar('ok', 'Senha alterada com sucesso.')
  }

  const exportar = async () => {
    setExportando(true)
    try {
      const uid = user!.id
      const tabelas = ['profiles', 'user_settings', 'treinos', 'sessoes_treino', 'dietas', 'food_logs', 'metas_nutricionais', 'alimentos_favoritos', 'subscriptions', 'payments', 'support_tickets', 'privacy_requests'] as const
      const resultado: Record<string, unknown> = { exportado_em: new Date().toISOString(), conta: { id: uid, email: user!.email, criada_em: user!.created_at } }
      for (const t of tabelas) {
        const coluna = t === 'profiles' ? 'id' : 'user_id'
        const { data, error } = await supabase.from(t).select('*').eq(coluna, uid)
        if (error) throw error
        resultado[t] = data
      }
      const blob = new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `r2fitpro-meus-dados-${new Date().toISOString().slice(0, 10)}.json`; a.click()
      URL.revokeObjectURL(url)
      mostrar('ok', 'Arquivo com seus dados gerado.')
    } catch {
      mostrar('erro', 'Não foi possível exportar agora. Tente novamente.')
    } finally { setExportando(false) }
  }

  const enviarPedido = async () => {
    if (detalhePedido.trim().length < 5) return mostrar('erro', 'Descreva sua solicitação.')
    const { error } = await supabase.from('privacy_requests').insert({ user_id: user!.id, email: user!.email, tipo: tipoPedido, detalhes: detalhePedido.trim().slice(0, 3000) })
    if (error) return mostrar('erro', 'Não foi possível registrar a solicitação.')
    setDetalhePedido('')
    mostrar('ok', 'Solicitação registrada. Responderemos em até 15 dias, conforme a LGPD.')
  }

  const excluirConta = async () => {
    if (excluir.confirmacao !== 'EXCLUIR') return mostrar('erro', 'Digite EXCLUIR para confirmar.')
    setExcluir(s => ({ ...s, processando: true }))
    const { error: errLogin } = await supabase.auth.signInWithPassword({ email: user!.email!, password: excluir.senha })
    if (errLogin) { setExcluir(s => ({ ...s, processando: false })); return mostrar('erro', 'Senha incorreta.') }
    try {
      await chamarApi('conta', { acao: 'excluir', confirmacao: 'EXCLUIR' })
      await signOut().catch(() => {})
      navigate('/', { replace: true })
    } catch (e) {
      setExcluir(s => ({ ...s, processando: false }))
      mostrar('erro', e instanceof ErroApi ? e.message : 'Não foi possível excluir a conta agora.')
    }
  }

  if (!prefs) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Configurações</h1>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm rounded-xl px-3 py-2 border ${msg.tipo === 'erro' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-green-400 bg-green-500/10 border-green-500/20'}`}>{msg.texto}</p>}

      <Card>
        <h2 className="font-semibold">Notificações</h2>
        <div className="divide-y divide-zinc-800">
          <Interruptor rotulo="E-mails de cobrança e segurança" descricao="Obrigatórios para a prestação do serviço (confirmações, falhas de pagamento, cancelamento)." valor desabilitado onChange={() => {}} />
          <Interruptor rotulo="Novidades e dicas por e-mail" descricao="Você pode revogar este consentimento a qualquer momento." valor={marketing} onChange={atualizarMarketing} />
          <Interruptor rotulo="Lembretes de treino" descricao="Salvo para quando os lembretes estiverem disponíveis." valor={prefs.notificacoes.lembrete_treino}
            onChange={v => atualizarPrefs({ ...prefs, notificacoes: { ...prefs.notificacoes, lembrete_treino: v } })} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Áudio dos treinos</h2>
        <div className="divide-y divide-zinc-800">
          <div className="py-3">
            <p className="text-sm font-medium">Som do contador</p>
            <div className="grid grid-cols-2 gap-1 bg-zinc-800/60 rounded-xl p-1 mt-2" role="radiogroup" aria-label="Som do contador">
              {([['musica', 'Por cima da música'], ['bloqueio', 'Com tela bloqueada']] as const).map(([m, r]) => (
                <button key={m} type="button" role="radio" aria-checked={prefs.audio.modo === m} onClick={() => atualizarPrefs({ ...prefs, audio: { ...prefs.audio, modo: m } })}
                  className={`py-2 rounded-lg text-xs font-semibold transition ${prefs.audio.modo === m ? 'bg-green-500 text-zinc-950' : 'text-zinc-400'}`}>{r}</button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">{prefs.audio.modo === 'musica'
              ? 'Só os avisos curtos tocam, junto com a sua música. No iPhone, a tela fica ligada durante o exercício.'
              : 'O som segue com a tela bloqueada, mas o celular pausa a sua música durante o exercício.'}</p>
          </div>
          <Interruptor rotulo="Abaixar a música durante os avisos" descricao="Android: a música baixa um instante quando a voz fala e volta em seguida." valor={prefs.audio.abaixar_musica} onChange={v => atualizarPrefs({ ...prefs, audio: { ...prefs.audio, abaixar_musica: v } })} />
          <Interruptor rotulo="Iniciar treinos sem som" valor={prefs.audio.mudo} onChange={v => atualizarPrefs({ ...prefs, audio: { ...prefs.audio, mudo: v } })} />
          <label className="flex items-center gap-3 py-3">
            <span className="text-sm font-medium flex-1">Volume padrão</span>
            <input type="range" min={0} max={1} step={0.05} value={prefs.audio.volume} aria-label="Volume padrão"
              onChange={e => setPrefs({ ...prefs, audio: { ...prefs.audio, volume: Number(e.target.value) } })}
              onPointerUp={() => atualizarPrefs(prefs)} onKeyUp={() => atualizarPrefs(prefs)} className="accent-green-500 w-32" />
            <span className="text-xs text-zinc-500 w-9 text-right">{Math.round(prefs.audio.volume * 100)}%</span>
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Alterar senha</h2>
        <form onSubmit={trocarSenha} className="flex flex-col gap-3" noValidate>
          <Input label="Senha atual" type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} autoComplete="current-password" />
          <Input label="Nova senha" type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números." />
          <Input label="Confirmar nova senha" type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} autoComplete="new-password" />
          <Button type="submit" variant="secondary" loading={trocandoSenha}>Alterar senha</Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Privacidade e dados</h2>
        <p className="text-sm text-zinc-400 mt-1">Direitos do titular previstos na LGPD.</p>
        <div className="flex flex-col gap-3 mt-4">
          <Button variant="secondary" onClick={exportar} loading={exportando}><Download className="w-4 h-4" /> Baixar meus dados (JSON)</Button>
          <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
            <Select label="Outra solicitação" value={tipoPedido} onChange={e => setTipoPedido(e.target.value)}>
              <option value="correcao">Correção de dados</option>
              <option value="informacao">Informações sobre compartilhamento</option>
              <option value="revogacao">Revogação de consentimento</option>
            </Select>
            <Textarea label="Detalhes" value={detalhePedido} onChange={e => setDetalhePedido(e.target.value)} rows={3} maxLength={3000} />
            <Button variant="secondary" onClick={enviarPedido}>Enviar solicitação</Button>
          </div>
        </div>
      </Card>

      <Card className="border-red-500/20">
        <h2 className="font-semibold text-red-300 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Excluir conta</h2>
        <p className="text-sm text-zinc-400 mt-1">Apaga definitivamente seu perfil, treinos, dietas, registros e foto, e cancela a assinatura. Registros de pagamento são mantidos sem vínculo com você pelo prazo legal.</p>
        {!excluir.aberto ? (
          <Button variant="danger" className="mt-3" onClick={() => setExcluir(s => ({ ...s, aberto: true }))}>Quero excluir minha conta</Button>
        ) : (
          <div className="flex flex-col gap-3 mt-3">
            <Input label="Confirme sua senha" type="password" value={excluir.senha} onChange={e => setExcluir(s => ({ ...s, senha: e.target.value }))} autoComplete="current-password" />
            <Input label='Digite "EXCLUIR" para confirmar' value={excluir.confirmacao} onChange={e => setExcluir(s => ({ ...s, confirmacao: e.target.value }))} />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setExcluir({ aberto: false, senha: '', confirmacao: '', processando: false })}>Cancelar</Button>
              <Button variant="danger" className="flex-1" loading={excluir.processando} onClick={excluirConta}>Excluir definitivamente</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
