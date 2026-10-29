import { useEffect, useId, useRef, useState } from 'react'
import { Spinner } from './UI'

// Formulário de cartão do Mercado Pago (Card Payment Brick). Os dados do cartão
// são digitados em campos seguros do Mercado Pago e viram um token de uso único:
// o app nunca vê nem armazena o número do cartão.

const SDK_URL = 'https://sdk.mercadopago.com/js/v2'

interface DadosCartao { token: string; payment_method_id?: string; issuer_id?: string }

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MercadoPago?: any
  }
}

let carregando: Promise<void> | null = null
function carregarSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve()
  if (!carregando) {
    carregando = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SDK_URL
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { carregando = null; reject(new Error('sdk')) }
      document.head.appendChild(s)
    })
  }
  return carregando
}

export default function CartaoMercadoPago({ publicKey, valorCentavos, email, onToken }: {
  publicKey: string
  valorCentavos: number
  email: string
  /** Recebe o token do cartão; rejeite a promessa com uma mensagem para mostrá-la ao cliente. */
  onToken: (dados: DadosCartao) => Promise<void>
}) {
  const id = 'cartao-mp-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    let vivo = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let controle: any = null
    carregarSdk().then(async () => {
      if (!vivo) return
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' })
      controle = await mp.bricks().create('cardPayment', id, {
        initialization: { amount: valorCentavos / 100, payer: { email } },
        customization: {
          visual: { style: { theme: 'dark' }, texts: { formTitle: 'Cartão de crédito', formSubmit: 'Assinar com cartão' } },
          // Renovação automática exige cartão de crédito, cobrado à vista todo mês
          paymentMethods: { maxInstallments: 1, minInstallments: 1, types: { excluded: ['debit_card'] } },
        },
        callbacks: {
          onReady: () => { if (vivo) setEstado('pronto') },
          onSubmit: (dados: DadosCartao) => onTokenRef.current(dados),
          onError: () => { if (vivo) setEstado(e => (e === 'carregando' ? 'erro' : e)) },
        },
      })
      if (!vivo) controle?.unmount?.()
    }).catch(() => { if (vivo) setEstado('erro') })
    return () => { vivo = false; controle?.unmount?.() }
  }, [publicKey, valorCentavos, email, id])

  return (
    <div>
      {estado === 'carregando' && <div className="flex justify-center py-6"><Spinner /></div>}
      {estado === 'erro' && (
        <p className="text-sm text-red-400">Não foi possível carregar o formulário de cartão. Verifique sua conexão ou escolha Pix/boleto.</p>
      )}
      <div id={id} />
    </div>
  )
}
