import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Input, Spinner } from '../components/UI'
import { Logo } from '../components/Logo'
import { traduzirErroAuth, validarSenha } from '../lib/formatos'

export default function RedefinirSenhaPage() {
  const navigate = useNavigate()
  const [pronto, setPronto] = useState<'aguardando' | 'ok' | 'invalido'>('aguardando')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    // O link do e-mail cria uma sessão temporária de recuperação (evento PASSWORD_RECOVERY)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'PASSWORD_RECOVERY' || (sessao && evento === 'SIGNED_IN')) setPronto('ok')
    })
    const erroUrl = new URLSearchParams(window.location.hash.slice(1)).get('error_description')
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto('ok')
      else if (erroUrl) setPronto('invalido')
    })
    const t = setTimeout(() => setPronto(p => (p === 'aguardando' ? 'invalido' : p)), 6000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const erroSenha = validarSenha(senha)
    if (erroSenha) { setErro(erroSenha); return }
    if (senha !== confirmar) { setErro('As senhas não conferem.'); return }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) { setErro(traduzirErroAuth(error.message)); return }
    setConcluido(true)
    setTimeout(() => navigate('/dashboard', { replace: true }), 1500)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      <Link to="/" className="mb-8"><Logo tamanho="lg" /></Link>
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h1 className="text-lg font-bold mb-3">Criar nova senha</h1>
        {pronto === 'aguardando' && <div className="flex justify-center py-6"><Spinner /></div>}
        {pronto === 'invalido' && (
          <div className="text-sm text-zinc-300">
            <p>O link é inválido ou expirou.</p>
            <Link to="/recuperar-senha" className="text-green-400 underline mt-3 inline-block">Solicitar um novo link</Link>
          </div>
        )}
        {pronto === 'ok' && (concluido ? (
          <p role="status" className="text-green-400 text-sm">Senha alterada com sucesso! Redirecionando…</p>
        ) : (
          <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
            <Input label="Nova senha" type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números." />
            <Input label="Confirmar nova senha" type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)} autoComplete="new-password" />
            {erro && <p role="alert" className="text-red-400 text-sm">{erro}</p>}
            <Button type="submit" loading={salvando} className="w-full">Salvar nova senha</Button>
          </form>
        ))}
      </div>
    </div>
  )
}
