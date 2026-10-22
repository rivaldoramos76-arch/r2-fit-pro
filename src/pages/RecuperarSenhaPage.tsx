import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Input } from '../components/UI'
import { Logo } from '../components/Logo'
import { traduzirErroAuth, validarEmail } from '../lib/formatos'

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!validarEmail(email)) { setErro('Informe um e-mail válido.'); return }
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    setEnviando(false)
    // Mensagem neutra: não revela se o e-mail está cadastrado
    if (error && !/user not found/i.test(error.message)) setErro(traduzirErroAuth(error.message))
    else setEnviado(true)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      <Link to="/" className="mb-8"><Logo tamanho="lg" /></Link>
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h1 className="text-lg font-bold mb-1">Recuperar senha</h1>
        {enviado ? (
          <p role="status" className="text-sm text-zinc-300 mt-3">Se existir uma conta com <b>{email}</b>, você receberá um link para criar uma nova senha. Verifique também o spam.</p>
        ) : (
          <form onSubmit={enviar} className="flex flex-col gap-4 mt-3" noValidate>
            <p className="text-sm text-zinc-400">Informe o e-mail da sua conta e enviaremos um link para redefinir a senha.</p>
            <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            {erro && <p role="alert" className="text-red-400 text-sm">{erro}</p>}
            <Button type="submit" loading={enviando} className="w-full">Enviar link</Button>
          </form>
        )}
        <Link to="/auth" className="block text-center text-sm text-zinc-400 hover:text-zinc-200 mt-5">Voltar para o login</Link>
      </div>
    </div>
  )
}
