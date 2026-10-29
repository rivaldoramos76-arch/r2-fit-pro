import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAcesso } from '../context/AcessoContext'
import { Button, Card, Input, Spinner } from '../components/UI'
import { dataBR, ROTULO_ESTADO, traduzirErroAuth, validarEmail } from '../lib/formatos'

interface Perfil { nome: string | null; telefone: string | null; data_nascimento: string | null; avatar_url: string | null; email: string | null; created_at: string; versao_termos: string | null; aceite_termos_em: string | null }

export default function PerfilPage() {
  const { user } = useAuth()
  const { estado } = useAcesso()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [novoEmail, setNovoEmail] = useState('')
  const [trocandoEmail, setTrocandoEmail] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const inputFoto = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('nome, telefone, data_nascimento, avatar_url, email, created_at, versao_termos, aceite_termos_em')
      .eq('id', user.id).single().then(async ({ data }) => {
        if (!data) return
        setPerfil(data as Perfil)
        setNome(data.nome ?? user.user_metadata?.nome ?? ''); setTelefone(data.telefone ?? ''); setNascimento(data.data_nascimento ?? '')
        // Data de nascimento informada na meta diária vale para o perfil também
        if (!data.data_nascimento) {
          const { data: meta } = await supabase.from('metas_nutricionais').select('nascimento').eq('user_id', user.id).maybeSingle()
          if (meta?.nascimento) setNascimento(meta.nascimento)
        }
        if (data.avatar_url) {
          // Bucket privado: URL temporária assinada
          const { data: s } = await supabase.storage.from('avatars').createSignedUrl(data.avatar_url, 3600)
          setFotoUrl(s?.signedUrl ?? null)
        }
      })
  }, [user])

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (nome.trim().length < 2) { setMsg({ tipo: 'erro', texto: 'Informe seu nome.' }); return }
    if (telefone && !/^[\d\s()+-]{8,20}$/.test(telefone)) { setMsg({ tipo: 'erro', texto: 'Telefone inválido.' }); return }
    if (nascimento && (Date.parse(nascimento) > Date.now() || Date.parse(nascimento) < Date.parse('1900-01-01'))) { setMsg({ tipo: 'erro', texto: 'Data de nascimento inválida.' }); return }
    setSalvando(true)
    const { error } = await supabase.from('profiles').update({
      nome: nome.trim().slice(0, 120), telefone: telefone.trim() || null, data_nascimento: nascimento || null,
    }).eq('id', user!.id)
    if (!error) await supabase.auth.updateUser({ data: { nome: nome.trim().slice(0, 120) } })
    setSalvando(false)
    setMsg(error ? { tipo: 'erro', texto: 'Não foi possível salvar. Tente novamente.' } : { tipo: 'ok', texto: 'Dados atualizados.' })
  }

  const enviarFoto = async (arquivo: File) => {
    setMsg(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) { setMsg({ tipo: 'erro', texto: 'Use uma imagem JPG, PNG ou WEBP.' }); return }
    if (arquivo.size > 2 * 1024 * 1024) { setMsg({ tipo: 'erro', texto: 'A imagem deve ter até 2 MB.' }); return }
    setEnviandoFoto(true)
    const caminho = `${user!.id}/avatar-${Date.now()}.${arquivo.type.split('/')[1]}`
    const { error } = await supabase.storage.from('avatars').upload(caminho, arquivo, { contentType: arquivo.type })
    if (!error) {
      if (perfil?.avatar_url) await supabase.storage.from('avatars').remove([perfil.avatar_url])
      await supabase.from('profiles').update({ avatar_url: caminho }).eq('id', user!.id)
      const { data: s } = await supabase.storage.from('avatars').createSignedUrl(caminho, 3600)
      setFotoUrl(s?.signedUrl ?? null)
      setPerfil(p => p && { ...p, avatar_url: caminho })
    }
    setEnviandoFoto(false)
    setMsg(error ? { tipo: 'erro', texto: 'Não foi possível enviar a foto.' } : { tipo: 'ok', texto: 'Foto atualizada.' })
  }

  const trocarEmail = async () => {
    setMsg(null)
    if (!validarEmail(novoEmail)) { setMsg({ tipo: 'erro', texto: 'Informe um e-mail válido.' }); return }
    const { error } = await supabase.auth.updateUser({ email: novoEmail.trim() }, { emailRedirectTo: `${window.location.origin}/perfil` })
    setMsg(error ? { tipo: 'erro', texto: traduzirErroAuth(error.message) } : { tipo: 'ok', texto: 'Enviamos links de confirmação para o e-mail atual e o novo. A troca vale após a confirmação.' })
    if (!error) { setNovoEmail(''); setTrocandoEmail(false) }
  }

  if (!perfil) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Perfil</h1>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm rounded-xl px-3 py-2 border ${msg.tipo === 'erro' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-green-400 bg-green-500/10 border-green-500/20'}`}>{msg.texto}</p>}

      <div className="flex items-center gap-4">
        <button onClick={() => inputFoto.current?.click()} className="relative w-20 h-20 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center" aria-label="Alterar foto de perfil">
          {fotoUrl ? <img src={fotoUrl} alt="Foto de perfil" className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-zinc-500">{(nome || '?')[0]?.toUpperCase()}</span>}
          <span className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 flex justify-center">{enviandoFoto ? <Spinner size="sm" /> : <Camera className="w-3.5 h-3.5" />}</span>
        </button>
        <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => e.target.files?.[0] && enviarFoto(e.target.files[0])} />
        <div className="text-sm"><p className="font-semibold">{perfil.email}</p><p className="text-zinc-500">Membro desde {dataBR(perfil.created_at)}</p></div>
      </div>

      <Card>
        <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
          <Input label="Nome" value={nome} onChange={e => setNome(e.target.value)} maxLength={120} autoComplete="name" />
          <Input label="Telefone (opcional)" value={telefone} onChange={e => setTelefone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" />
          <Input label="E-mail" value={perfil.email ?? user?.email ?? ''} readOnly disabled hint="Para trocar, use “Alterar e-mail” abaixo." />
          <Input label="Data de nascimento (opcional)" type="date" value={nascimento} onChange={e => setNascimento(e.target.value)} />
          <Button type="submit" loading={salvando}>Salvar alterações</Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Alterar e-mail</h2>
            <p className="text-sm text-zinc-500 truncate">Atual: {perfil.email ?? user?.email}</p>
          </div>
          {!trocandoEmail && <Button variant="secondary" size="sm" onClick={() => setTrocandoEmail(true)}>Alterar</Button>}
        </div>
        {trocandoEmail && (
          <div className="flex flex-col gap-3 mt-3">
            <Input label="Novo e-mail" type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} autoComplete="email" autoFocus />
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => { setTrocandoEmail(false); setNovoEmail('') }}>Cancelar</Button>
              <Button variant="secondary" className="flex-1" onClick={trocarEmail}>Solicitar troca</Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Dados da conta</h2>
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-zinc-400">E-mail confirmado</dt><dd>{user?.email_confirmed_at ? 'Sim' : 'Não'}</dd>
          <dt className="text-zinc-400">Assinatura</dt><dd>{ROTULO_ESTADO[estado].texto}</dd>
          <dt className="text-zinc-400">Termos aceitos</dt><dd>{perfil.versao_termos ? `Versão ${perfil.versao_termos} em ${dataBR(perfil.aceite_termos_em)}` : 'Não registrado'}</dd>
          <dt className="text-zinc-400">ID da conta</dt><dd className="break-all text-zinc-500 text-xs">{user?.id}</dd>
        </dl>
      </Card>
    </div>
  )
}
