-- ============================================================
-- R2 Fit Pro — Rotina automática (pg_cron): lembretes de renovação
-- às 9h e envio da fila de e-mails a cada hora.
-- A Edge Function é chamada com um token de uso único gravado aqui,
-- sem segredo compartilhado entre banco e função.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cron_tokens (
  token      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.cron_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.billing_rotina(p_lembretes BOOLEAN DEFAULT TRUE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_token TEXT := replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');
BEGIN
  IF p_lembretes THEN PERFORM public.billing_enfileirar_lembretes(); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE status IN ('pendente', 'erro') AND tentativas < 5) THEN RETURN; END IF;
  DELETE FROM public.cron_tokens WHERE created_at < NOW() - INTERVAL '1 hour';
  INSERT INTO public.cron_tokens (token) VALUES (v_token);
  PERFORM net.http_post(
    url := 'https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/cron/emails',
    body := jsonb_build_object('token', v_token),
    headers := '{"Content-Type": "application/json"}'::JSONB,
    timeout_milliseconds := 30000);
END;
$$;
REVOKE ALL ON FUNCTION public.billing_rotina(BOOLEAN) FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
-- 12:07 UTC = 09:07 em Brasília
SELECT cron.schedule('r2-lembretes-diarios', '7 12 * * *', 'SELECT public.billing_rotina(TRUE)');
SELECT cron.schedule('r2-fila-emails', '17 * * * *', 'SELECT public.billing_rotina(FALSE)');
