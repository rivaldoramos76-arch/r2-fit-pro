// Modelos de e-mails transacionais (pt-BR). Sem dependências de runtime.

// deno-lint-ignore no-explicit-any
type Dados = Record<string, any>

const brl = (centavos: unknown) =>
  (Number(centavos ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (iso: unknown) => {
  if (!iso) return null
  const d = new Date(String(iso))
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function layout(titulo: string, corpo: string, site: string, ctaTexto?: string, ctaUrl?: string) {
  const cta = ctaTexto && ctaUrl
    ? `<p style="margin:28px 0"><a href="${esc(ctaUrl)}" style="background:#22c55e;color:#09090b;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${esc(ctaTexto)}</a></p>`
    : ''
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#09090b;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e4e4e7">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-weight:700;font-size:18px;color:#fafafa;margin:0 0 24px">⚡ R2 Fit Pro</p>
<div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:24px">
<h1 style="font-size:20px;color:#fafafa;margin:0 0 16px">${esc(titulo)}</h1>
<div style="font-size:15px;line-height:1.6;color:#d4d4d8">${corpo}</div>${cta}
</div>
<p style="font-size:12px;color:#71717a;margin-top:24px;line-height:1.5">Você recebeu este e-mail porque possui uma conta no R2 Fit Pro. Mensagens sobre cobrança e segurança são obrigatórias para a prestação do serviço.<br><a href="${esc(site)}/privacidade" style="color:#71717a">Política de Privacidade</a> · <a href="${esc(site)}/suporte" style="color:#71717a">Ajuda</a></p>
</div></body></html>`
}

export function renderizarEmail(modelo: string, d: Dados, site: string): { assunto: string; html: string } {
  const nome = esc(d.nome ?? '')
  const ola = nome ? `<p>Olá, ${nome}!</p>` : '<p>Olá!</p>'
  switch (modelo) {
    case 'assinatura_confirmada':
      return {
        assunto: 'Sua assinatura R2 Fit Pro Premium está ativa',
        html: layout('Assinatura confirmada', `${ola}<p>Recebemos a confirmação do pagamento de <b>${brl(d.valor_centavos)}</b> e seu acesso Premium já está liberado${data(d.acesso_ate) ? ` até <b>${data(d.acesso_ate)}</b>, com renovação automática mensal` : ''}.</p><p>Você pode acompanhar cobranças ou cancelar quando quiser em <b>Minha Assinatura</b>. Cancelando em até 7 dias da contratação, o valor é reembolsado integralmente.</p>`, site, 'Abrir o app', `${site}/dashboard`),
      }
    case 'pagamento_aprovado':
      return {
        assunto: 'Pagamento confirmado — R2 Fit Pro Premium',
        html: layout('Pagamento confirmado', `${ola}<p>Sua renovação de <b>${brl(d.valor_centavos)}</b> foi aprovada.${data(d.acesso_ate) ? ` Seu acesso segue liberado até <b>${data(d.acesso_ate)}</b>.` : ''}</p>`, site, 'Ver pagamentos', `${site}/pagamentos`),
      }
    case 'falha_cobranca':
      return {
        assunto: d.primeira_cobranca ? 'Não conseguimos concluir seu pagamento' : 'Falha na renovação da sua assinatura',
        html: layout(d.primeira_cobranca ? 'Pagamento não aprovado' : 'Falha na renovação', `${ola}<p>A cobrança de <b>${brl(d.valor_centavos)}</b> não foi aprovada pelo meio de pagamento.</p>${!d.primeira_cobranca && data(d.acesso_ate) ? `<p>Seu acesso continua até <b>${data(d.acesso_ate)}</b> (mais um curto período de tolerância). O Mercado Pago fará novas tentativas automaticamente.</p>` : ''}<p>Para regularizar, verifique o cartão cadastrado no Mercado Pago ou contrate novamente em <b>Minha Assinatura</b>.</p>`, site, 'Regularizar assinatura', `${site}/assinatura`),
      }
    case 'assinatura_cancelada':
      return {
        assunto: 'Assinatura cancelada — R2 Fit Pro',
        html: layout('Assinatura cancelada', `${ola}<p>O cancelamento da sua assinatura foi registrado e <b>não haverá novas cobranças</b>.</p>${d.reembolso ? '<p>Como o cancelamento ocorreu dentro do prazo de arrependimento, solicitamos o reembolso integral ao Mercado Pago e o acesso Premium foi encerrado. O estorno aparece conforme o prazo do seu meio de pagamento.</p>' : data(d.acesso_ate) ? `<p>Você continua com acesso Premium até <b>${data(d.acesso_ate)}</b>.</p>` : ''}<p>Seus treinos, dietas e registros continuam salvos na sua conta.</p>`, site, 'Minha assinatura', `${site}/assinatura`),
      }
    case 'pagamento_estornado':
      return {
        assunto: 'Estorno registrado — R2 Fit Pro',
        html: layout('Estorno registrado', `${ola}<p>Registramos o estorno de <b>${brl(d.valor_centavos)}</b>. O valor retorna conforme o prazo do seu meio de pagamento.</p>`, site, 'Ver pagamentos', `${site}/pagamentos`),
      }
    case 'aviso':
      return {
        assunto: String(d.assunto ?? 'Aviso importante — R2 Fit Pro').slice(0, 120),
        html: layout(String(d.titulo ?? 'Aviso importante'), `${ola}<p>${esc(d.mensagem ?? '')}</p>`, site),
      }
    default:
      throw new Error(`Modelo de e-mail desconhecido: ${modelo}`)
  }
}
