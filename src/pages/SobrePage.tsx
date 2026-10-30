import { Link } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'
import { Documento, Secao } from '../components/Documento'
import { useConfig, ou } from '../lib/config'

export default function SobrePage() {
  const { config } = useConfig()
  const e = config?.empresa
  return (
    <PublicLayout>
      <Documento titulo="Sobre o R2 Fit Pro">
        <Secao titulo="O aplicativo">
          <p>O R2 Fit Pro reúne treino e alimentação em um só lugar: planos de treino gerados por inteligência artificial ou montados por você, contador de séries com áudio, planos alimentares personalizados e contador de calorias por texto ou foto.</p>
          <p>As sugestões são educativas e não substituem o acompanhamento de profissionais de saúde.</p>
        </Secao>
        <Secao titulo="Responsável pelo serviço">
          <p>{ou(e?.razao_social)} — CPF/CNPJ {ou(e?.cnpj)}</p>
          <p>{ou(e?.endereco)}</p>
          <p>Suporte: {ou(e?.email_suporte)}{config?.textos.horario_suporte ? ` (${config.textos.horario_suporte})` : ''}</p>
        </Secao>
        <Secao titulo="Tecnologia e parceiros">
          <p>Hospedagem: Vercel · Banco de dados e autenticação: Supabase · Inteligência artificial: OpenAI · Pagamentos: Asaas (e Mercado Pago para assinaturas anteriores).</p>
        </Secao>
        <Secao titulo="Documentos">
          <p><Link to="/termos" className="text-green-400 underline">Termos de Uso</Link> · <Link to="/privacidade" className="text-green-400 underline">Política de Privacidade</Link> · <Link to="/suporte" className="text-green-400 underline">Ajuda e Suporte</Link></p>
          <p className="text-zinc-500">Versão do aplicativo: {__APP_VERSION__}</p>
        </Secao>
      </Documento>
    </PublicLayout>
  )
}
