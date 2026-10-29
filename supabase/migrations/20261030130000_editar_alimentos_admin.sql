-- ============================================================
-- R2 Fit Pro — Permite editar um alimento já registrado no diário
-- (quantidade, valores e refeição). Exige Premium, como a inclusão.
-- ============================================================
DROP POLICY IF EXISTS food_logs_update ON public.food_logs;
CREATE POLICY food_logs_update ON public.food_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());

-- A data de nascimento informada na meta diária completa o perfil
UPDATE public.profiles p SET data_nascimento = m.nascimento
FROM public.metas_nutricionais m
WHERE m.user_id = p.id AND p.data_nascimento IS NULL;

-- ============================================================
-- R2 Fit Pro — Ações do administrador sobre o acesso de um cliente:
-- liberar cortesia, estender, encerrar, registrar pagamento recebido
-- fora do Mercado Pago e corrigir o status de um pagamento.
-- Tudo passa pela mesma máquina de estados da cobrança e fica auditado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_gerenciar_acesso(p_user UUID, p_acao TEXT, p JSONB DEFAULT '{}'::JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub   public.subscriptions%ROWTYPE;
  v_pay   public.payments%ROWTYPE;
  v_fim   TIMESTAMPTZ;
  v_dias  INTEGER;
  v_meses INTEGER;
  v_valor INTEGER;
  v_r     JSONB := '{}'::JSONB;
  v_aviso TEXT;
  v_n     INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;

  IF p_acao = 'cortesia' THEN
    -- Sem data: vitalício. Com data: acesso até o fim daquele dia (horário de Brasília).
    v_fim := CASE WHEN NULLIF(p ->> 'ate', '') IS NULL THEN TIMESTAMPTZ '2099-12-31 23:59:59+00'
                  ELSE ((p ->> 'ate')::DATE + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '1 second' END;
    IF v_fim <= NOW() THEN RAISE EXCEPTION 'A data precisa ser futura'; END IF;
    SELECT * INTO v_sub FROM public.subscriptions
    WHERE user_id = p_user AND modalidade = 'cortesia' AND status = 'ativa' AND periodo_atual_fim > NOW()
    ORDER BY periodo_atual_fim DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      UPDATE public.subscriptions SET periodo_atual_fim = v_fim, updated_at = NOW() WHERE id = v_sub.id;
    ELSE
      INSERT INTO public.subscriptions (user_id, provider, modalidade, status, provider_status, plano_nome, preco_centavos, iniciada_em, periodo_atual_fim)
      VALUES (p_user, 'cortesia', 'cortesia', 'ativa', 'cortesia',
              COALESCE((SELECT valor ->> 'nome' FROM public.app_config WHERE chave = 'plano'), 'R2 Fit Pro Premium'),
              GREATEST(COALESCE((SELECT (valor ->> 'preco_centavos')::INTEGER FROM public.app_config WHERE chave = 'plano'), 1990), 100),
              NOW(), v_fim);
    END IF;
    v_r := jsonb_build_object('acesso_ate', v_fim);

  ELSIF p_acao = 'estender' THEN
    v_dias := (p ->> 'dias')::INTEGER;
    IF v_dias IS NULL OR v_dias < 1 OR v_dias > 3650 THEN RAISE EXCEPTION 'Informe de 1 a 3650 dias'; END IF;
    SELECT * INTO v_sub FROM public.subscriptions
    WHERE user_id = p_user AND status IN ('ativa', 'inadimplente', 'cancelada') AND periodo_atual_fim > NOW()
    ORDER BY periodo_atual_fim DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'O cliente não tem acesso vigente. Use "Liberar acesso".'; END IF;
    UPDATE public.subscriptions SET periodo_atual_fim = periodo_atual_fim + make_interval(days => v_dias),
      proxima_cobranca = CASE WHEN proxima_cobranca IS NULL THEN NULL ELSE proxima_cobranca + make_interval(days => v_dias) END,
      updated_at = NOW()
    WHERE id = v_sub.id RETURNING periodo_atual_fim INTO v_fim;
    v_r := jsonb_build_object('acesso_ate', v_fim);

  ELSIF p_acao = 'encerrar' THEN
    -- Assinatura recorrente continua sendo cobrada no Mercado Pago: precisa ser cancelada lá.
    IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = p_user AND modalidade = 'recorrente'
               AND status IN ('ativa', 'inadimplente') AND periodo_atual_fim > NOW()) THEN
      v_aviso := 'O cliente tem assinatura recorrente no Mercado Pago. Cancele-a lá para parar as cobranças; o acesso dela não foi alterado.';
    END IF;
    UPDATE public.subscriptions SET periodo_atual_fim = NOW(), status = 'cancelada', cancelada_em = COALESCE(cancelada_em, NOW()), updated_at = NOW()
    WHERE user_id = p_user AND modalidade <> 'recorrente' AND periodo_atual_fim > NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_r := jsonb_build_object('encerradas', v_n, 'aviso', v_aviso);

  ELSIF p_acao = 'pagamento_manual' THEN
    v_meses := COALESCE((p ->> 'meses')::INTEGER, 1);
    v_valor := (p ->> 'valor_centavos')::INTEGER;
    IF v_meses NOT IN (1, 12) THEN RAISE EXCEPTION 'Período inválido (1 ou 12 meses)'; END IF;
    IF v_valor IS NULL OR v_valor < 100 THEN RAISE EXCEPTION 'Informe o valor recebido'; END IF;
    v_r := public.billing_registrar_pagamento(jsonb_build_object(
      'provider_payment_id', 'MANUAL-' || replace(gen_random_uuid()::TEXT, '-', ''), 'user_id', p_user,
      'status', 'aprovado', 'avulso', TRUE, 'meses', v_meses, 'valor_centavos', v_valor,
      'metodo', 'manual', 'status_detalhe', left(COALESCE(NULLIF(p ->> 'observacao', ''), 'Registrado pelo administrador'), 200)));

  ELSIF p_acao = 'status_pagamento' THEN
    IF p ->> 'status' NOT IN ('aprovado', 'pendente', 'recusado', 'estornado', 'cancelado') THEN RAISE EXCEPTION 'Status inválido'; END IF;
    SELECT * INTO v_pay FROM public.payments WHERE id = (p ->> 'payment_id')::UUID AND user_id = p_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado para este cliente'; END IF;
    IF v_pay.subscription_id IS NOT NULL THEN SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_pay.subscription_id; END IF;
    v_r := public.billing_registrar_pagamento(jsonb_build_object(
      'provider_payment_id', v_pay.provider_payment_id, 'user_id', p_user, 'status', p ->> 'status',
      'avulso', v_sub.id IS NULL OR v_sub.modalidade <> 'recorrente',
      'provider_subscription_id', CASE WHEN v_sub.modalidade = 'recorrente' THEN v_sub.provider_subscription_id END,
      'meses', v_pay.meses, 'valor_centavos', v_pay.valor_centavos,
      'valor_estornado_centavos', CASE WHEN p ->> 'status' = 'estornado' THEN v_pay.valor_centavos ELSE v_pay.valor_estornado_centavos END,
      'metodo', v_pay.metodo, 'status_detalhe', 'Alterado pelo administrador', 'pago_em', v_pay.pago_em));

  ELSE
    RAISE EXCEPTION 'Ação desconhecida: %', p_acao;
  END IF;

  INSERT INTO public.audit_logs (actor_id, acao, alvo, detalhes)
  VALUES (auth.uid(), 'admin.' || p_acao, p_user::TEXT, jsonb_build_object('entrada', p, 'resultado', v_r));
  RETURN v_r || jsonb_build_object('estado', public.estado_acesso(p_user));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_gerenciar_acesso(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_gerenciar_acesso(UUID, TEXT, JSONB) TO authenticated;
