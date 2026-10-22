import { Link } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'
import { Documento, Secao } from '../components/Documento'
import { useConfig, ou } from '../lib/config'
import { Spinner } from '../components/UI'

export default function PrivacidadePage() {
  const { config } = useConfig()
  if (!config) return <PublicLayout><div className="flex justify-center py-20"><Spinner /></div></PublicLayout>
  const { empresa: e, textos: t } = config
  return (
    <PublicLayout>
      <Documento titulo="Política de Privacidade" versao={t.versao_privacidade}>
        <Secao titulo="1. Controlador e contato">
          <p>O controlador dos dados é {ou(e.razao_social)}, CNPJ {ou(e.cnpj)}, {ou(e.endereco)}.</p>
          <p>Encarregado pelo tratamento de dados (DPO): {ou(e.encarregado_dados)} — e-mail para assuntos de privacidade: {ou(e.email_privacidade ?? e.email_suporte)}.</p>
        </Secao>
        <Secao titulo="2. Dados que coletamos">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li><b>Cadastro:</b> nome, e-mail, senha (armazenada de forma criptografada pelo provedor de autenticação, nunca em texto puro), telefone e data de nascimento (opcionais) e foto de perfil (opcional).</li>
            <li><b>Dados de saúde e hábitos informados por você:</b> peso, altura, idade, sexo, objetivo, nível de atividade, restrições alimentares, treinos, histórico de execução, dietas, refeições e fotos de pratos enviadas para estimativa de calorias. Esses dados podem ser considerados <b>dados pessoais sensíveis</b>.</li>
            <li><b>Assinatura e pagamentos:</b> situação da assinatura, valores, datas e identificadores das transações. <b>Não recebemos nem armazenamos dados de cartão</b>, que são tratados diretamente pelo Mercado Pago.</li>
            <li><b>Uso e segurança:</b> registros técnicos (data/hora de acesso, endereço IP tratado pelos provedores, eventos de erro) e preferências de notificações e áudio.</li>
          </ul>
        </Secao>
        <Secao titulo="3. Finalidades e bases legais">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Criar e manter sua conta e prestar o serviço contratado — execução de contrato (LGPD art. 7º, V).</li>
            <li>Gerar treinos, dietas e estimativas a partir dos seus dados de saúde — consentimento específico e destacado, fornecido ao usar esses recursos (art. 11, I), que pode ser revogado a qualquer momento.</li>
            <li>Processar cobranças, emitir comprovantes e cumprir obrigações fiscais — execução de contrato e obrigação legal (art. 7º, II e V).</li>
            <li>Enviar e-mails transacionais (confirmação de conta, recuperação de senha, cobranças e avisos importantes) — execução de contrato.</li>
            <li>Enviar novidades e dicas — somente com seu consentimento, revogável em Configurações.</li>
            <li>Prevenir fraudes, abusos e garantir a segurança — legítimo interesse (art. 7º, IX).</li>
          </ul>
        </Secao>
        <Secao titulo="4. Com quem compartilhamos (operadores)">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li><b>Supabase</b> — banco de dados, autenticação e armazenamento de arquivos (servidores nos EUA).</li>
            <li><b>Vercel</b> — hospedagem do aplicativo (infraestrutura global).</li>
            <li><b>OpenAI</b> — processamento por inteligência artificial dos dados enviados para gerar treinos, dietas e estimativas de calorias (EUA). Enviamos apenas o necessário para cada solicitação.</li>
            <li><b>Mercado Pago</b> — processamento de pagamentos e assinaturas.</li>
            <li><b>Provedor de e-mail transacional</b> (Resend) — envio de e-mails do serviço.</li>
          </ul>
          <p>Algumas dessas empresas tratam dados fora do Brasil. A transferência internacional ocorre com base nas hipóteses do art. 33 da LGPD, incluindo cláusulas contratuais dos provedores. Não vendemos seus dados pessoais.</p>
        </Secao>
        <Secao titulo="5. Por quanto tempo guardamos">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Dados da conta, treinos, dietas e registros: enquanto a conta existir. Ao excluir a conta, são apagados definitivamente.</li>
            <li>Registros de pagamentos: mantidos de forma desvinculada da conta excluída pelo prazo exigido pela legislação fiscal e contábil (em regra, 5 anos).</li>
            <li>Registros de acesso a aplicações: no mínimo 6 meses (Marco Civil da Internet, art. 15).</li>
            <li>Solicitações de privacidade e logs de auditoria: pelo prazo necessário para comprovar o atendimento e a segurança.</li>
          </ul>
        </Secao>
        <Secao titulo="6. Seus direitos">
          <p>Você pode, a qualquer momento: confirmar a existência de tratamento, acessar e <b>exportar</b> seus dados, corrigir dados incompletos ou desatualizados, revogar consentimentos, solicitar informações sobre compartilhamento e <b>excluir sua conta</b>.</p>
          <p>Exportação e exclusão estão disponíveis diretamente em <b>Menu → Configurações → Privacidade e dados</b>. Outros pedidos podem ser feitos pela <Link to="/suporte" className="text-green-400 underline">Central de Ajuda</Link> (categoria Privacidade) ou pelo e-mail do encarregado. Você também pode peticionar à ANPD.</p>
        </Secao>
        <Secao titulo="7. Segurança">
          <p>Utilizamos conexão criptografada (HTTPS), controle de acesso por conta em cada registro do banco de dados, armazenamento privado de arquivos, senhas protegidas pelo provedor de autenticação e registros de auditoria das ações administrativas. Nenhum sistema é totalmente imune a incidentes; caso ocorra um incidente relevante, comunicaremos os titulares e a ANPD conforme a lei.</p>
        </Secao>
        <Secao titulo="8. Cookies e armazenamento local">
          <p>Usamos apenas armazenamento local essencial para manter sua sessão, preferências e o funcionamento offline de treinos. Não usamos cookies de publicidade.</p>
        </Secao>
        <Secao titulo="9. Alterações">
          <p>Esta política pode ser atualizada. A versão vigente estará sempre nesta página, e mudanças relevantes serão comunicadas.</p>
        </Secao>
      </Documento>
    </PublicLayout>
  )
}
