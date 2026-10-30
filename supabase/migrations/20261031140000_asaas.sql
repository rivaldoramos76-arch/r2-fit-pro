-- ============================================================
-- R2 Fit Pro — Asaas como plataforma de pagamento (cartão recorrente, Pix e boleto).
-- As funções de cobrança passam a aceitar p.provider ('asaas' | 'mercadopago');
-- sem o campo, o comportamento continua o do Mercado Pago.
-- ============================================================

-- Cliente Asaas de cada usuário (o CPF fica só no Asaas)
CREATE TABLE IF NOT EXISTS public.asaas_clientes (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id  TEXT NOT NULL UNIQUE CHECK (char_length(customer_id) BETWEEN 1 AND 60),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.asaas_clientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_clientes FROM anon, authenticated;

-- Webhook do Asaas: token gerado e cadastrado pela Edge Function (só a chave de serviço lê)
CREATE TABLE IF NOT EXISTS public.asaas_config (
  id             BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  webhook_token  TEXT NOT NULL,
  webhook_id     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.asaas_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_config FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.billing_registrar_assinatura(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sub     public.subscriptions%ROWTYPE;
  v_pid     TEXT := NULLIF(p ->> 'provider_subscription_id', '');
  v_user    UUID := NULLIF(p ->> 'user_id', '')::UUID;
  v_pstatus TEXT := lower(COALESCE(p ->> 'provider_status', ''));
  v_prov    TEXT := COALESCE(NULLIF(p ->> 'provider', ''), 'mercadopago');
  v_novo    TEXT;
  v_antigo  TEXT;
BEGIN
  IF v_pid IS NULL THEN RAISE EXCEPTION 'provider_subscription_id obrigatório'; END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE provider_subscription_id = v_pid FOR UPDATE;
  IF NOT FOUND THEN
    IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
      RAISE EXCEPTION 'Assinatura % sem usuário válido', v_pid;
    END IF;
    INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_status, status, plano_nome, preco_centavos, checkout_url)
    VALUES (v_user, v_prov, v_pid, v_pstatus, 'pendente',
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
$function$;

CREATE OR REPLACE FUNCTION public.billing_registrar_pagamento(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sub      public.subscriptions%ROWTYPE;
  v_pay      public.payments%ROWTYPE;
  v_ppid     TEXT := NULLIF(p ->> 'provider_payment_id', '');
  v_spid     TEXT := NULLIF(p ->> 'provider_subscription_id', '');
  v_prov     TEXT := COALESCE(NULLIF(p ->> 'provider', ''), 'mercadopago');
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

  SELECT * INTO v_pay FROM public.payments WHERE provider = v_prov AND provider_payment_id = v_ppid FOR UPDATE;
  v_antigo := v_pay.status;

  IF v_avulso THEN
    IF v_pay.subscription_id IS NOT NULL THEN
      SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_pay.subscription_id FOR UPDATE;
    ELSIF v_status = 'aprovado' THEN
      SELECT * INTO v_sub FROM public.subscriptions
      WHERE user_id = v_user AND modalidade = 'avulso' AND status IN ('ativa', 'inadimplente')
      ORDER BY periodo_atual_fim DESC NULLS LAST LIMIT 1 FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.subscriptions (user_id, provider, modalidade, status, provider_status, plano_nome, preco_centavos, meses_periodo)
        VALUES (v_user, v_prov, 'avulso', 'pendente', 'avulso',
                COALESCE((SELECT valor ->> 'nome' FROM public.app_config WHERE chave = 'plano'), 'R2 Fit Pro Premium'),
                GREATEST(COALESCE((p ->> 'valor_centavos')::INTEGER, 0), 100), v_meses)
        RETURNING * INTO v_sub;
      END IF;
    END IF;
  ELSIF v_sub.id IS NULL AND v_spid IS NULL THEN
    SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_user ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  END IF;

  INSERT INTO public.payments (user_id, subscription_id, provider, provider_payment_id, status, status_detalhe,
                               valor_centavos, valor_estornado_centavos, moeda, metodo, pago_em, comprovante_url, meses)
  VALUES (v_user, v_sub.id, v_prov, v_ppid, v_status, p ->> 'status_detalhe',
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
$function$;
