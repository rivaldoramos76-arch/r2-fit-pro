-- Remove os dados criados pelos testes automatizados de 22/10/2026.
-- Executar no Supabase → SQL Editor. Afeta apenas registros de teste identificados abaixo.
delete from public.payments      where provider_payment_id = 'TESTE-PAY-1';
delete from public.subscriptions where provider_subscription_id = 'TESTE-PRE-1';
delete from public.email_outbox  where user_id = 'cc8696a2-5db8-465d-ba89-0eddb8c23c03';
delete from public.webhook_events where status = 'rejeitado' and resource_id = '123' and erro = 'assinatura_invalida';
-- Conta de teste (alias +r2teste1 do e-mail do proprietário); apaga em cascata o treino e o registro alimentar de teste
delete from auth.users where id = 'cc8696a2-5db8-465d-ba89-0eddb8c23c03' and email = 'rivaldoramos76+r2teste1@gmail.com';
