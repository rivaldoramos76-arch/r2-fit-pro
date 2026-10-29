import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, CreditCard, QrCode, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAcesso } from '../context/AcessoContext'
import { useConfig } from '../lib/config'
import { chamarApi, ErroApi } from '../lib/api'
import { brl, dataBR, ROTULO_ESTADO } from '../lib/formatos'
import { Badge, Button, Card, Spinner } from '../components/UI'
import CartaoMercadoPago from '../components/CartaoMercadoPago'

interface Assinatura {
  id: string
  status: string
  plano_nome: string
  preco_centavos: number
  iniciada_em: string | null
  periodo_atual_fim: string | null
  proxima_cobranca: string | null
  cancelada_em: string | null
  created_at: string
  modalidade: 'recorrente' | 'avulso' | 'cortesia' | 'teste'
  meses_periodo: number
}

type Periodo = 'mensal' | 'anual'
type Forma = 'cartao' | 'avulso'

/** Aviso em destaque no meio da tela: erros e confirmações de pagamento não passam despercebidos. */
function Popup({ tipo, texto, onFechar, acaoExtra }: {
  tipo: 'erro' | 'ok'; texto: string; onFechar: () => void
  acaoExtra?: { rotulo: string; onClick: () => void }
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onFechar])
  const erro = tipo === 'erro'
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-5" onClick={onFechar}>
      <div role={erro ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="popup-titulo" aria-describedby="popup-texto"
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border bg-zinc-900 p-5 shadow-2xl ${erro ? 'border-red-500/40' : 'border-green-500/40'}`}>
        <div className="flex items-center gap-3">
          {erro ? <XCircle className="w-8 h-8 text-red-400 shrink-0" /> : <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />}
          <h2 id="popup-titulo" className="text-lg font-bold">{erro ? 'Pagamento não concluído' : 'Tudo certo'}</h2>
        </div>
        <p id="popup-texto" className="mt-3 text-sm text-zinc-300 leading-relaxed">{texto}</p>
        <div className="mt-5 flex flex-col gap-2">
          {acaoExtra && <Button onClick={acaoExtra.onClick} className="w-full">{acaoExtra.rotulo}</Button>}
          <Button autoFocus variant={acaoExtra ? 'secondary' : 'primary'} onClick={onFechar} className="w-full">
            {erro ? (acaoExtra ? 'Tentar de novo' : 'Entendi') : 'Ok'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-zinc-800 last:border-0 text-sm">
      <span className="text-zinc-400">{rotulo}</span><span className="text-right font-medium">{valor}</span>
    </div>
  )
}

export default function AssinaturaPage() {
  const { user } = useAuth()
  const { estado, recarregar } = useAcesso()
  const { config } = useConfig()
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [carregando, setCarregando] = useState(true)
  const navigate = useNavigate()
  const [processando, setProcessando] = useState<'checkout' | 'cancelar' | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('mensal')
  const [forma, setForma] = useState<Forma>('cartao')
  const [trocandoCartao, setTrocandoCartao] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  // Quando o cartão é recusado, o aviso oferece pagar por Pix, boleto ou outros
  const [sugerirOutraForma, setSugerirOutraForma] = useState(false)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  const [pedirReembolso, setPedirReembolso] = useState(false)
  const [pagamentosConfigurados, setPagamentosConfigurados] = useState<boolean | null>(null)

  const carregar = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase.from('subscriptions')
      .select('id, status, plano_nome, preco_centavos, iniciada_em, periodo_atual_fim, proxima_cobranca, cancelada_em, created_at, modalidade, meses_periodo')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(5)
    if (error) setErro('Não foi possível carregar sua assinatura. Verifique sua conexão.')
    // Mostra a assinatura com acesso vigente; senão, a mais recente
    // Checkout cancelado sem nunca ter sido pago (ex.: cartão recusado) não é mostrado
    const lista = ((data ?? []) as Assinatura[]).filter(a => !(a.status === 'cancelada' && !a.iniciada_em)
      && !(a.modalidade === 'teste' && (!a.periodo_atual_fim || Date.parse(a.periodo_atual_fim) <= Date.now())))
    const vigente = lista.find(s => ['ativa', 'inadimplente', 'cancelada'].includes(s.status) && s.periodo_atual_fim && Date.parse(s.periodo_atual_fim) > Date.now())
    setAssinatura(vigente ?? lista[0] ?? null)
    setCarregando(false)
  }, [user])

  useEffect(() => {
    carregar()
    chamarApi<{ pagamentos_configurados: boolean; public_key: string | null }>('billing', { acao: 'config' })
      .then(r => { setPagamentosConfigurados(r.pagamentos_configurados); setPublicKey(r.public_key) })
      .catch(() => setPagamentosConfigurados(null))
  }, [carregar])

  // Assinatura pela conta Mercado Pago (usada quando o formulário de cartão não está disponível)
  const assinar = async () => {
    setErro(''); setProcessando('checkout')
    try {
      const r = await chamarApi<{ url: string }>('billing', { acao: 'checkout' })
      window.location.href = r.url
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível iniciar o pagamento.')
      setProcessando(null)
    }
  }

  // Pix, boleto, cartão (à vista ou parcelado no anual), débito ou saldo, no Checkout Pro
  const pagarAvulso = async (p: Periodo) => {
    setErro(''); setProcessando('checkout')
    try {
      const r = await chamarApi<{ url: string }>('billing', { acao: 'checkout_avulso', periodo: p })
      window.location.href = r.url
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível iniciar o pagamento.')
      setProcessando(null)
    }
  }

  const assinarComCartao = async ({ token }: { token: string }) => {
    setErro('')
    try {
      await chamarApi('billing', { acao: 'assinar_cartao', card_token_id: token })
      navigate('/assinatura/retorno?origem=cartao')
    } catch (e) {
      const msg = e instanceof ErroApi ? e.message : 'Não foi possível concluir a assinatura.'
      setSugerirOutraForma(true)
      setErro(/CC_VAL_433|validation/i.test(msg)
        ? 'O cartão não foi aceito para cobrança automática. Use um cartão de crédito (débito não é aceito na renovação automática), confira os dados ou escolha Pix, boleto ou outros.'
        : `${msg} Confira os dados do cartão ou escolha outra forma de pagamento.`)
      throw e
    }
  }

  const trocarCartao = async ({ token }: { token: string }) => {
    setErro(''); setAviso('')
    try {
      await chamarApi('billing', { acao: 'trocar_cartao', card_token_id: token })
      setTrocandoCartao(false)
      setAviso('Cartão atualizado. As próximas cobranças serão feitas no novo cartão.')
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível trocar o cartão.')
      throw e
    }
  }

  const cancelar = async () => {
    setErro(''); setAviso(''); setProcessando('cancelar')
    try {
      const r = await chamarApi<{ reembolsado: boolean; aviso?: string }>('billing', { acao: 'cancelar', reembolso: avulso || pedirReembolso })
      setConfirmarCancelamento(false)
      await Promise.all([carregar(), recarregar()])
      setAviso(r.aviso ?? (r.reembolsado
        ? 'Reembolso integral solicitado ao Mercado Pago. O acesso Premium foi encerrado.'
        : 'Assinatura cancelada. Não haverá novas cobranças e seu acesso continua até o fim do período pago.'))
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível cancelar agora. Tente novamente ou fale com o suporte.')
    } finally { setProcessando(null) }
  }

  if (carregando) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const rotulo = ROTULO_ESTADO[estado]
  const plano = config?.plano
  const avulso = assinatura?.modalidade === 'avulso'
  const cortesia = assinatura?.modalidade === 'cortesia'
  const emTeste = assinatura?.modalidade === 'teste'
  const dentroArrependimento = !!(assinatura?.iniciada_em && plano &&
    Date.now() - Date.parse(assinatura.iniciada_em) <= plano.arrependimento_dias * 86400000)
  const podeCancelar = !!assinatura && ['ativa', 'inadimplente', 'pendente'].includes(assinatura.status) && !cortesia && !emTeste
    && (!avulso || dentroArrependimento)
  const semAcesso = ['sem_assinatura', 'expirada', 'pagamento_pendente', 'cancelada_vigente', 'teste'].includes(estado)
  // Quem paga por período pode renovar antes do vencimento (o tempo comprado se soma)
  const renovacaoAvulsa = avulso && ['ativa', 'tolerancia'].includes(estado)
  const podeComprar = (semAcesso || renovacaoAvulsa) && estado !== 'admin'
  const temAnual = !!plano?.preco_anual_centavos
  const precoAnual = plano?.preco_anual_centavos ?? 0
  const economia = plano && temAnual ? Math.round((1 - precoAnual / (plano.preco_centavos * 12)) * 100) : 0
  const formaEfetiva: Forma = renovacaoAvulsa || periodo === 'anual' ? 'avulso' : forma
  const nomePeriodo = (meses: number) => (meses >= 12 ? 'Anual' : 'Mensal')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Minha Assinatura</h1>
        <div className="mt-2"><Badge variant={rotulo.cor}>{rotulo.texto}</Badge></div>
      </div>

      {erro && (
        <Popup tipo="erro" texto={erro} onFechar={() => { setErro(''); setSugerirOutraForma(false) }}
          acaoExtra={sugerirOutraForma ? { rotulo: 'Pagar com Pix, boleto ou outros', onClick: () => { setErro(''); setSugerirOutraForma(false); setPeriodo('mensal'); setForma('avulso') } } : undefined} />
      )}
      {aviso && !erro && <Popup tipo="ok" texto={aviso} onFechar={() => setAviso('')} />}

      {estado === 'admin' && (
        <Card><p className="text-sm text-zinc-300">Contas administrativas têm acesso completo sem assinatura.</p></Card>
      )}

      {assinatura && (
        <Card>
          <h2 className="font-semibold mb-2">{assinatura.plano_nome}</h2>
          {emTeste ? (
            <Linha rotulo="Tipo" valor="Teste grátis (sem cobrança)" />
          ) : cortesia ? (
            <Linha rotulo="Tipo" valor="Cortesia (sem cobrança)" />
          ) : avulso ? (
            <Linha rotulo="Plano" valor={`${nomePeriodo(assinatura.meses_periodo)} · ${brl(assinatura.preco_centavos)} (pagamento único)`} />
          ) : (
            <Linha rotulo="Preço contratado" valor={`${brl(assinatura.preco_centavos)}/mês`} />
          )}
          <Linha rotulo="Situação" valor={rotulo.texto} />
          <Linha rotulo="Início" valor={dataBR(assinatura.iniciada_em)} />
          {assinatura.periodo_atual_fim && !cortesia && (
            <Linha rotulo={assinatura.status === 'cancelada' || avulso || emTeste ? 'Acesso até' : 'Período pago até'} valor={dataBR(assinatura.periodo_atual_fim)} />
          )}
          {avulso && assinatura.status !== 'cancelada' && <Linha rotulo="Renovação" valor="Manual — avisamos por e-mail antes de vencer" />}
          {!avulso && !cortesia && !emTeste && assinatura.status !== 'cancelada' && <Linha rotulo="Próxima cobrança" valor={assinatura.proxima_cobranca ? dataBR(assinatura.proxima_cobranca) : 'Após a confirmação do pagamento'} />}
          {assinatura.cancelada_em && <Linha rotulo="Cancelada em" valor={dataBR(assinatura.cancelada_em)} />}
        </Card>
      )}

      {plano && podeComprar && (
        <Card className="border-green-500/30">
          <h2 className="font-semibold">{renovacaoAvulsa ? 'Renovar ou adicionar tempo' : estado === 'teste' ? 'Continue com o Premium depois do teste' : plano.nome}</h2>
          {renovacaoAvulsa && <p className="text-xs text-zinc-400 mt-1">O tempo comprado agora é somado ao seu período atual.</p>}
          {estado === 'teste' && assinatura?.periodo_atual_fim && (
            <p className="text-xs text-zinc-400 mt-1">Seu teste grátis vai até {dataBR(assinatura.periodo_atual_fim)}. Assine para não perder o acesso quando ele acabar.</p>
          )}

          {temAnual && (
            <div role="radiogroup" aria-label="Plano" className="grid grid-cols-2 gap-2 mt-3">
              {(['mensal', 'anual'] as Periodo[]).map(p => (
                <button key={p} type="button" role="radio" aria-checked={periodo === p} onClick={() => setPeriodo(p)}
                  className={`rounded-xl border px-3 py-2.5 text-left ${periodo === p ? 'border-green-500 bg-green-500/10' : 'border-zinc-700 bg-zinc-800/50'}`}>
                  <span className="block text-sm font-semibold">{p === 'mensal' ? 'Mensal' : 'Anual'}</span>
                  <span className="block text-xs text-zinc-400">{p === 'mensal' ? `${brl(plano.preco_centavos)}/mês` : `${brl(precoAnual)} por 12 meses`}</span>
                  {p === 'anual' && economia > 0 && <span className="block text-[11px] text-green-400 font-semibold mt-0.5">Economize {economia}%</span>}
                </button>
              ))}
            </div>
          )}

          {periodo === 'mensal' || !temAnual ? (
            <p className="mt-3"><span className="text-3xl font-bold">{brl(plano.preco_centavos)}</span><span className="text-zinc-400">/mês</span></p>
          ) : (
            <p className="mt-3"><span className="text-3xl font-bold">{brl(precoAnual)}</span><span className="text-zinc-400"> por 12 meses</span>
              {(plano.parcelas_max_anual ?? 12) > 1 && <span className="block text-xs text-zinc-400 mt-1">ou em até {plano.parcelas_max_anual ?? 12}x no cartão</span>}</p>
          )}
          {!renovacaoAvulsa && (
            <ul className="text-sm text-zinc-400 mt-3 list-disc pl-5 flex flex-col gap-1">
              {plano.beneficios.slice(0, 4).map(b => <li key={b}>{b}</li>)}
            </ul>
          )}

          {pagamentosConfigurados === false ? (
            <p className="mt-4 text-sm text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">As assinaturas ainda não estão disponíveis. Tente novamente em breve.</p>
          ) : !plano.vendas_ativas ? (
            <p className="mt-4 text-sm text-yellow-300">Novas assinaturas temporariamente suspensas.</p>
          ) : !user?.email_confirmed_at ? (
            <p className="mt-4 text-sm text-yellow-300">Confirme seu e-mail para assinar.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {!renovacaoAvulsa && periodo === 'mensal' && (
                <div role="radiogroup" aria-label="Forma de pagamento" className="flex flex-col gap-2">
                  <button type="button" role="radio" aria-checked={forma === 'cartao'} onClick={() => setForma('cartao')}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${forma === 'cartao' ? 'border-green-500 bg-green-500/10' : 'border-zinc-700 bg-zinc-800/50'}`}>
                    <CreditCard className="w-5 h-5 mt-0.5 text-green-400 shrink-0" />
                    <span><span className="block text-sm font-semibold">Cartão de crédito</span>
                      <span className="block text-xs text-zinc-400">Renovação automática todo mês. Não precisa de conta no Mercado Pago.</span></span>
                  </button>
                  <button type="button" role="radio" aria-checked={forma === 'avulso'} onClick={() => setForma('avulso')}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${forma === 'avulso' ? 'border-green-500 bg-green-500/10' : 'border-zinc-700 bg-zinc-800/50'}`}>
                    <QrCode className="w-5 h-5 mt-0.5 text-green-400 shrink-0" />
                    <span><span className="block text-sm font-semibold">Pix, boleto, débito ou outros</span>
                      <span className="block text-xs text-zinc-400">Paga 1 mês por vez, sem renovação automática. Avisamos antes de vencer.</span></span>
                  </button>
                </div>
              )}

              {formaEfetiva === 'cartao' ? (
                publicKey && user?.email ? (
                  <CartaoMercadoPago publicKey={publicKey} valorCentavos={plano.preco_centavos} email={user.email} onToken={assinarComCartao} />
                ) : (
                  <Button onClick={assinar} loading={processando === 'checkout'} size="lg" className="w-full">Assinar com Mercado Pago</Button>
                )
              ) : (
                <>
                  <Button onClick={() => pagarAvulso(periodo === 'anual' && temAnual ? 'anual' : 'mensal')} loading={processando === 'checkout'} size="lg" className="w-full">
                    {periodo === 'anual' && temAnual ? `Pagar ${brl(precoAnual)} — 12 meses` : `Pagar ${brl(plano.preco_centavos)} — 1 mês`}
                  </Button>
                  <p className="text-xs text-zinc-500 text-center">Pix, boleto, cartão de crédito{periodo === 'anual' ? ' (parcelado)' : ''}, débito ou saldo Mercado Pago. Não precisa ter conta no Mercado Pago.</p>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-zinc-500 mt-3">
            {formaEfetiva === 'cartao'
              ? 'Cobrança mensal recorrente no cartão, renovada automaticamente até o cancelamento. Cancele quando quiser;'
              : 'Pagamento único, sem renovação automática;'} em até {plano.arrependimento_dias} dias da contratação o reembolso é integral.
            Pagamentos processados pelo Mercado Pago. Ao assinar você concorda com os <Link to="/termos" className="underline">Termos de Uso</Link>.
          </p>
        </Card>
      )}

      {assinatura && !cortesia && (
        <div className="flex flex-col gap-2">
          {assinatura.modalidade === 'recorrente' && ['ativa', 'inadimplente'].includes(assinatura.status) && publicKey && user?.email && (
            trocandoCartao ? (
              <Card>
                <h2 className="font-semibold mb-2">Trocar cartão</h2>
                <CartaoMercadoPago publicKey={publicKey} valorCentavos={assinatura.preco_centavos} email={user.email} onToken={trocarCartao} />
                <button onClick={() => setTrocandoCartao(false)} className="text-sm text-zinc-400 underline mt-2">Cancelar troca</button>
              </Card>
            ) : (
              <Button variant="secondary" onClick={() => setTrocandoCartao(true)}><CreditCard className="w-4 h-4" /> Trocar cartão</Button>
            )
          )}
          <Link to="/pagamentos" className="text-center text-sm text-green-400 underline py-2">Ver histórico de pagamentos</Link>
        </div>
      )}

      {podeCancelar && (
        <Card className="border-red-500/20">
          {!confirmarCancelamento ? (
            <button onClick={() => setConfirmarCancelamento(true)} className="text-red-400 text-sm font-semibold w-full text-left">{avulso ? 'Desistir e pedir reembolso' : 'Cancelar assinatura'}</button>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="font-semibold text-red-300">{avulso ? 'Confirmar reembolso' : 'Confirmar cancelamento'}</h2>
              {avulso ? (
                <p className="text-sm text-zinc-300">Você está dentro do prazo de {plano?.arrependimento_dias} dias: o valor pago é devolvido integralmente pelo Mercado Pago e o acesso Premium termina imediatamente. Seus treinos, dietas e registros continuam salvos.</p>
              ) : (<>
              <p className="text-sm text-zinc-300">
                Não haverá novas cobranças.{assinatura?.periodo_atual_fim && Date.parse(assinatura.periodo_atual_fim) > Date.now()
                  ? ` Você mantém o acesso Premium até ${dataBR(assinatura.periodo_atual_fim)}.` : ''} Seus treinos, dietas e registros continuam salvos.
              </p>
              </>)}
              {dentroArrependimento && !avulso && (
                <label className="flex items-start gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={pedirReembolso} onChange={e => setPedirReembolso(e.target.checked)} className="mt-1 accent-green-500" />
                  <span>Estou dentro do prazo de {plano?.arrependimento_dias} dias e quero o <b>reembolso integral</b> (o acesso Premium termina imediatamente).</span>
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmarCancelamento(false)} disabled={processando === 'cancelar'}>{avulso ? 'Manter acesso' : 'Manter assinatura'}</Button>
                <Button variant="danger" className="flex-1" onClick={cancelar} loading={processando === 'cancelar'}>{avulso ? 'Pedir reembolso' : 'Confirmar cancelamento'}</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
