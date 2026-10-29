import { Link, useNavigate } from 'react-router-dom'
import {
  Home, Dumbbell, Salad, Flame, User, Settings, CreditCard, Receipt, LifeBuoy, FileText, Shield, Info, LogOut, LayoutDashboard, ChevronRight, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAcesso } from '../context/AcessoContext'
import { Badge } from '../components/UI'
import { brl, diasRestantes, ROTULO_ESTADO } from '../lib/formatos'
import { useConfig } from '../lib/config'

type Item = { href: string; label: string; icon: LucideIcon }
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: 'App', itens: [
    { href: '/dashboard', label: 'Início', icon: Home },
    { href: '/treino', label: 'Meus Treinos', icon: Dumbbell },
    { href: '/dieta', label: 'Dieta', icon: Salad },
    { href: '/calorias', label: 'Contador de Calorias', icon: Flame },
  ] },
  { titulo: 'Conta', itens: [
    { href: '/perfil', label: 'Perfil', icon: User },
    { href: '/configuracoes', label: 'Configurações', icon: Settings },
    { href: '/assinatura', label: 'Minha Assinatura', icon: CreditCard },
    { href: '/pagamentos', label: 'Pagamentos e Faturas', icon: Receipt },
  ] },
  { titulo: 'Informações', itens: [
    { href: '/suporte', label: 'Ajuda e Suporte', icon: LifeBuoy },
    { href: '/termos', label: 'Termos de Uso', icon: FileText },
    { href: '/privacidade', label: 'Política de Privacidade', icon: Shield },
    { href: '/sobre', label: 'Sobre o aplicativo', icon: Info },
  ] },
]

export default function MenuPage() {
  const { user, signOut } = useAuth()
  const { estado, admin, testeAte } = useAcesso()
  const navigate = useNavigate()
  const { config } = useConfig()
  const rotulo = ROTULO_ESTADO[estado]
  const semAcesso = ['sem_assinatura', 'expirada', 'pagamento_pendente', 'teste'].includes(estado)
  const diasTeste = diasRestantes(testeAte)
  const plano = config?.plano

  const sair = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="font-semibold truncate">{user?.user_metadata?.nome ?? user?.email}</p>
        <p className="text-sm text-zinc-500 truncate">{user?.email}</p>
        <Link to="/assinatura" className="inline-block mt-2"><Badge variant={rotulo.cor}>{rotulo.texto}</Badge></Link>
        {semAcesso && (
          <Link to="/assinatura"
            className="mt-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-400 px-4 py-3.5 text-zinc-950 shadow-lg shadow-green-500/20 transition-transform active:scale-[0.98]">
            <Sparkles className="w-6 h-6 shrink-0" />
            <span className="flex-1">
              <span className="block font-bold">{estado === 'pagamento_pendente' ? 'Concluir assinatura' : estado === 'expirada' ? 'Assinar novamente' : 'Assinar o Premium'}</span>
              {plano && (
                <span className="block text-xs font-medium text-zinc-900/80">
                  {estado === 'teste'
                    ? `Seu teste grátis ${diasTeste <= 1 ? 'termina hoje' : `termina em ${diasTeste} dias`} · a partir de ${brl(plano.preco_centavos)}/mês`
                    : `${brl(plano.preco_centavos)}/mês${plano.preco_anual_centavos ? ` ou ${brl(plano.preco_anual_centavos)}/ano` : ''} · Pix, cartão ou boleto`}
                </span>
              )}
            </span>
            <ChevronRight className="w-5 h-5 shrink-0" />
          </Link>
        )}
      </div>

      {admin && (
        <Link to="/admin" className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-blue-300">
          <LayoutDashboard className="w-5 h-5" /><span className="font-semibold flex-1">Painel administrativo</span><ChevronRight className="w-4 h-4" />
        </Link>
      )}

      {GRUPOS.map(g => (
        <nav key={g.titulo} aria-label={g.titulo}>
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-1">{g.titulo}</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800">
            {g.itens.map(({ href, label, icon: Icon }) => (
              <Link key={href} to={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/60 first:rounded-t-2xl last:rounded-b-2xl">
                <Icon className="w-5 h-5 text-zinc-400" strokeWidth={1.8} />
                <span className="flex-1 text-sm">{label}</span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </Link>
            ))}
          </div>
        </nav>
      ))}

      <button onClick={sair} className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-red-500/40 text-red-400 rounded-2xl py-3.5 text-sm font-semibold">
        <LogOut className="w-4 h-4" /> Sair da conta
      </button>
    </div>
  )
}
