-- ============================================================
-- R2 Fit Pro — Lembretes de renovação das compras avulsas, métricas
-- (cortesia fora da receita, anual pelo valor mensal) e preço anual.
-- ============================================================

-- ─── Lembretes de renovação das compras avulsas ──────────────────────────────
-- 3 dias antes do fim do período e logo após o vencimento, sem duplicar (dedupe por período).
CREATE OR REPLACE FUNCTION public.billing_enfileirar_lembretes()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.user_id, s.periodo_atual_fim, s.meses_periodo,
           CASE WHEN s.periodo_atual_fim > NOW() THEN 'renovacao_lembrete' ELSE 'acesso_expirado' END AS modelo
    FROM public.subscriptions s
    WHERE s.modalidade = 'avulso' AND s.status = 'ativa'
      AND s.periodo_atual_fim BETWEEN NOW() - INTERVAL '2 days' AND NOW() + INTERVAL '3 days'
      -- não avisa quem já tem outro acesso que vai além deste período
      AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions o
        WHERE o.user_id = s.user_id AND o.id <> s.id
          AND o.status IN ('ativa', 'inadimplente', 'cancelada') AND o.periodo_atual_fim > s.periodo_atual_fim)
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = s.user_id)
  LOOP
    PERFORM public.enfileirar_email(r.user_id, r.modelo,
      r.modelo || ':' || r.id || ':' || to_char(r.periodo_atual_fim, 'YYYYMMDD'),
      jsonb_build_object('acesso_ate', r.periodo_atual_fim, 'meses', r.meses_periodo));
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_enfileirar_lembretes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_enfileirar_lembretes() TO service_role;

-- ─── Métricas: cortesias não contam como receita; anual entra pelo valor mensal ─
CREATE OR REPLACE FUNCTION public.admin_metricas()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  inicio_mes TIMESTAMPTZ := date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  r JSONB;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT jsonb_build_object(
    'usuarios_total', (SELECT count(*) FROM auth.users),
    'usuarios_30d', (SELECT count(*) FROM auth.users WHERE created_at > NOW() - INTERVAL '30 days'),
    'assinantes_ativos', (SELECT count(DISTINCT user_id) FROM public.subscriptions
                          WHERE status IN ('ativa', 'inadimplente', 'cancelada') AND periodo_atual_fim > NOW()
                            AND modalidade <> 'cortesia'),
    'cortesias_ativas', (SELECT count(DISTINCT user_id) FROM public.subscriptions
                         WHERE modalidade = 'cortesia' AND status = 'ativa' AND periodo_atual_fim > NOW()),
    'assinaturas_por_status', (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::JSONB)
                               FROM (SELECT status, count(*) n FROM public.subscriptions WHERE modalidade <> 'cortesia' GROUP BY status) x),
    'mrr_centavos', (SELECT COALESCE(round(sum(preco_centavos::NUMERIC / meses_periodo)), 0) FROM public.subscriptions
                     WHERE status = 'ativa' AND periodo_atual_fim > NOW() AND modalidade <> 'cortesia'),
    'projetado_proximo_mes_centavos', (SELECT COALESCE(sum(preco_centavos), 0) FROM public.subscriptions
                     WHERE modalidade = 'recorrente' AND status IN ('ativa', 'inadimplente') AND periodo_atual_fim > NOW() - INTERVAL '3 days'),
    'recebido_mes_centavos', (SELECT COALESCE(sum(valor_centavos), 0) FROM public.payments
                              WHERE status = 'aprovado' AND pago_em >= inicio_mes),
    'recebido_total_centavos', (SELECT COALESCE(sum(valor_centavos), 0) FROM public.payments WHERE status = 'aprovado'),
    'pendente_centavos', (SELECT COALESCE(sum(valor_centavos), 0) FROM public.payments WHERE status = 'pendente'),
    'estornado_centavos', (SELECT COALESCE(sum(COALESCE(NULLIF(valor_estornado_centavos, 0), valor_centavos)), 0)
                           FROM public.payments WHERE status IN ('estornado', 'em_disputa')),
    'falhas_30d', (SELECT count(*) FROM public.payments WHERE status = 'recusado' AND created_at > NOW() - INTERVAL '30 days'),
    'webhooks_erro_7d', (SELECT count(*) FROM public.webhook_events WHERE status IN ('erro', 'rejeitado') AND created_at > NOW() - INTERVAL '7 days'),
    'emails_pendentes', (SELECT count(*) FROM public.email_outbox WHERE status IN ('pendente', 'erro', 'sem_provedor')),
    'tickets_abertos', (SELECT count(*) FROM public.support_tickets WHERE status IN ('aberto', 'em_andamento')),
    'privacidade_abertas', (SELECT count(*) FROM public.privacy_requests WHERE status = 'aberta')
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_metricas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metricas() TO authenticated;

-- ─── Configuração: preço anual e parcelamento opcionais ──────────────────────
CREATE OR REPLACE FUNCTION public.validar_app_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v JSONB := NEW.valor;
BEGIN
  IF NEW.chave = 'plano' THEN
    IF jsonb_typeof(v -> 'preco_centavos') <> 'number' OR (v ->> 'preco_centavos')::NUMERIC <> floor((v ->> 'preco_centavos')::NUMERIC)
       OR (v ->> 'preco_centavos')::INTEGER NOT BETWEEN 100 AND 100000 THEN
      RAISE EXCEPTION 'Preço inválido (centavos inteiros entre 100 e 100000)';
    END IF;
    IF v ? 'preco_anual_centavos' AND jsonb_typeof(v -> 'preco_anual_centavos') <> 'null' THEN
      IF jsonb_typeof(v -> 'preco_anual_centavos') <> 'number'
         OR (v ->> 'preco_anual_centavos')::NUMERIC <> floor((v ->> 'preco_anual_centavos')::NUMERIC)
         OR (v ->> 'preco_anual_centavos')::INTEGER NOT BETWEEN 100 AND 1000000 THEN
        RAISE EXCEPTION 'Preço anual inválido (centavos inteiros entre 100 e 1000000)';
      END IF;
    END IF;
    IF v ? 'parcelas_max_anual' AND COALESCE((v ->> 'parcelas_max_anual')::INTEGER, 0) NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION 'Parcelamento do plano anual deve ficar entre 1 e 12 vezes';
    END IF;
    IF COALESCE(v ->> 'moeda', '') <> 'BRL' THEN RAISE EXCEPTION 'Moeda deve ser BRL'; END IF;
    IF COALESCE(v ->> 'intervalo', '') <> 'mensal' THEN RAISE EXCEPTION 'Intervalo suportado: mensal'; END IF;
    IF COALESCE(char_length(v ->> 'nome'), 0) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'Nome do plano inválido'; END IF;
    IF COALESCE((v ->> 'tolerancia_dias')::INTEGER, -1) NOT BETWEEN 0 AND 15 THEN RAISE EXCEPTION 'Tolerância deve ficar entre 0 e 15 dias'; END IF;
    IF COALESCE((v ->> 'arrependimento_dias')::INTEGER, 0) < 7 THEN RAISE EXCEPTION 'Prazo de arrependimento não pode ser menor que 7 dias (CDC art. 49)'; END IF;
    IF jsonb_typeof(v -> 'beneficios') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Benefícios devem ser uma lista'; END IF;
  END IF;
  IF pg_column_size(v) > 20000 THEN RAISE EXCEPTION 'Configuração muito grande'; END IF;
  NEW.updated_at := NOW();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_app_config() FROM PUBLIC, anon, authenticated;
