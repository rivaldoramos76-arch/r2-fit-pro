import { Link } from 'react-router-dom'
import { Dumbbell, Salad, Flame, Timer, Sparkles, ShieldCheck, Check } from 'lucide-react'
import PublicLayout from '../components/PublicLayout'
import { useAuth } from '../context/AuthContext'
import { useConfig } from '../lib/config'
import { brl } from '../lib/formatos'
import { FAQ_COMERCIAL } from '../lib/faq'
import { Spinner } from '../components/UI'

const RECURSOS = [
  { icon: Dumbbell, titulo: 'Treinos sob medida', texto: 'Planos gerados por IA a partir do seu objetivo, nível e equipamentos — ou monte o seu com o catálogo de exercícios.' },
  { icon: Timer, titulo: 'Contador com áudio', texto: 'Séries, execução e descanso cronometrados com voz, para você treinar sem olhar o celular.' },
  { icon: Salad, titulo: 'Dieta personalizada', texto: 'Planos alimentares com refeições, quantidades e macros calculados para a sua meta.' },
  { icon: Flame, titulo: 'Contador de calorias', texto: 'Registre refeições descrevendo o que comeu ou enviando uma foto, e acompanhe o dia a dia.' },
]

export default function LandingPage() {
  const { user } = useAuth()
  const { config, erro } = useConfig()
  const cta = user ? '/assinatura' : '/auth?modo=cadastro&next=/assinatura'
  const plano = config?.plano

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="text-center pt-8 pb-12 sm:pt-16">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <Sparkles className="w-3.5 h-3.5" /> Treino e dieta com inteligência artificial
        </span>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-5 leading-tight">
          Seu personal de bolso para <span className="text-green-500">treinar e comer melhor</span>
        </h1>
        <p className="text-zinc-400 mt-4 max-w-xl mx-auto">
          O R2 Fit Pro monta seus treinos, conduz cada série com áudio, cria seu plano alimentar e conta suas calorias — tudo em um só app.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to={cta} className="bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold px-6 py-3.5 rounded-xl">
            {plano ? `Assinar por ${brl(plano.preco_centavos)}/mês` : 'Assinar agora'}
          </Link>
          {!user && <Link to="/auth" className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold px-6 py-3.5 rounded-xl">Já tenho conta</Link>}
        </div>
      </section>

      {/* Recursos */}
      <section aria-labelledby="recursos" className="py-8">
        <h2 id="recursos" className="text-2xl font-bold text-center mb-8">Tudo o que você precisa para evoluir</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {RECURSOS.map(({ icon: Icon, titulo, texto }) => (
            <div key={titulo} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center mb-3"><Icon className="w-5 h-5 text-green-400" /></div>
              <h3 className="font-semibold">{titulo}</h3>
              <p className="text-sm text-zinc-400 mt-1">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Preço */}
      <section id="precos" aria-labelledby="titulo-preco" className="py-12">
        <div className="max-w-md mx-auto bg-gradient-to-b from-green-500/15 to-zinc-900 border border-green-500/30 rounded-3xl p-6 sm:p-8">
          {!plano ? (
            <div className="flex justify-center py-10">{erro ? <p className="text-sm text-zinc-400">{erro}</p> : <Spinner />}</div>
          ) : (
            <>
              <h2 id="titulo-preco" className="text-lg font-semibold">{plano.nome}</h2>
              <p className="mt-3"><span className="text-4xl font-bold">{brl(plano.preco_centavos)}</span><span className="text-zinc-400">/mês</span></p>
              {plano.preco_anual_centavos ? (
                <p className="text-sm text-zinc-300 mt-1">ou <b>{brl(plano.preco_anual_centavos)}</b> no plano anual{(plano.parcelas_max_anual ?? 12) > 1 ? ` (até ${plano.parcelas_max_anual ?? 12}x)` : ''}</p>
              ) : null}
              <p className="text-xs text-zinc-500 mt-1">Pague com cartão de crédito (renovação automática), Pix, boleto ou débito. Não precisa ter conta no Mercado Pago. Cancele quando quiser.</p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {plano.beneficios.map(b => (
                  <li key={b} className="flex gap-2 text-sm text-zinc-300"><Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />{b}</li>
                ))}
              </ul>
              {plano.vendas_ativas ? (
                <Link to={cta} className="mt-7 block text-center bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold px-6 py-3.5 rounded-xl">Assinar agora</Link>
              ) : (
                <p className="mt-7 text-center text-sm text-yellow-300">Novas assinaturas temporariamente indisponíveis.</p>
              )}
              <p className="flex items-center gap-1.5 justify-center text-xs text-zinc-500 mt-4">
                <ShieldCheck className="w-3.5 h-3.5" /> {plano.arrependimento_dias} dias para desistir com reembolso integral
              </p>
            </>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="py-8 max-w-2xl mx-auto">
        <h2 id="faq" className="text-2xl font-bold text-center mb-6">Perguntas frequentes</h2>
        <div className="flex flex-col gap-3">
          {FAQ_COMERCIAL.map(({ p, r }) => (
            <details key={p} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 group">
              <summary className="font-medium cursor-pointer list-none flex justify-between gap-3">{p}<span className="text-zinc-500 group-open:rotate-45 transition">+</span></summary>
              <p className="text-sm text-zinc-400 mt-3">{r}</p>
            </details>
          ))}
        </div>
        <p className="text-xs text-zinc-500 text-center mt-8">
          Ao assinar, você concorda com os <Link to="/termos" className="underline">Termos de Uso</Link> e a <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
        </p>
      </section>
    </PublicLayout>
  )
}
