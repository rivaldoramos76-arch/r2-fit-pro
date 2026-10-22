import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAcesso } from '../context/AcessoContext'
import { useConfig } from '../lib/config'
import { chamarApi, ErroApi } from '../lib/api'
import { brl, dataBR, ROTULO_ESTADO } from '../lib/formatos'
import { Badge, Button, Card, Spinner } from '../components/UI'

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
}

const MP_ASSINATURAS = 'https://www.mercadopago.com.br/subscriptions'

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
  const [processando, setProcessando] = useState<'checkout' | 'sincronizar' | 'cancelar' | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  const [pedirReembolso, setPedirReembolso] = useState(false)
  const [pagamentosConfigurados, setPagamentosConfigurados] = useState<boolean | null>(null)

  const carregar = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase.from('subscriptions')
      .select('id, status, plano_nome, preco_centavos, iniciada_em, periodo_atual_fim, proxima_cobranca, cancelada_em, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(5)
    if (error) setErro('Não foi possível carregar sua assinatura. Verifique sua conexão.')
    // Mostra a assinatura com acesso vigente; senão, a mais recente
    const lista = (data ?? []) as Assinatura[]
    const vigente = lista.find(s => ['ativa', 'inadimplente', 'cancelada'].includes(s.status) && s.periodo_atual_fim && Date.parse(s.periodo_atual_fim) > Date.now())
    setAssinatura(vigente ?? lista[0] ?? null)
    setCarregando(false)
  }, [user])

  useEffect(() => {
    carregar()
    chamarApi<{ pagamentos_configurados: boolean }>('billing', { acao: 'config' })
      .then(r => setPagamentosConfigurados(r.pagamentos_configurados))
      .catch(() => setPagamentosConfigurados(null))
  }, [carregar])

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

  const sincronizar = async () => {
    setErro(''); setAviso(''); setProcessando('sincronizar')
    try {
      await chamarApi('billing', { acao: 'sincronizar' })
      await Promise.all([carregar(), recarregar()])
      setAviso('Status atualizado com o Mercado Pago.')
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível verificar o pagamento.')
    } finally { setProcessando(null) }
  }

  const cancelar = async () => {
    setErro(''); setAviso(''); setProcessando('cancelar')
    try {
      const r = await chamarApi<{ reembolsado: boolean }>('billing', { acao: 'cancelar', reembolso: pedirReembolso })
      setConfirmarCancelamento(false)
      await Promise.all([carregar(), recarregar()])
      setAviso(r.reembolsado
        ? 'Assinatura cancelada e reembolso integral solicitado ao Mercado Pago. O acesso Premium foi encerrado.'
        : 'Assinatura cancelada. Não haverá novas cobranças e seu acesso continua até o fim do período pago.')
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível cancelar agora. Tente novamente ou fale com o suporte.')
    } finally { setProcessando(null) }
  }

  if (carregando) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const rotulo = ROTULO_ESTADO[estado]
  const plano = config?.plano
  const dentroArrependimento = !!(assinatura?.iniciada_em && plano &&
    Date.now() - Date.parse(assinatura.iniciada_em) <= plano.arrependimento_dias * 86400000)
  const podeCancelar = !!assinatura && ['ativa', 'inadimplente', 'pendente'].includes(assinatura.status)
  const podeAssinar = ['sem_assinatura', 'expirada', 'pagamento_pendente', 'cancelada_vigente'].includes(estado)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Minha Assinatura</h1>
        <div className="mt-2"><Badge variant={rotulo.cor}>{rotulo.texto}</Badge></div>
      </div>

      {erro && <p role="alert" className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{erro}</p>}
      {aviso && <p role="status" className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">{aviso}</p>}

      {estado === 'admin' && (
        <Card><p className="text-sm text-zinc-300">Contas administrativas têm acesso completo sem assinatura.</p></Card>
      )}

      {assinatura && (
        <Card>
          <h2 className="font-semibold mb-2">{assinatura.plano_nome}</h2>
          <Linha rotulo="Preço contratado" valor={`${brl(assinatura.preco_centavos)}/mês`} />
          <Linha rotulo="Situação" valor={rotulo.texto} />
          <Linha rotulo="Início" valor={dataBR(assinatura.iniciada_em)} />
          {assinatura.periodo_atual_fim && (
            <Linha rotulo={assinatura.status === 'cancelada' ? 'Acesso até' : 'Período pago até'} valor={dataBR(assinatura.periodo_atual_fim)} />
          )}
          {assinatura.status !== 'cancelada' && <Linha rotulo="Próxima cobrança" valor={assinatura.proxima_cobranca ? dataBR(assinatura.proxima_cobranca) : 'Após a confirmação do pagamento'} />}
          {assinatura.cancelada_em && <Linha rotulo="Cancelada em" valor={dataBR(assinatura.cancelada_em)} />}
        </Card>
      )}

      {plano && podeAssinar && estado !== 'admin' && (
        <Card className="border-green-500/30">
          <h2 className="font-semibold">{plano.nome}</h2>
          <p className="mt-1"><span className="text-3xl font-bold">{brl(plano.preco_centavos)}</span><span className="text-zinc-400">/mês</span></p>
          <ul className="text-sm text-zinc-400 mt-3 list-disc pl-5 flex flex-col gap-1">
            {plano.beneficios.slice(0, 4).map(b => <li key={b}>{b}</li>)}
          </ul>
          <p className="text-xs text-zinc-500 mt-3">
            Cobrança mensal recorrente no cartão via Mercado Pago, renovada automaticamente até o cancelamento. Cancele quando quiser;
            em até {plano.arrependimento_dias} dias da contratação o reembolso é integral. Ao assinar você concorda com os <Link to="/termos" className="underline">Termos de Uso</Link>.
          </p>
          {pagamentosConfigurados === false ? (
            <p className="mt-4 text-sm text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">As assinaturas ainda não estão disponíveis. Tente novamente em breve.</p>
          ) : !plano.vendas_ativas ? (
            <p className="mt-4 text-sm text-yellow-300">Novas assinaturas temporariamente suspensas.</p>
          ) : (
            <Button onClick={assinar} loading={processando === 'checkout'} size="lg" className="w-full mt-4">
              {estado === 'pagamento_pendente' ? 'Pagar / tentar novamente' : estado === 'cancelada_vigente' ? 'Reativar assinatura' : 'Assinar com Mercado Pago'}
            </Button>
          )}
          {!user?.email_confirmed_at && <p className="text-xs text-yellow-300 mt-2">Confirme seu e-mail para assinar.</p>}
        </Card>
      )}

      {assinatura && (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={sincronizar} loading={processando === 'sincronizar'}>
            <RefreshCw className="w-4 h-4" /> Verificar pagamento no Mercado Pago
          </Button>
          <a href={MP_ASSINATURAS} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-4 py-2.5">
            <ExternalLink className="w-4 h-4" /> Atualizar forma de pagamento no Mercado Pago
          </a>
          <Link to="/pagamentos" className="text-center text-sm text-green-400 underline py-2">Ver histórico de pagamentos</Link>
        </div>
      )}

      {podeCancelar && (
        <Card className="border-red-500/20">
          {!confirmarCancelamento ? (
            <button onClick={() => setConfirmarCancelamento(true)} className="text-red-400 text-sm font-semibold w-full text-left">Cancelar assinatura</button>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="font-semibold text-red-300">Confirmar cancelamento</h2>
              <p className="text-sm text-zinc-300">
                Não haverá novas cobranças.{assinatura?.periodo_atual_fim && Date.parse(assinatura.periodo_atual_fim) > Date.now()
                  ? ` Você mantém o acesso Premium até ${dataBR(assinatura.periodo_atual_fim)}.` : ''} Seus treinos, dietas e registros continuam salvos.
              </p>
              {dentroArrependimento && (
                <label className="flex items-start gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={pedirReembolso} onChange={e => setPedirReembolso(e.target.checked)} className="mt-1 accent-green-500" />
                  <span>Estou dentro do prazo de {plano?.arrependimento_dias} dias e quero o <b>reembolso integral</b> (o acesso Premium termina imediatamente).</span>
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmarCancelamento(false)} disabled={processando === 'cancelar'}>Manter assinatura</Button>
                <Button variant="danger" className="flex-1" onClick={cancelar} loading={processando === 'cancelar'}>Confirmar cancelamento</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
