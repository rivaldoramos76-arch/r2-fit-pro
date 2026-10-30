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
          <p>Os recursos Premium exigem a contratação do plano <b>{p.nome}</b>, em uma destas modalidades:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li><b>Mensal com renovação automática:</b> {brl(p.preco_centavos)} por mês, cobrado de forma recorrente no cartão de crédito informado, a cada período mensal, até o cancelamento.</li>
            <li><b>Mensal avulso:</b> {brl(p.preco_centavos)} por 1 mês de acesso, pago uma única vez (Pix, boleto ou cartão), sem renovação automática.</li>
            {p.preco_anual_centavos ? <li><b>Anual:</b> {brl(p.preco_anual_centavos)} por 12 meses de acesso, pago uma única vez (Pix, boleto ou cartão, conforme as condições exibidas no pagamento), sem renovação automática.</li> : null}
          </ul>
          <p>Os pagamentos são processados pelo Asaas (assinaturas contratadas antes da mudança seguem no Mercado Pago). Para emitir a cobrança, é necessário informar o CPF do pagador. Nas modalidades sem renovação automática, o acesso termina ao fim do período contratado e o usuário é avisado por e-mail antes do vencimento; o tempo de uma nova compra feita antes do vencimento é somado ao período vigente.</p>
          {p.teste_dias ? <p><b>Teste grátis:</b> contas novas têm {p.teste_dias} dias de acesso Premium sem custo e sem cadastro de cartão, uma única vez por pessoa. Durante o teste, o uso dos recursos de inteligência artificial tem limite diário menor. Ao fim do teste, o acesso Premium é encerrado automaticamente e nenhuma cobrança é feita; para continuar, é preciso contratar uma das modalidades acima. A criação de várias contas para obter testes adicionais pode levar ao bloqueio do acesso.</p> : null}
          <p>O acesso Premium é liberado somente após a confirmação do pagamento pela plataforma de pagamento. Em caso de falha de cobrança, o acesso pode ser mantido por até {p.tolerancia_dias} dias de tolerância enquanto novas tentativas são feitas; após esse prazo, os recursos Premium ficam indisponíveis até a regularização.</p>
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
