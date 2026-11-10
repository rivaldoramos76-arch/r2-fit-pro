-- "Fale com o desenvolvedor" (tela inicial): novos tipos de recado no Suporte e aviso no celular dos administradores.

-- Tipos novos: sugestão e dificuldade (os demais continuam)
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_categoria_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_categoria_check
  CHECK (categoria IN ('conta', 'assinatura', 'pagamento', 'treino', 'dieta', 'calorias', 'privacidade', 'bug', 'outro', 'sugestao', 'dificuldade'));

-- A cada recado novo, chama a Edge Function r2-recados com um token de uso único (sem segredo compartilhado)
CREATE OR REPLACE FUNCTION public.suporte_avisar_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token TEXT := replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');
BEGIN
  INSERT INTO public.cron_tokens (token) VALUES (v_token);
  PERFORM net.http_post(
    url := 'https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-recados',
    body := jsonb_build_object('token', v_token, 'chamado', NEW.id),
    headers := '{"Content-Type": "application/json"}'::JSONB,
    timeout_milliseconds := 15000);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- o aviso nunca impede o recado
END;
$$;
DROP TRIGGER IF EXISTS support_tickets_aviso ON public.support_tickets;
CREATE TRIGGER support_tickets_aviso AFTER INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.suporte_avisar_admin();
REVOKE ALL ON FUNCTION public.suporte_avisar_admin() FROM PUBLIC, anon, authenticated;
