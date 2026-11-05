-- ============================================================
-- R2 Fit Pro — Desconto do personal por aluno pagante.
-- Cada aluno que paga o Premium dá 20% de desconto na mensalidade do personal; a partir de 5 o
-- personal não paga. O Asaas não cobra menos de R$ 5,00, então abaixo disso fica R$ 5,00.
-- Regras: só conta aluno com período pago vigente (teste e cortesia não contam) e cada aluno
-- conta para um personal só (o vínculo ativo mais antigo).
-- Personal grátis recebe um acesso bônus (subscriptions provider 'personal_bonus', modalidade
-- cortesia) renovado de hora em hora enquanto tiver 5 alunos pagantes; se cair, vence em 2 dias.
-- O valor da assinatura no Asaas é ajustado pela rotina diária /r2-api/cron/personal-descontos.
-- ============================================================

/** Aluno com período pago vigente (assinatura ou compra avulsa; teste e cortesia não contam). */
CREATE OR REPLACE FUNCTION public._acomp_aluno_pagante(uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = uid AND s.modalidade IN ('recorrente', 'avulso')
      AND s.status IN ('ativa', 'inadimplente', 'cancelada') AND s.iniciada_em IS NOT NULL
      AND s.periodo_atual_fim > NOW());
$$;

/** Desconto e preço do personal agora. */
CREATE OR REPLACE FUNCTION public.acomp_desconto_personal(p_personal UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  n INT; cfg JSONB; preco INT; anual INT; pct INT;
BEGIN
  SELECT count(*) INTO n FROM public.acompanhamentos a
  WHERE a.personal_id = p_personal AND a.ativo AND public._acomp_aluno_pagante(a.aluno_id)
    AND NOT EXISTS (SELECT 1 FROM public.acompanhamentos b
                    WHERE b.aluno_id = a.aluno_id AND b.ativo AND (b.created_at, b.id) < (a.created_at, a.id));
  SELECT valor INTO cfg FROM public.app_config WHERE chave = 'plano';
  preco := COALESCE((cfg ->> 'preco_centavos')::INT, 1990);
  anual := NULLIF(cfg ->> 'preco_anual_centavos', '')::INT;
  pct := LEAST(n, 5) * 20;
  RETURN jsonb_build_object(
    'personal', EXISTS (SELECT 1 FROM public.personais WHERE user_id = p_personal),
    'alunos_pagantes', n, 'percentual', pct, 'gratis', n >= 5, 'faltam_para_gratis', GREATEST(5 - n, 0),
    'preco_cheio_centavos', preco,
    'preco_centavos', CASE WHEN n >= 5 THEN 0 ELSE GREATEST(round(preco * (100 - pct) / 100.0)::INT, LEAST(preco, 500)) END,
    'preco_anual_centavos', CASE WHEN anual IS NULL THEN NULL WHEN n >= 5 THEN 0
                                 ELSE GREATEST(round(anual * (100 - pct) / 100.0)::INT, LEAST(anual, 500)) END);
END;
$$;

/** Para a tela do personal. Quem não é personal recebe null. */
CREATE OR REPLACE FUNCTION public.acomp_meu_desconto()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.personais WHERE user_id = auth.uid())
              THEN public.acomp_desconto_personal(auth.uid()) END;
$$;

/** Acesso bônus dos personais com 5 ou mais alunos pagantes (de hora em hora). */
CREATE OR REPLACE FUNCTION public.acomp_rotina_bonus()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r RECORD; n INT := 0; v_fim TIMESTAMPTZ := NOW() + INTERVAL '2 days';
BEGIN
  FOR r IN SELECT p.user_id FROM public.personais p WHERE (public.acomp_desconto_personal(p.user_id) ->> 'gratis')::BOOLEAN LOOP
    UPDATE public.subscriptions SET periodo_atual_fim = GREATEST(periodo_atual_fim, v_fim), updated_at = NOW()
    WHERE user_id = r.user_id AND provider = 'personal_bonus' AND status = 'ativa';
    IF NOT FOUND THEN
      INSERT INTO public.subscriptions (user_id, provider, modalidade, status, provider_status, plano_nome, preco_centavos, iniciada_em, periodo_atual_fim)
      VALUES (r.user_id, 'personal_bonus', 'cortesia', 'ativa', 'personal_bonus',
              COALESCE((SELECT valor ->> 'nome' FROM public.app_config WHERE chave = 'plano'), 'R2 Fit Pro Premium'),
              GREATEST(COALESCE((SELECT (valor ->> 'preco_centavos')::INT FROM public.app_config WHERE chave = 'plano'), 1990), 100),
              NOW(), v_fim);
      INSERT INTO public.audit_logs (actor_id, acao, alvo, detalhes) VALUES (NULL, 'personal.bonus_gratis', r.user_id::TEXT, '{}'::JSONB);
    END IF;
    n := n + 1;
  END LOOP;
  UPDATE public.subscriptions SET status = 'expirada', updated_at = NOW()
  WHERE provider = 'personal_bonus' AND status = 'ativa' AND periodo_atual_fim <= NOW();
  RETURN n;
END;
$$;

/** Rotina diária: o servidor ajusta o valor das assinaturas Asaas dos personais. */
CREATE OR REPLACE FUNCTION public.acomp_rotina_descontos()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token TEXT := replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions s JOIN public.personais p ON p.user_id = s.user_id
                 WHERE s.provider = 'asaas' AND s.modalidade = 'recorrente' AND s.status IN ('ativa', 'inadimplente')
                   AND s.provider_subscription_id IS NOT NULL) THEN RETURN; END IF;
  INSERT INTO public.cron_tokens (token) VALUES (v_token);
  PERFORM net.http_post(
    url := 'https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/cron/personal-descontos',
    body := jsonb_build_object('token', v_token),
    headers := '{"Content-Type": "application/json"}'::JSONB,
    timeout_milliseconds := 60000);
END;
$$;

REVOKE ALL ON FUNCTION public._acomp_aluno_pagante(UUID), public.acomp_rotina_bonus(), public.acomp_rotina_descontos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acomp_desconto_personal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acomp_desconto_personal(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.acomp_meu_desconto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acomp_meu_desconto() TO authenticated;

SELECT cron.unschedule('r2-personal-bonus') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'r2-personal-bonus');
SELECT cron.schedule('r2-personal-bonus', '41 * * * *', 'SELECT public.acomp_rotina_bonus()');
SELECT cron.unschedule('r2-personal-descontos') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'r2-personal-descontos');
-- 06:23 UTC = 03:23 em Brasília, antes das cobranças do dia
SELECT cron.schedule('r2-personal-descontos', '23 6 * * *', 'SELECT public.acomp_rotina_descontos()');
