import { useState } from 'react'
import { Download, Share, PlusSquare, MoreVertical, Copy, MessageCircle, CheckCircle2, ExternalLink } from 'lucide-react'
import { Logo } from './Logo'
import { Button } from './UI'
import { detectarSistema, navegadorEmbutido, continuarNoNavegador, LINK_APP_ANDROID } from '../lib/instalacao'
import { useConfig, linkWhatsapp } from '../lib/config'

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm text-zinc-300 leading-snug">
      <span className="w-6 h-6 rounded-full bg-green-500 text-zinc-950 text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}

/** Tela que pede para instalar o app na tela inicial antes de usar (só no celular). */
export default function TelaInstalar({ aoContinuar }: { aoContinuar: () => void }) {
  const sistema = detectarSistema()
  const embutido = navegadorEmbutido()
  const { config } = useConfig()
  const [instalou] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const site = window.location.origin
  const whatsapp = linkWhatsapp(config, 'Olá! Não estou conseguindo instalar o R2 Fit Pro no celular.')

  const copiar = async () => { try { await navigator.clipboard.writeText(`${site}/dashboard`); setCopiado(true) } catch { /* sem permissão */ } }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-3">
          <Logo tamanho="lg" />
          <h1 className="text-2xl font-bold">{instalou ? 'App instalado!' : 'Instale o R2 Fit Pro'}</h1>
          <p className="text-sm text-zinc-400">
            {instalou ? 'Agora feche o navegador e abra o R2 Fit Pro pelo ícone na tela inicial.'
              : sistema === 'android'
                ? 'No Android, o R2 Fit Pro é usado pelo app: contador com a tela bloqueada e por cima da música, lembretes e alarmes. Leva 1 minuto.'
                : 'O app é usado pela tela inicial do celular: abre em tela cheia, mais rápido, com lembretes e notificações. Leva menos de 1 minuto.'}
          </p>
        </div>

        {instalou ? (
          <div className="rounded-2xl bg-green-500/10 border border-green-500/25 p-4 flex gap-3 items-start">
            <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
            <p className="text-sm text-green-100">Procure o ícone preto com o raio verde. Se pedir, entre de novo com seu e-mail e senha.</p>
          </div>
        ) : embutido ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold">Abra no {sistema === 'iphone' ? 'Safari' : 'Chrome'} para instalar</p>
            <p className="text-xs text-zinc-400">Você abriu o link dentro de outro app (Instagram, WhatsApp…), que não instala aplicativos.</p>
            <ol className="flex flex-col gap-2.5">
              {sistema === 'android'
                ? <Passo n={1}>Toque no botão abaixo para abrir no <b>Chrome</b>.</Passo>
                : <Passo n={1}>Toque nos <b>três pontinhos</b> ou em <b>Compartilhar</b> e escolha <b>Abrir no Safari</b>.</Passo>}
              <Passo n={2}>No navegador, siga o passo a passo para instalar.</Passo>
            </ol>
            {sistema === 'android' && (
              <a href={`intent://${window.location.host}/dashboard#Intent;scheme=https;package=com.android.chrome;end`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 text-zinc-950 font-semibold text-sm px-4 py-3"><ExternalLink className="w-4 h-4" />Abrir no Chrome</a>
            )}
            <Button variant="secondary" onClick={copiar}><Copy className="w-4 h-4" />{copiado ? 'Link copiado' : 'Copiar o link'}</Button>
          </div>
        ) : sistema === 'android' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
            <a href={LINK_APP_ANDROID} download="r2-fit-pro.apk"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 text-zinc-950 font-bold px-4 py-3.5"><Download className="w-5 h-5" />Baixar o app</a>
            <ol className="flex flex-col gap-2.5">
              <Passo n={1}>Toque em <b>Baixar o app</b> e espere terminar.</Passo>
              <Passo n={2}>Abra o arquivo <b>r2-fit-pro.apk</b> (na notificação ou em <b>Downloads</b>).</Passo>
              <Passo n={3}>Se o Android pedir, permita <b>instalar apps desta fonte</b> e volte.</Passo>
              <Passo n={4}>Toque em <b>Instalar</b>. Se o Play Protect avisar, toque em <b>Instalar mesmo assim</b>.</Passo>
              <Passo n={5}>Abra o <b>R2 Fit Pro</b> e entre com seu e-mail e senha.</Passo>
            </ol>
            <p className="text-[11px] text-zinc-500">Se você usava o atalho antigo do Chrome, pode apagá-lo depois de instalar o app.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <ol className="flex flex-col gap-2.5">
              {sistema === 'iphone' ? (
                <>
                  <Passo n={1}>No <b>Safari</b>, toque em <b>Compartilhar</b> <Share className="inline w-4 h-4 -mt-0.5" /> (quadrado com seta, na barra de baixo).</Passo>
                  <Passo n={2}>Role a lista e toque em <b>Adicionar à Tela de Início</b> <PlusSquare className="inline w-4 h-4 -mt-0.5" />.</Passo>
                  <Passo n={3}>Toque em <b>Adicionar</b>.</Passo>
                  <Passo n={4}>Abra o <b>R2 Fit Pro</b> pelo ícone e entre com seu e-mail e senha.</Passo>
                </>
              ) : (
                <>
                  <Passo n={1}>No <b>Chrome</b>, toque nos <b>três pontinhos</b> <MoreVertical className="inline w-4 h-4 -mt-0.5" /> no canto de cima.</Passo>
                  <Passo n={2}>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</Passo>
                  <Passo n={3}>Confirme em <b>Instalar</b>.</Passo>
                  <Passo n={4}>Abra o <b>R2 Fit Pro</b> pelo ícone na tela inicial.</Passo>
                </>
              )}
            </ol>
            {sistema === 'iphone' && <p className="text-xs text-zinc-500 mt-3">No iPhone, a instalação é feita pelo Safari.</p>}
          </div>
        )}

        <div className="text-center">
          {!ajuda ? (
            <button onClick={() => setAjuda(true)} className="text-xs text-zinc-500 underline underline-offset-2">Não consigo instalar</button>
          ) : (
            <div className="flex flex-col gap-2 items-center">
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-green-400"><MessageCircle className="w-4 h-4" />Pedir ajuda no WhatsApp</a>
              )}
              {sistema !== 'android' && (
                <button onClick={() => { continuarNoNavegador(); aoContinuar() }} className="text-xs text-zinc-500 underline underline-offset-2">Usar no navegador só desta vez</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
