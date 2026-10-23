-- Correções encontradas no teste de integração real com o Mercado Pago (23/10/2026):
--
-- 1) estado_acesso: quando o usuário tinha uma assinatura antiga com período pago
--    vigente e uma mais nova sem período (periodo_atual_fim NULL), a ordenação
--    "(... AND periodo_atual_fim > NOW()) DESC" colocava a mais nova primeiro,
--    porque NULL > NOW() é NULL e, em ordenação DESC, NULL vem antes de TRUE.
--    Resultado: o acesso vigente era ignorado e o cliente caía para "expirada".
--    Correção: COALESCE(..., FALSE) na expressão de ordenação.
--
-- 2) billing_registrar_assinatura: o e-mail de "assinatura cancelada" passou a ser
--    enviado apenas para assinaturas que chegaram a ser ativadas (iniciada_em não
--    nulo). O Mercado Pago cancela sozinho checkouts pendentes após recusa, e isso
--    gerava um e-mail de cancelamento sem sentido para o cliente.

CREATE OR REPLACE FUNCTION public.estado_acesso(uid UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s RECORD;
  tolerancia INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN 'visitante'; END IF;
  -- Clientes (anon/authenticated) só consultam o próprio estado, exceto admins.
  -- service_role e acesso direto ao banco não têm essa restrição.
  IF uid IS DISTINCT FROM auth.uid() AND auth.role() IN ('anon', 'authenticated')
     AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = uid) THEN RETURN 'admin'; END IF;

  SELECT COALESCE((valor ->> 'tolerancia_dias')::INTEGER, 0) INTO tolerancia
  FROM public.app_config WHERE chave = 'plano';
  tolerancia := COALESCE(tolerancia, 0);

  -- Prioriza assinatura com acesso vigente; depois a mais recente
  SELECT * INTO s FROM public.subscriptions
  WHERE user_id = uid
  ORDER BY
    COALESCE(status IN ('ativa', 'inadimplente', 'cancelada') AND periodo_atual_fim > NOW(), FALSE) DESC,
    created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN 'sem_assinatura'; END IF;

  IF s.status = 'ativa' THEN
    -- Sem pagamento aprovado não há período pago: não libera acesso
    IF s.periodo_atual_fim IS NULL THEN RETURN 'pagamento_pendente'; END IF;
    IF s.periodo_atual_fim > NOW() THEN RETURN 'ativa'; END IF;
    IF s.periodo_atual_fim + make_interval(days => tolerancia) > NOW() THEN RETURN 'tolerancia'; END IF;
    RETURN 'expirada';
  ELSIF s.status = 'inadimplente' THEN
    IF s.periodo_atual_fim IS NOT NULL AND s.periodo_atual_fim + make_interval(days => tolerancia) > NOW() THEN
      RETURN 'tolerancia';
    END IF;
    RETURN 'pagamento_pendente';
  ELSIF s.status = 'cancelada' THEN
    IF s.periodo_atual_fim IS NOT NULL AND s.periodo_atual_fim > NOW() THEN RETURN 'cancelada_vigente'; END IF;
    RETURN 'expirada';
  ELSIF s.status = 'pendente' THEN
    RETURN 'pagamento_pendente';
  END IF;
  RETURN 'expirada';
END;
$$;

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

  -- E-mail de cancelamento só para assinatura que chegou a ser ativada
  IF v_novo = 'cancelada' AND v_antigo <> 'cancelada' AND v_sub.iniciada_em IS NOT NULL THEN
    PERFORM public.enfileirar_email(v_sub.user_id, 'assinatura_cancelada', 'cancelada:' || v_sub.id,
      jsonb_build_object('acesso_ate', (SELECT periodo_atual_fim FROM public.subscriptions WHERE id = v_sub.id)));
  END IF;

  RETURN jsonb_build_object('id', v_sub.id, 'user_id', v_sub.user_id, 'status_anterior', v_antigo, 'status', v_novo);
END;
$$;
