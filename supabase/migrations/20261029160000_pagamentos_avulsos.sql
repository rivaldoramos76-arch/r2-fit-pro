-- ============================================================
-- R2 Fit Pro — Compras avulsas (Pix, boleto, cartão, saldo Mercado Pago)
-- de 1 ou 12 meses, plano anual, lembretes de renovação e rotina diária.
-- ============================================================

-- ─── Modalidade da assinatura e período comprado ─────────────────────────────
-- recorrente: cobrança automática no cartão (preapproval do Mercado Pago)
-- avulso:     acesso comprado por período (Checkout Pro), renovação manual
-- cortesia:   acesso liberado manualmente pelo proprietário, sem cobrança
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS modalidade TEXT NOT NULL DEFAULT 'recorrente'
  CHECK (modalidade IN ('recorrente', 'avulso', 'cortesia'));
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS meses_periodo INTEGER NOT NULL DEFAULT 1
  CHECK (meses_periodo BETWEEN 1 AND 12);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meses INTEGER NOT NULL DEFAULT 1
  CHECK (meses BETWEEN 1 AND 12);
UPDATE public.subscriptions SET modalidade = 'cortesia' WHERE provider = 'cortesia' AND modalidade <> 'cortesia';

-- ─── Pagamento: registra e aplica efeitos uma única vez por transição ────────
-- p: provider_payment_id, provider_subscription_id, user_id, status (interno),
--    status_detalhe, valor_centavos, valor_estornado_centavos, moeda, metodo, pago_em,
--    avulso (bool), meses (1 ou 12, só para compras avulsas)
CREATE OR REPLACE FUNCTION public.billing_registrar_pagamento(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sub      public.subscriptions%ROWTYPE;
  v_pay      public.payments%ROWTYPE;
  v_ppid     TEXT := NULLIF(p ->> 'provider_payment_id', '');
  v_spid     TEXT := NULLIF(p ->> 'provider_subscription_id', '');
  v_status   TEXT := p ->> 'status';
  v_pago_em  TIMESTAMPTZ := COALESCE(NULLIF(p ->> 'pago_em', '')::TIMESTAMPTZ, NOW());
  v_avulso   BOOLEAN := COALESCE((p ->> 'avulso')::BOOLEAN, FALSE) AND NULLIF(p ->> 'provider_subscription_id', '') IS NULL;
  v_meses    INTEGER := 1;
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
  IF v_avulso THEN
    v_meses := COALESCE(NULLIF(p ->> 'meses', '')::INTEGER, 1);
    IF v_meses NOT IN (1, 12) THEN RAISE EXCEPTION 'Período avulso inválido: % meses', v_meses; END IF;
  END IF;

  IF v_spid IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.subscriptions WHERE provider_subscription_id = v_spid FOR UPDATE;
  END IF;
  v_user := COALESCE(v_sub.user_id, NULLIF(p ->> 'user_id', '')::UUID);
  IF v_user IS NULL THEN RAISE EXCEPTION 'Pagamento % sem assinatura ou usuário vinculado', v_ppid; END IF;

  SELECT * INTO v_pay FROM public.payments WHERE provider = 'mercadopago' AND provider_payment_id = v_ppid FOR UPDATE;
  v_antigo := v_pay.status;

  IF v_avulso THEN
    IF v_pay.subscription_id IS NOT NULL THEN
      SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_pay.subscription_id FOR UPDATE;
    ELSIF v_status = 'aprovado' THEN
      -- Estende o acesso avulso vigente do usuário ou abre um novo
      SELECT * INTO v_sub FROM public.subscriptions
      WHERE user_id = v_user AND modalidade = 'avulso' AND status IN ('ativa', 'inadimplente')
      ORDER BY periodo_atual_fim DESC NULLS LAST LIMIT 1 FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.subscriptions (user_id, provider, modalidade, status, provider_status, plano_nome, preco_centavos, meses_periodo)
        VALUES (v_user, 'mercadopago', 'avulso', 'pendente', 'avulso',
                COALESCE((SELECT valor ->> 'nome' FROM public.app_config WHERE chave = 'plano'), 'R2 Fit Pro Premium'),
                GREATEST(COALESCE((p ->> 'valor_centavos')::INTEGER, 0), 100), v_meses)
        RETURNING * INTO v_sub;
      END IF;
    END IF;
  ELSIF v_sub.id IS NULL AND v_spid IS NULL THEN
    -- pagamento sem assinatura localizada: vincula à assinatura mais recente do usuário
    SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_user ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  END IF;

  INSERT INTO public.payments (user_id, subscription_id, provider_payment_id, status, status_detalhe,
                               valor_centavos, valor_estornado_centavos, moeda, metodo, pago_em, comprovante_url, meses)
  VALUES (v_user, v_sub.id, v_ppid, v_status, p ->> 'status_detalhe',
          COALESCE((p ->> 'valor_centavos')::INTEGER, 0), COALESCE((p ->> 'valor_estornado_centavos')::INTEGER, 0),
          COALESCE(p ->> 'moeda', 'BRL'), p ->> 'metodo',
          CASE WHEN v_status IN ('aprovado', 'estornado', 'em_disputa') THEN v_pago_em END,
          p ->> 'comprovante_url', v_meses)
  ON CONFLICT (provider, provider_payment_id) DO UPDATE SET
    status = EXCLUDED.status,
    status_detalhe = EXCLUDED.status_detalhe,
    valor_centavos = EXCLUDED.valor_centavos,
    valor_estornado_centavos = EXCLUDED.valor_estornado_centavos,
    metodo = COALESCE(EXCLUDED.metodo, public.payments.metodo),
    pago_em = COALESCE(public.payments.pago_em, EXCLUDED.pago_em),
    subscription_id = COALESCE(public.payments.subscription_id, EXCLUDED.subscription_id),
    comprovante_url = COALESCE(EXCLUDED.comprovante_url, public.payments.comprovante_url),
    meses = EXCLUDED.meses,
    updated_at = NOW()
  RETURNING * INTO v_pay;

  IF v_antigo IS NOT DISTINCT FROM v_status OR v_sub.id IS NULL THEN
    RETURN jsonb_build_object('payment_id', v_pay.id, 'transicao', v_transicao, 'status_anterior', v_antigo, 'status', v_status);
  END IF;

  IF v_status = 'aprovado' AND v_antigo IS DISTINCT FROM 'estornado' THEN
    v_primeiro := NOT EXISTS (
      SELECT 1 FROM public.payments WHERE subscription_id = v_sub.id AND status IN ('aprovado', 'estornado', 'em_disputa') AND id <> v_pay.id);
    v_fim := GREATEST(COALESCE(v_sub.periodo_atual_fim, v_pago_em), v_pago_em) + make_interval(months => v_pay.meses);
    UPDATE public.subscriptions SET
      periodo_atual_fim = v_fim,
      status = CASE WHEN status = 'cancelada' THEN 'cancelada' ELSE 'ativa' END,
      iniciada_em = COALESCE(iniciada_em, v_pago_em),
      proxima_cobranca = CASE WHEN status = 'cancelada' OR modalidade = 'avulso' THEN NULL ELSE v_fim END,
      preco_centavos = CASE WHEN modalidade = 'avulso' THEN GREATEST(v_pay.valor_centavos, 100) ELSE preco_centavos END,
      meses_periodo = CASE WHEN modalidade = 'avulso' THEN v_pay.meses ELSE meses_periodo END,
      updated_at = NOW()
    WHERE id = v_sub.id;
    v_transicao := CASE WHEN v_primeiro THEN 'ativacao' ELSE 'renovacao' END;
    PERFORM public.enfileirar_email(v_user,
      CASE WHEN v_primeiro THEN 'assinatura_confirmada' ELSE 'pagamento_aprovado' END,
      'pagamento_aprovado:' || v_ppid,
      jsonb_build_object('valor_centavos', v_pay.valor_centavos, 'acesso_ate', v_fim,
                         'avulso', v_sub.modalidade = 'avulso', 'meses', v_pay.meses));

  ELSIF v_status = 'recusado' THEN
    IF v_sub.status = 'ativa' AND v_sub.periodo_atual_fim IS NOT NULL AND v_sub.modalidade = 'recorrente' THEN
      UPDATE public.subscriptions SET status = 'inadimplente', updated_at = NOW() WHERE id = v_sub.id;
    END IF;
    v_transicao := 'falha';
    IF v_sub.modalidade = 'recorrente' THEN
      PERFORM public.enfileirar_email(v_user, 'falha_cobranca', 'pagamento_recusado:' || v_ppid,
        jsonb_build_object('valor_centavos', v_pay.valor_centavos, 'primeira_cobranca', v_sub.periodo_atual_fim IS NULL,
                           'acesso_ate', v_sub.periodo_atual_fim));
    END IF;

  ELSIF v_status IN ('estornado', 'em_disputa') AND v_antigo = 'aprovado' THEN
    -- Estorno de um pagamento que cobre o período vigente encerra o acesso
    IF v_pay.pago_em + make_interval(months => v_pay.meses) > NOW() THEN
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
REVOKE ALL ON FUNCTION public.billing_registrar_pagamento(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_registrar_pagamento(JSONB) TO service_role;
