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
   `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SITE_URL=https://r2fitpro.com.br`.
5. **Testes já executados em 23/10/2026** com contas de teste (vendedor + comprador): compra aprovada (saldo e cartão), recusada, duplicatas, cancelamento e reativação — tudo validado de ponta a ponta com webhooks reais. Observações do ambiente de teste do MP:
   - o checkout exige navegador logado na conta compradora de teste, e o e-mail do usuário no app deve ser o da conta de teste (`test_user_...@testuser.com`);
   - o MP cancela sozinho um checkout pendente após recusa (o app já cria outro link);
   - **reembolso automático não funciona entre contas de teste** ("Unauthorized use of live credentials"); o app cancela mesmo assim, avisa o cliente e registra `assinatura.reembolso_pendente_manual` na auditoria. Acompanhar o primeiro reembolso real em produção.
6. **Produção ativada em 29/10/2026**: `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` trocados pelos da aplicação 272652831473739 da conta real (webhook em modo produtivo com "Planos e assinaturas" e "Pagamentos"); `docs/limpeza-dados-de-teste.sql` executado. Checkout real validado (abre a tela de pagamento do Mercado Pago). O Mercado Pago recusa com "User bad request" quando o e-mail do comprador é o da própria conta vendedora (inclusive aliases `+algo` do Gmail) — é esperado.
7. **Acesso de cortesia** (sem cobrança): inserir em `subscriptions` uma linha com `provider = 'cortesia'`, `status = 'ativa'`, `provider_subscription_id` nulo, `iniciada_em = now()` e `periodo_atual_fim` na data final, e registrar `assinatura.cortesia_manual` em `audit_logs`. A sincronização com o Mercado Pago ignora essas linhas. Cortesia ativa: `euerika.msantos@gmail.com` (testadora, até 2099-12-31). Atenção: cortesias contam como assinatura ativa nas métricas do painel.

### 1b. Formas de pagamento (desde 29/10/2026)
| Opção | Como funciona | Rota (`/billing`) |
|---|---|---|
| Mensal no **cartão de crédito**, renovação automática | Cartão digitado no app pelo *Card Payment Brick* do Mercado Pago (token de uso único) → `preapproval` com `card_token_id` e `status: authorized`. Não exige conta Mercado Pago. | `assinar_cartao`, `trocar_cartao` |
| **Mensal avulso** (1 mês) | Checkout Pro: Pix, boleto, cartão de crédito/débito, saldo. Sem renovação automática. | `checkout_avulso` (`periodo: mensal`) |
| **Anual** (12 meses) | Checkout Pro, todas as formas; cartão parcelado em até `parcelas_max_anual` vezes. Sem renovação automática. | `checkout_avulso` (`periodo: anual`) |
| Mensal pela **conta Mercado Pago** (fluxo antigo) | `preapproval` pendente + `init_point`. Usado só se `MP_PUBLIC_KEY` não estiver configurada. | `checkout` |

- Preço anual e parcelas ficam em `app_config.plano` (`preco_anual_centavos`, `parcelas_max_anual`), editáveis no painel (Plano e empresa). Vazio = plano anual não é oferecido.
- Compras avulsas são identificadas pelos metadados `r2_tipo = avulso` e `r2_meses` (1 ou 12) do pagamento; criam/estendem uma linha `subscriptions` com `modalidade = 'avulso'` (o tempo comprado soma ao período vigente) e `proxima_cobranca` nula.
- Secret necessário: `MP_PUBLIC_KEY` (Public Key de produção, `APP_USR-...`) nas Edge Functions, para o formulário de cartão.
- **Rotina automática (pg_cron)**: `r2-lembretes-diarios` (09:07 de Brasília) enfileira o lembrete 3 dias antes do vencimento e o aviso de acesso vencido das compras avulsas; `r2-fila-emails` (de hora em hora, :17) envia a fila. A função `billing_rotina` chama `/r2-api/cron/emails` com um token de uso único gravado em `cron_tokens` (sem segredo compartilhado). Para pausar: `select cron.unschedule('r2-fila-emails');`.
- Reembolso de compra avulsa: em até 7 dias, botão "Desistir e pedir reembolso" em Minha Assinatura (mesma rota `cancelar`, com reembolso).

### 1c. Teste grátis (desde 29/10/2026)
- Toda conta **criada a partir de 29/10/2026** ganha `teste_dias` (7) dias de Premium, sem cartão, uma única vez: o cadastro (`handle_new_user`) cria uma linha em `subscriptions` com `modalidade = 'teste'`. Contas anteriores não recebem.
- Durante o teste o estado é `teste` (libera tudo), o limite diário de IA é `teste_limite_ia` (15) e o app mostra "Teste grátis: faltam X dias" com botão de assinar. Ao fim, o acesso cai para "Sem assinatura" (sem tolerância) e nada é cobrado.
- E-mails automáticos: 2 dias antes (`teste_lembrete`) e no fim (`teste_encerrado`), pela rotina diária.
- Para desligar: `/admin` → Plano e empresa → "Teste grátis (dias)" = 0. Testes e cortesias não entram em assinantes nem na receita do painel.

### 2. E-mails
**Concluído em 28/10/2026.** Domínio `r2fitpro.com.br` verificado no Resend (região São Paulo); secrets `RESEND_API_KEY`, `EMAIL_FROM` (`R2 Fit Pro <nao-responda@r2fitpro.com.br>`) e `SITE_URL` configurados na Edge Function; SMTP personalizado do Supabase Auth apontando para o Resend; modelos de `docs/emails/*.html` aplicados em *Confirm signup* e *Reset password*. Testado: e-mail transacional e recuperação de senha chegaram na caixa de entrada do Gmail.
- SMTP do Auth: `smtp.resend.com:465`, usuário `resend`, senha = API key própria (`supabase-auth-smtp`), remetente `nao-responda@r2fitpro.com.br`.
- Os 6 e-mails gerados nos testes do Mercado Pago (destinatário `@testuser.com`, inexistente) foram marcados como `erro` com 5 tentativas para não serem enviados; `docs/limpeza-dados-de-teste.sql` os remove.
- E-mails futuros que falharem podem ser reenviados no painel (Integrações e erros → Reenviar pendentes).

### 3. Supabase Auth
- *Authentication → URL Configuration* (configurado em 28/10/2026): **Site URL** `https://r2fitpro.com.br`; **Redirect URLs**: `https://r2fitpro.com.br/**` e `https://r2-fit-pro.vercel.app/**`.
- Domínio oficial: `r2fitpro.com.br` (Registro.br, zona DNS própria com A 76.76.21.21 e CNAME www→cname.vercel-dns.com; e-mail via Resend com DKIM `resend._domainkey` e CNAMEs `send`/`rsend`). O endereço `r2-fit-pro.vercel.app` segue ativo como alternativa.
- *Authentication → Providers → Email*: manter **Confirm email** ativado (verificado: ativo); senha mínima 8.
- *Password security*: ativar **Leaked password protection** (aviso do Security Advisor; recurso do plano Pro do Supabase).

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
**Concluído em 28/10/2026.** A chave exposta no navegador nas versões anteriores foi revogada; a nova está na Vercel como `OPENAI_API_KEY` (sem prefixo `VITE_`, só no servidor). A variável antiga `VITE_OPENAI_API_KEY` contém a chave revogada e pode ser removida da Vercel (o código usa `OPENAI_API_KEY` primeiro).

## Ambientes
- **Produção**: Vercel production + Supabase `pzmhlxhdqghamyxgegwq` + token `APP_USR-` do Mercado Pago.
- **Teste/homologação**: recomenda-se um segundo projeto Supabase (ou Supabase Branching) com token `TEST-` e um ambiente Preview na Vercel apontando para ele. As migrações em `supabase/migrations` recriam o schema.
- **Local**: `cp .env.example .env.local`, `npm install`, `npm run dev`.

## Migrações
Em `supabase/migrations/` (aplicadas em produção em 22/10/2026 via MCP, sem perda de dados):
1. `20261022220000_comercial_base.sql` — perfis, preferências, admins, configuração, assinaturas, pagamentos, webhooks, suporte, LGPD, auditoria, e-mails, uso de IA, funções de acesso e RLS.
2. `20261022230000_billing_admin.sql` — máquina de estados de cobrança idempotente, painel admin, provisionamento, validação de configuração, bucket privado `avatars`.
3. `20261022235000_pg_net.sql` — extensão `pg_net` (usada em testes HTTP e disponível para rotinas).
4. `20261023003000_corrige_ordenacao_estado_acesso.sql` — correção da ordenação de `estado_acesso`.
5. `20261029160000_pagamentos_avulsos.sql` — modalidade (recorrente/avulso/cortesia), meses do período e compras avulsas em `billing_registrar_pagamento` (aplicada em 29/10/2026).
6. `20261029160100_lembretes_metricas_config.sql` — lembretes de renovação, métricas sem cortesias e preço anual.
7. `20261029160200_rotina_emails.sql` — `cron_tokens`, `billing_rotina` e agendamentos do pg_cron.
8. `20261029170000_estado_ignora_checkout_recusado.sql` — assinatura cancelada que nunca foi paga (cartão recusado) não deixa o cliente como "expirado".
9. `20261029180000_teste_gratis.sql` — teste grátis no cadastro, estado `teste`, limite de IA no teste, `meu_acesso.teste_ate`.
10. `20261029180100_teste_gratis_lembretes_config.sql` — lembretes do fim do teste, métricas e configuração (`teste_dias`, `teste_limite_ia`).
11. `20261030120000_metas_favoritos.sql` — meta diária (`metas_nutricionais`) e alimentos favoritos (`alimentos_favoritos`), com RLS; favoritar exige Premium.
12. `20261030130000_editar_alimentos_admin.sql` — edição de alimentos já registrados no diário (Premium) e `admin_gerenciar_acesso` (liberar cortesia, estender, encerrar, registrar pagamento manual e corrigir status de pagamento; tudo auditado).
13. `20261030150000_alimentos_base.sql` — banco compartilhado de alimentos (estimados pela IA, produtos do código de barras/Open Food Facts e tabelas nutricionais fotografadas), gravado só pela função `salvar_alimento_base` (Premium, sem duplicar, limite de 60 por pessoa por dia).
14. `20261030160000_agua_peso_exercicio.sql` — água (`registros_agua`), peso (`registros_peso`, um por dia) e exercício (`exercicios_registro`), com RLS (criar exige Premium) e metas de água e de peso em `metas_nutricionais`.
15. `20261030170000_receitas.sql` — receitas salvas (`receitas`: ingredientes + rendimento em porções), com RLS (criar e editar exigem Premium; ver e apagar continuam liberados para o dono).
16. `20261031090000_receitas_peso_final.sql` — peso final da receita pronta (`receitas.peso_final_g`, opcional), para registrar a receita no diário em gramas.
17. `20261031120000_lembretes.sql` — lembretes por notificação: horários (`lembretes`), aparelhos inscritos (`push_inscricoes`), chaves VAPID geradas no primeiro uso (`push_config`, só a chave de serviço lê) e a rotina `lembretes_rotina` no pg_cron a cada 5 minutos, que chama `r2-api/cron/lembretes`. Só toca o que ainda faz sentido: refeição não registrada, meta de água não batida, treino não feito, peso não registrado.
18. `20261031130000_admin_confirmar_email.sql` — `admin_confirmar_email`: o administrador confirma manualmente o e-mail de um cliente (botão "Confirmar e-mail" na ficha do cliente), com auditoria.

## Testes
- `npm test` — lógica de treinos (17) + lógica comercial/Mercado Pago/e-mails/lembretes (16) + meta diária, diário, busca, exercício, peso, receitas, relatório semanal, lembretes, foto do prato e cartões de compartilhar (21).
- `tests/sql/rls_billing.test.sql` — 79 verificações de RLS, permissões e cobrança; executa num bloco que reverte tudo (resultado esperado: `TESTES_OK (79)`).
- `tests/sql/nutricao.test.sql` — 17 verificações de RLS da meta diária e dos favoritos (resultado esperado: `TESTES_OK (17)`).
- `tests/sql/admin_acesso.test.sql` — 16 verificações das ações do administrador e da edição no diário (resultado esperado: `TESTES_OK (16)`).
- `tests/sql/alimentos_base.test.sql` — 11 verificações do banco compartilhado de alimentos (resultado esperado: `TESTES_OK (11)`).
- `tests/sql/progresso.test.sql` — 11 verificações de água, peso e exercício (resultado esperado: `TESTES_OK (11)`).
- `tests/sql/receitas.test.sql` — 12 verificações das receitas salvas (resultado esperado: `TESTES_OK (12)`).
- `tests/sql/lembretes.test.sql` — 15 verificações dos lembretes: RLS, aparelhos, chaves e a rotina de envio (resultado esperado: `TESTES_OK (15)`).
- `tests/e2e/ui.test.mjs` — 36 testes de interface (Playwright, celular e desktop) com API simulada.

## Monitoramento e recuperação
- Painel `/admin`: webhooks com erro, e-mails não enviados, falhas de cobrança, auditoria.
- Saúde do backend: `GET https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/saude`.
- Logs: Supabase → Edge Functions → r2-api → Logs (logs estruturados sem tokens); Vercel → Logs (função `/api/ai`).
- Webhook com erro retorna 500 e o Mercado Pago reenvia; reprocessamento é idempotente. Além disso, com pagamento pendente o app reconsulta o Mercado Pago sozinho ao abrir e ao voltar para a aba. Avisos de recursos que não existem no Mercado Pago (ex.: cobrança de validação de cartão recusada) são marcados como ignorados.
- Backups: plano Pro do Supabase inclui backups diários (recomendado PITR para produção). Plano gratuito não tem backup automático — **contratar antes do lançamento** ou agendar `pg_dump`.
- Publicação: `npm run build` → deploy Vercel; Edge Function via `supabase functions deploy r2-api --no-verify-jwt`.

## Tabela de alimentos (TACO)

`src/data/taco.json` é gerado por `node scripts/gerar-taco.mjs` a partir da TACO 4ª edição (NEPA/UNICAMP; reprodução permitida citando a fonte), com complementos marcados (leite fluido e macarrão cozido, que a TACO não traz). Medidas caseiras ficam em `src/lib/alimentosBase.ts`.
