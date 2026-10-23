# R2 Fit Pro — Guia de operação e lançamento

## Arquitetura

| Camada | Tecnologia | Onde |
|---|---|---|
| Frontend | React 19 + Vite 6 + Tailwind 4 | Vercel (`prj_tfPw3HACgrbAYglRlsfpShVKKrH0`) |
| IA (proxy seguro) | Vercel Function `api/ai.js` | Vercel — usa `OPENAI_API_KEY` (ou `VITE_OPENAI_API_KEY`) só no servidor |
| Banco, Auth, Storage | Supabase (`pzmhlxhdqghamyxgegwq`, us-east-1) | RLS em todas as tabelas |
| Cobrança, webhook, conta | Supabase Edge Function `r2-api` | `/functions/v1/r2-api/{billing,conta,webhook/mercadopago,saude}` |
| Pagamentos | Mercado Pago Assinaturas (preapproval sem plano) | BRL, mensal, cartão |
| E-mails transacionais | Resend (via fila `email_outbox`) | Verificação/recuperação de senha: Supabase Auth |

### Regras de acesso (fonte única: `public.estado_acesso`)
`visitante`, `sem_assinatura`, `pagamento_pendente`, `ativa`, `tolerancia` (falha de cobrança dentro de `tolerancia_dias`),
`cancelada_vigente` (cancelada, dentro do período pago), `expirada`, `admin`.
Premium = `ativa | tolerancia | cancelada_vigente | admin`. Premium **só** é liberado quando existe período pago,
criado exclusivamente por `billing_registrar_pagamento` com pagamento aprovado consultado na API do Mercado Pago.

- Leitura/exclusão dos próprios treinos, dietas e registros: sempre permitida (LGPD).
- Criação/edição de treinos, sessões, dietas e registros alimentares: exige Premium (RLS).
- IA: exige Premium + limite diário (`registrar_uso_ia`).
- Assinaturas, pagamentos, webhooks, auditoria: escrita apenas pelo backend (service role).

## Configuração pendente (responsável)

### 1. Mercado Pago (obrigatório para vender)
1. Crie/acesse a conta em https://www.mercadopago.com.br/developers → *Suas integrações* → criar aplicação (produto: Assinaturas).
2. Copie o **Access Token de teste** (`TEST-...`) e, para produção, o de produção (`APP_USR-...`).
3. Em *Webhooks*, configure a URL
   `https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/webhook/mercadopago`
   com os eventos **Pagamentos**, **Planos e assinaturas (subscription_preapproval)** e **subscription_authorized_payment**. Copie a **assinatura secreta**.
4. No Supabase → Edge Functions → Secrets (ou `supabase secrets set`):
   `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SITE_URL=https://r2-fit-pro.vercel.app`.
5. **Testes já executados em 23/10/2026** com contas de teste (vendedor + comprador): compra aprovada (saldo e cartão), recusada, duplicatas, cancelamento e reativação — tudo validado de ponta a ponta com webhooks reais. Observações do ambiente de teste do MP:
   - o checkout exige navegador logado na conta compradora de teste, e o e-mail do usuário no app deve ser o da conta de teste (`test_user_...@testuser.com`);
   - o MP cancela sozinho um checkout pendente após recusa (o app já cria outro link);
   - **reembolso automático não funciona entre contas de teste** ("Unauthorized use of live credentials"); o app cancela mesmo assim, avisa o cliente e registra `assinatura.reembolso_pendente_manual` na auditoria. Acompanhar o primeiro reembolso real em produção.
6. **Antes do lançamento**: trocar `MP_ACCESS_TOKEN` pelo token de produção da conta real, reconfigurar o webhook na aplicação da conta real (mesma URL, novos eventos "Pagamentos" e "Planos e assinaturas", novo `MP_WEBHOOK_SECRET`) e rodar `docs/limpeza-dados-de-teste.sql`.

### 2. E-mails
- **Supabase Auth → SMTP personalizado (obrigatório)**: o SMTP padrão do Supabase limita poucos e-mails por hora (testado: retornou `over_email_send_rate_limit`). Configure em *Authentication → Emails → SMTP Settings* (ex.: Resend SMTP `smtp.resend.com:465`, usuário `resend`, senha = API key).
- Cole os modelos de `docs/emails/*.html` em *Authentication → Email Templates*.
- **Resend**: crie a conta, verifique o domínio de envio (SPF/DKIM) e configure os secrets `RESEND_API_KEY` e `EMAIL_FROM` na Edge Function. E-mails gerados antes disso ficam como `sem_provedor` e podem ser reenviados no painel (Integrações → Reenviar pendentes).

### 3. Supabase Auth
- *Authentication → URL Configuration*: **Site URL** `https://r2-fit-pro.vercel.app`; **Redirect URLs**: `https://r2-fit-pro.vercel.app/**`.
- *Authentication → Providers → Email*: manter **Confirm email** ativado (verificado: ativo); senha mínima 8.
- *Password security*: ativar **Leaked password protection** (aviso do Security Advisor).

### 4. Dados empresariais e jurídico
Preencha no painel (`/admin` → Plano e empresa): razão social, CNPJ, endereço, e-mails de suporte e privacidade, encarregado (DPO), foro.
Os textos de Termos e Privacidade são minutas alinhadas à operação real e **devem ser revisados por advogado** antes do lançamento.
Emissão de nota fiscal de serviço (NFS-e) não está automatizada — depende do município/contador.

### 5. Primeiro administrador
No Supabase → SQL Editor (conexão do proprietário), com um e-mail já cadastrado e confirmado:
```sql
select public.provisionar_admin('seu-email@exemplo.com', 'proprietário');
```
A função não é acessível pela API (sem permissão para `anon`, `authenticated` ou `service_role`). Para revogar: `select public.revogar_admin('email');`.

### 6. OpenAI
A chave foi exposta no navegador nas versões anteriores ao lançamento comercial. **Gere uma nova chave**, cadastre-a na Vercel como `OPENAI_API_KEY` (sem prefixo `VITE_`) e revogue a antiga.

## Ambientes
- **Produção**: Vercel production + Supabase `pzmhlxhdqghamyxgegwq` + token `APP_USR-` do Mercado Pago.
- **Teste/homologação**: recomenda-se um segundo projeto Supabase (ou Supabase Branching) com token `TEST-` e um ambiente Preview na Vercel apontando para ele. As migrações em `supabase/migrations` recriam o schema.
- **Local**: `cp .env.example .env.local`, `npm install`, `npm run dev`.

## Migrações
Em `supabase/migrations/` (aplicadas em produção em 22/10/2026 via MCP, sem perda de dados):
1. `20261022220000_comercial_base.sql` — perfis, preferências, admins, configuração, assinaturas, pagamentos, webhooks, suporte, LGPD, auditoria, e-mails, uso de IA, funções de acesso e RLS.
2. `20261022230000_billing_admin.sql` — máquina de estados de cobrança idempotente, painel admin, provisionamento, validação de configuração, bucket privado `avatars`.
3. `20261022235000_pg_net.sql` — extensão `pg_net` (usada em testes HTTP e disponível para rotinas).

## Testes
- `npm test` — lógica de treinos (14) + lógica comercial/Mercado Pago/e-mails (10).
- `tests/sql/rls_billing.test.sql` — 54 verificações de RLS, permissões e cobrança; executa num bloco que reverte tudo (resultado esperado: `TESTES_OK (54)`).
- `tests/e2e/ui.test.mjs` — 14 testes de interface (Playwright, celular e desktop) com API simulada.

## Monitoramento e recuperação
- Painel `/admin`: webhooks com erro, e-mails não enviados, falhas de cobrança, auditoria.
- Saúde do backend: `GET https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/saude`.
- Logs: Supabase → Edge Functions → r2-api → Logs (logs estruturados sem tokens); Vercel → Logs (função `/api/ai`).
- Webhook com erro retorna 500 e o Mercado Pago reenvia; reprocessamento é idempotente. Em último caso, o usuário pode usar “Verificar pagamento” (reconsulta o Mercado Pago).
- Backups: plano Pro do Supabase inclui backups diários (recomendado PITR para produção). Plano gratuito não tem backup automático — **contratar antes do lançamento** ou agendar `pg_dump`.
- Publicação: `npm run build` → deploy Vercel; Edge Function via `supabase functions deploy r2-api --no-verify-jwt`.
