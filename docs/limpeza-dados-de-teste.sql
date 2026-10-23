-- ============================================================
-- Limpeza dos dados de teste do Mercado Pago (criados em 22-23/10/2026).
-- EXECUTAR ANTES DO LANÇAMENTO, junto com a troca do token de teste
-- pelo token de produção (APP_USR- da conta real) nos secrets do Supabase.
-- Afeta apenas a conta compradora de teste e os registros ligados a ela.
-- ============================================================
delete from public.payments
 where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
    or provider_payment_id in ('185632464444', '184594515837', '184596873827');
delete from public.subscriptions
 where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
delete from public.webhook_events;          -- só há eventos do ambiente de teste
delete from public.email_outbox
 where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' or status = 'sem_provedor';
delete from public.audit_logs
 where actor_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
-- Conta compradora de teste (test_user_...@testuser.com); apaga perfil e preferências em cascata
delete from auth.users
 where id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' and email like '%@testuser.com';
