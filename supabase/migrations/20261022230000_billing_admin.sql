-- ============================================================
-- R2 Fit Pro — Funções de cobrança (idempotentes), e-mails,
-- painel administrativo, validação de configuração e storage.
-- ============================================================

-- ─── Fila de e-mails ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enfileirar_email(p_user UUID, p_modelo TEXT, p_dedupe TEXT, p_dados JSONB DEFAULT '{}'::JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email TEXT;
  v_nome  TEXT;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  SELECT COALESCE(p.email, u.email), COALESCE(p.nome, split_part(u.email, '@', 1))
    INTO v_email, v_nome
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_user;
  IF v_email IS NULL THEN RETURN; END IF;
  INSERT INTO public.email_outbox (user_id, destinatario, modelo, dedupe_key, dados)
  VALUES (p_user, v_email, p_modelo, p_dedupe, COALESCE(p_dados, '{}'::JSONB) || jsonb_build_object('nome', v_nome))
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

-- ─── Assinatura: aplica o estado informado pelo provedor ─────────────────────
-- p: provider_subscription_id, user_id, provider_status, proxima_cobranca,
--    preco_centavos, plano_nome, checkout_url
CREATE OR REPLACE FUNCTION public.billing_registrar_assinatura(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub     public.subscriptions%ROWTYPE;
  v_pid     TEXT := NULLIF(p ->> 'provider_subscription_id', '');
  v_user    UUID := NULLIF(p ->> 'user_id', '')::UUID;
  v_pstatus TEXT := lower(COALESCE(p ->> 'provider_status', ''));
  v_novo    TEXT;
  v_antigo  TEXT;
BEGIN
  IF v_pid IS NULL THEN RAISE EXCEPTION 'provider_subscription_id obrigatório'; END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE provider_subscription_id = v_pid FOR UPDATE;
  IF NOT FOUND THEN
    IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
      RAISE EXCEPTION 'Assinatura % sem usuário válido', v_pid;
    END IF;
    INSERT INTO public.subscriptions (user_id, provider_subscription_id, provider_status, status, plano_nome, preco_centavos, checkout_url)
    VALUES (v_user, v_pid, v_pstatus, 'pendente',
            COALESCE(p ->> 'plano_nome', 'R2 Fit Pro Premium'),
            COALESCE((p ->> 'preco_centavos')::INTEGER, 1990),
            p ->> 'checkout_url')
    RETURNING * INTO v_sub;
  ELSIF v_user IS NOT NULL AND v_sub.user_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Assinatura % pertence a outro usuário', v_pid;
  END IF;

  v_antigo := v_sub.status;
  v_novo := CASE v_pstatus
    WHEN 'authorized' THEN CASE WHEN v_antigo = 'cancelada' THEN 'cancelada' ELSE 'ativa' END
    WHEN 'paused'     THEN CASE WHEN v_antigo = 'cancelada' THEN 'cancelada' ELSE 'inadimplente' END
    WHEN 'cancelled'  THEN 'cancelada'
    WHEN 'finished'   THEN 'cancelada'
    ELSE v_antigo
  END;

  UPDATE public.subscriptions SET
    status           = v_novo,
    provider_status  = v_pstatus,
    proxima_cobranca = CASE WHEN v_novo IN ('cancelada') THEN NULL
                            ELSE COALESCE(NULLIF(p ->> 'proxima_cobranca', '')::TIMESTAMPTZ, proxima_cobranca) END,
    cancelada_em     = CASE WHEN v_novo = 'cancelada' THEN COALESCE(cancelada_em, NOW()) ELSE cancelada_em END,
    checkout_url     = COALESCE(p ->> 'checkout_url', checkout_url),
    updated_at       = NOW()
  WHERE id = v_sub.id;

  IF v_novo = 'cancelada' AND v_antigo <> 'cancelada' THEN
    PERFORM public.enfileirar_email(v_sub.user_id, 'assinatura_cancelada', 'cancelada:' || v_sub.id,
      jsonb_build_object('acesso_ate', (SELECT periodo_atual_fim FROM public.subscriptions WHERE id = v_sub.id)));
  END IF;

  RETURN jsonb_build_object('id', v_sub.id, 'user_id', v_sub.user_id, 'status_anterior', v_antigo, 'status', v_novo);
END;
$$;

-- ─── Pagamento: registra e aplica efeitos uma única vez por transição ────────
-- p: provider_payment_id, provider_subscription_id, user_id, status (interno),
--    status_detalhe, valor_centavos, valor_estornado_centavos, moeda, metodo, pago_em
CREATE OR REPLACE FUNCTION public.billing_registrar_pagamento(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub      public.subscriptions%ROWTYPE;
  v_pay      public.payments%ROWTYPE;
  v_ppid     TEXT := NULLIF(p ->> 'provider_payment_id', '');
  v_spid     TEXT := NULLIF(p ->> 'provider_subscription_id', '');
  v_status   TEXT := p ->> 'status';
  v_pago_em  TIMESTAMPTZ := COALESCE(NULLIF(p ->> 'pago_em', '')::TIMESTAMPTZ, NOW());
  v_user     UUID;
  v_antigo   TEXT;
  v_fim      TIMESTAMPTZ;
  v_primeiro BOOLEAN;
  v_transicao TEXT := 'nenhuma';
BEGIN
  IF v_ppid IS NULL THEN RAISE EXCEPTION 'provider_payment_id obrigatório'; END IF;
  IF v_status NOT IN ('aprovado', 'pendente', 'recusado', 'estornado', 'cancelado', 'em_disputa') THEN
    RAISE EXCEPTION 'Status de pagamento inválido: %', v_status;
  END IF;

  IF v_spid IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.subscriptions WHERE provider_subscription_id = v_spid FOR UPDATE;
  END IF;
  v_user := COALESCE(v_sub.user_id, NULLIF(p ->> 'user_id', '')::UUID);
  IF v_sub.id IS NULL AND v_spid IS NULL AND v_user IS NOT NULL THEN
    -- pagamento avulso sem assinatura localizada: vincula à assinatura mais recente do usuário
    SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_user ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Pagamento % sem assinatura ou usuário vinculado', v_ppid; END IF;

  SELECT * INTO v_pay FROM public.payments WHERE provider = 'mercadopago' AND provider_payment_id = v_ppid FOR UPDATE;
  v_antigo := v_pay.status;

  INSERT INTO public.payments (user_id, subscription_id, provider_payment_id, status, status_detalhe,
                               valor_centavos, valor_estornado_centavos, moeda, metodo, pago_em, comprovante_url)
  VALUES (v_user, v_sub.id, v_ppid, v_status, p ->> 'status_detalhe',
          COALESCE((p ->> 'valor_centavos')::INTEGER, 0), COALESCE((p ->> 'valor_estornado_centavos')::INTEGER, 0),
          COALESCE(p ->> 'moeda', 'BRL'), p ->> 'metodo',
          CASE WHEN v_status IN ('aprovado', 'estornado', 'em_disputa') THEN v_pago_em END,
          p ->> 'comprovante_url')
  ON CONFLICT (provider, provider_payment_id) DO UPDATE SET
    status = EXCLUDED.status,
    status_detalhe = EXCLUDED.status_detalhe,
    valor_centavos = EXCLUDED.valor_centavos,
    valor_estornado_centavos = EXCLUDED.valor_estornado_centavos,
    metodo = COALESCE(EXCLUDED.metodo, public.payments.metodo),
    pago_em = COALESCE(public.payments.pago_em, EXCLUDED.pago_em),
    subscription_id = COALESCE(public.payments.subscription_id, EXCLUDED.subscription_id),
    comprovante_url = COALESCE(EXCLUDED.comprovante_url, public.payments.comprovante_url),
    updated_at = NOW()
  RETURNING * INTO v_pay;

  IF v_antigo IS NOT DISTINCT FROM v_status OR v_sub.id IS NULL THEN
    RETURN jsonb_build_object('payment_id', v_pay.id, 'transicao', v_transicao, 'status_anterior', v_antigo, 'status', v_status);
  END IF;

  IF v_status = 'aprovado' AND v_antigo IS DISTINCT FROM 'estornado' THEN
    v_primeiro := NOT EXISTS (
      SELECT 1 FROM public.payments WHERE subscription_id = v_sub.id AND status IN ('aprovado', 'estornado', 'em_disputa') AND id <> v_pay.id);
    v_fim := GREATEST(COALESCE(v_sub.periodo_atual_fim, v_pago_em), v_pago_em) + INTERVAL '1 month';
    UPDATE public.subscriptions SET
      periodo_atual_fim = v_fim,
      status = CASE WHEN status = 'cancelada' THEN 'cancelada' ELSE 'ativa' END,
      iniciada_em = COALESCE(iniciada_em, v_pago_em),
      proxima_cobranca = CASE WHEN status = 'cancelada' THEN NULL ELSE v_fim END,
      updated_at = NOW()
    WHERE id = v_sub.id;
    v_transicao := CASE WHEN v_primeiro THEN 'ativacao' ELSE 'renovacao' END;
    PERFORM public.enfileirar_email(v_user,
      CASE WHEN v_primeiro THEN 'assinatura_confirmada' ELSE 'pagamento_aprovado' END,
      'pagamento_aprovado:' || v_ppid,
      jsonb_build_object('valor_centavos', v_pay.valor_centavos, 'acesso_ate', v_fim));

  ELSIF v_status = 'recusado' THEN
    IF v_sub.status = 'ativa' AND v_sub.periodo_atual_fim IS NOT NULL THEN
      UPDATE public.subscriptions SET status = 'inadimplente', updated_at = NOW() WHERE id = v_sub.id;
    END IF;
    v_transicao := 'falha';
    PERFORM public.enfileirar_email(v_user, 'falha_cobranca', 'pagamento_recusado:' || v_ppid,
      jsonb_build_object('valor_centavos', v_pay.valor_centavos, 'primeira_cobranca', v_sub.periodo_atual_fim IS NULL,
                         'acesso_ate', v_sub.periodo_atual_fim));

  ELSIF v_status IN ('estornado', 'em_disputa') AND v_antigo = 'aprovado' THEN
    -- Estorno de um pagamento que cobre o período vigente encerra o acesso
    IF v_pay.pago_em + INTERVAL '1 month' > NOW() THEN
      UPDATE public.subscriptions SET periodo_atual_fim = LEAST(periodo_atual_fim, NOW()), updated_at = NOW()
      WHERE id = v_sub.id;
    END IF;
    v_transicao := 'estorno';
    PERFORM public.enfileirar_email(v_user, 'pagamento_estornado', 'pagamento_estornado:' || v_ppid,
      jsonb_build_object('valor_centavos', COALESCE(NULLIF(v_pay.valor_estornado_centavos, 0), v_pay.valor_centavos)));
  END IF;

  RETURN jsonb_build_object('payment_id', v_pay.id, 'transicao', v_transicao, 'status_anterior', v_antigo, 'status', v_status);
END;
$$;

-- ─── Cancelamento solicitado pelo usuário (após confirmação no provedor) ─────
CREATE OR REPLACE FUNCTION public.billing_cancelar(p_sub UUID, p_encerrar_agora BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
BEGIN
  UPDATE public.subscriptions SET
    status = 'cancelada',
    provider_status = 'cancelled',
    cancelada_em = COALESCE(cancelada_em, NOW()),
    proxima_cobranca = NULL,
    periodo_atual_fim = CASE WHEN p_encerrar_agora THEN LEAST(COALESCE(periodo_atual_fim, NOW()), NOW()) ELSE periodo_atual_fim END,
    updated_at = NOW()
  WHERE id = p_sub
  RETURNING * INTO v_sub;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada'; END IF;
  PERFORM public.enfileirar_email(v_sub.user_id, 'assinatura_cancelada', 'cancelada:' || v_sub.id,
    jsonb_build_object('acesso_ate', v_sub.periodo_atual_fim, 'reembolso', p_encerrar_agora));
  RETURN to_jsonb(v_sub);
END;
$$;

REVOKE ALL ON FUNCTION public.enfileirar_email(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_registrar_assinatura(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_registrar_pagamento(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_cancelar(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_email(UUID, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_registrar_assinatura(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_registrar_pagamento(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_cancelar(UUID, BOOLEAN) TO service_role;

-- ─── Painel administrativo ───────────────────────────────────────────────────
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
                          WHERE status IN ('ativa', 'inadimplente', 'cancelada') AND periodo_atual_fim > NOW()),
    'assinaturas_por_status', (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::JSONB)
                               FROM (SELECT status, count(*) n FROM public.subscriptions GROUP BY status) x),
    'mrr_centavos', (SELECT COALESCE(sum(preco_centavos), 0) FROM public.subscriptions
                     WHERE status = 'ativa' AND periodo_atual_fim > NOW()),
    'projetado_proximo_mes_centavos', (SELECT COALESCE(sum(preco_centavos), 0) FROM public.subscriptions
                     WHERE status IN ('ativa', 'inadimplente') AND periodo_atual_fim > NOW() - INTERVAL '3 days'),
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

CREATE OR REPLACE FUNCTION public.admin_usuarios(p_busca TEXT DEFAULT NULL, p_limite INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (id UUID, nome TEXT, email TEXT, criado_em TIMESTAMPTZ, ultimo_login TIMESTAMPTZ,
               email_confirmado BOOLEAN, estado TEXT, admin BOOLEAN, total BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT u.id, p.nome, u.email::TEXT, u.created_at, u.last_sign_in_at,
         u.email_confirmed_at IS NOT NULL, public.estado_acesso(u.id),
         EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id),
         count(*) OVER ()
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p_busca IS NULL OR p_busca = ''
     OR u.email ILIKE '%' || p_busca || '%' OR p.nome ILIKE '%' || p_busca || '%'
  ORDER BY u.created_at DESC
  LIMIT LEAST(GREATEST(p_limite, 1), 200) OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_metricas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_usuarios(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metricas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usuarios(TEXT, INTEGER, INTEGER) TO authenticated;

-- Provisionamento de administradores: somente via SQL privilegiado
-- (SQL Editor do Supabase / conexão do proprietário). Não exposto à API.
CREATE OR REPLACE FUNCTION public.provisionar_admin(p_email TEXT, p_observacao TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(trim(p_email)) AND email_confirmed_at IS NOT NULL;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Usuário com e-mail confirmado não encontrado: %', p_email; END IF;
  INSERT INTO public.admins (user_id, observacao) VALUES (v_id, p_observacao) ON CONFLICT (user_id) DO NOTHING;
  RETURN 'Administrador provisionado: ' || v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.revogar_admin(p_email TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.admins WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)));
  RETURN 'Acesso administrativo revogado (se existia)';
END;
$$;
REVOKE ALL ON FUNCTION public.provisionar_admin(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revogar_admin(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ─── Validação da configuração comercial ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validar_app_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v JSONB := NEW.valor;
BEGIN
  IF NEW.chave = 'plano' THEN
    IF jsonb_typeof(v -> 'preco_centavos') <> 'number' OR (v ->> 'preco_centavos')::NUMERIC <> floor((v ->> 'preco_centavos')::NUMERIC)
       OR (v ->> 'preco_centavos')::INTEGER NOT BETWEEN 100 AND 100000 THEN
      RAISE EXCEPTION 'Preço inválido (centavos inteiros entre 100 e 100000)';
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
DROP TRIGGER IF EXISTS validar_app_config ON public.app_config;
CREATE TRIGGER validar_app_config BEFORE INSERT OR UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.validar_app_config();
REVOKE ALL ON FUNCTION public.validar_app_config() FROM PUBLIC, anon, authenticated;

-- ─── Storage privado para fotos de perfil ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', FALSE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_select ON storage.objects;
DROP POLICY IF EXISTS avatars_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_update ON storage.objects;
DROP POLICY IF EXISTS avatars_delete ON storage.objects;
CREATE POLICY avatars_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY avatars_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY avatars_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY avatars_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
