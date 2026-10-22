import { Link } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'
import { Documento, Secao } from '../components/Documento'
import { useConfig, ou } from '../lib/config'
import { brl } from '../lib/formatos'
import { Spinner } from '../components/UI'

export default function TermosPage() {
  const { config } = useConfig()
  if (!config) return <PublicLayout><div className="flex justify-center py-20"><Spinner /></div></PublicLayout>
  const { empresa: e, plano: p, textos: t } = config
  return (
    <PublicLayout>
      <Documento titulo="Termos de Uso" versao={t.versao_termos}>
        <Secao titulo="1. Quem somos">
          <p>O R2 Fit Pro é um aplicativo de treino e alimentação oferecido por {ou(e.razao_social)}, inscrito(a) no CPF/CNPJ {ou(e.cnpj)}, com endereço em {ou(e.endereco)} ("R2 Fit Pro", "nós").</p>
          <p>Contato: {ou(e.email_suporte)}{e.telefone ? ` · ${e.telefone}` : ''}.</p>
        </Secao>
        <Secao titulo="2. Aceitação">
          <p>Ao criar uma conta você declara ter lido e concordado com estes Termos e com a <Link to="/privacidade" className="text-green-400 underline">Política de Privacidade</Link>. O uso é permitido a maiores de 18 anos ou a menores com autorização e acompanhamento do responsável legal.</p>
        </Secao>
        <Secao titulo="3. O serviço">
          <p>O aplicativo oferece geração de planos de treino e alimentares com auxílio de inteligência artificial, catálogo de exercícios, contador de treino com áudio, registro de alimentos e estimativa de calorias.</p>
          <p><b>As recomendações têm caráter informativo e educativo e não substituem avaliação, diagnóstico ou acompanhamento de médico, nutricionista ou profissional de educação física.</b> Consulte um profissional antes de iniciar atividades físicas ou mudanças alimentares, especialmente se tiver condições de saúde, gestação ou restrições. As estimativas de calorias são aproximadas.</p>
        </Secao>
        <Secao titulo="4. Conta e segurança">
          <p>Você é responsável pela veracidade dos dados informados e pela guarda da sua senha. Avise-nos imediatamente em caso de uso não autorizado. Podemos suspender contas usadas de forma fraudulenta, abusiva ou em violação a estes Termos.</p>
        </Secao>
        <Secao titulo="5. Assinatura, preço e renovação">
          <p>Os recursos Premium exigem a assinatura do plano <b>{p.nome}</b>, pelo valor de <b>{brl(p.preco_centavos)} por mês</b>, cobrado de forma recorrente e automática no meio de pagamento cadastrado no Mercado Pago, a cada período mensal, até o cancelamento.</p>
          <p>O acesso Premium é liberado somente após a confirmação do pagamento pelo Mercado Pago. Em caso de falha de cobrança, o acesso pode ser mantido por até {p.tolerancia_dias} dias de tolerância enquanto novas tentativas são feitas; após esse prazo, os recursos Premium ficam indisponíveis até a regularização.</p>
          <p>Eventuais alterações de preço serão comunicadas com antecedência mínima de 30 dias e só se aplicarão a partir do ciclo seguinte à comunicação, podendo você cancelar antes da alteração.</p>
        </Secao>
        <Secao titulo="6. Cancelamento e reembolso">
          <p>Você pode cancelar a qualquer momento em <b>Menu → Minha Assinatura</b>, sem multa. Após o cancelamento, não haverá novas cobranças e o acesso Premium permanece até o fim do período já pago.</p>
          <p><b>Direito de arrependimento:</b> em até {p.arrependimento_dias} dias da contratação, você pode desistir e receber o reembolso integral do valor pago (art. 49 do Código de Defesa do Consumidor). Nesse caso, o acesso Premium é encerrado imediatamente. O prazo do estorno depende do meio de pagamento.</p>
          <p>Fora dessa hipótese, não há reembolso proporcional de períodos já iniciados, sem prejuízo dos direitos previstos na legislação.</p>
        </Secao>
        <Secao titulo="7. Uso permitido">
          <p>É proibido utilizar o aplicativo para fins ilícitos, tentar acessar dados de outros usuários, burlar mecanismos de cobrança ou segurança, automatizar requisições abusivas ou copiar e redistribuir o conteúdo do serviço.</p>
        </Secao>
        <Secao titulo="8. Disponibilidade e limitações">
          <p>Empregamos esforços razoáveis para manter o serviço disponível, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros (hospedagem, provedores de pagamento e de inteligência artificial). Para evitar abusos, o uso dos recursos de IA possui limite diário razoável por conta.</p>
        </Secao>
        <Secao titulo="9. Dados pessoais">
          <p>O tratamento de dados pessoais segue a <Link to="/privacidade" className="text-green-400 underline">Política de Privacidade</Link> e a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
        </Secao>
        <Secao titulo="10. Alterações destes Termos">
          <p>Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas no aplicativo ou por e-mail, e a versão vigente estará sempre disponível nesta página.</p>
        </Secao>
        <Secao titulo="11. Legislação e foro">
          <p>Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro do domicílio do consumidor{e.foro ? `, ou ${e.foro}` : ''}, para dirimir eventuais controvérsias.</p>
        </Secao>
      </Documento>
    </PublicLayout>
  )
}
