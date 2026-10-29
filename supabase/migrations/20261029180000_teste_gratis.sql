-- ============================================================
-- R2 Fit Pro — Teste grátis para contas novas (sem cartão).
-- Ao se cadastrar, a conta ganha `teste_dias` dias de Premium (app_config.plano),
-- uma única vez, como uma linha de subscriptions com modalidade 'teste'.
-- Durante o teste o estado de acesso é 'teste' e o limite diário de IA é menor.
-- ============================================================

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_modalidade_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_modalidade_check
  CHECK (modalidade IN ('recorrente', 'avulso', 'cortesia', 'teste'));

-- ─── Cadastro: perfil, preferências e teste grátis ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_plano JSONB;
  v_dias  INTEGER;
BEGIN
  INSERT INTO public.profiles (id, nome, email, aceite_termos_em, versao_termos, marketing_opt_in)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1)), 120),
    NEW.email,
    CASE WHEN NEW.raw_user_meta_data ? 'versao_termos' THEN NOW() END,
    NEW.raw_user_meta_data ->> 'versao_termos',
    COALESCE((NEW.raw_user_meta_data ->> 'marketing_opt_in')::BOOLEAN, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  -- Teste grátis: nunca impede o cadastro, mesmo se algo falhar aqui
  BEGIN
    SELECT valor INTO v_plano FROM public.app_config WHERE chave = 'plano';
    v_dias := COALESCE((v_plano ->> 'teste_dias')::INTEGER, 0);
    IF v_dias > 0 AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = NEW.id) THEN
      INSERT INTO public.subscriptions (user_id, provider, modalidade, status, provider_status, plano_nome,
                                        preco_centavos, iniciada_em, periodo_atual_fim)
      VALUES (NEW.id, 'teste', 'teste', 'ativa', 'teste', COALESCE(v_plano ->> 'nome', 'R2 Fit Pro Premium'),
              GREATEST(COALESCE((v_plano ->> 'preco_centavos')::INTEGER, 100), 100), NOW(), NOW() + make_interval(days => v_dias));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'teste grátis não criado para %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ─── Estado de acesso: 'teste' enquanto o teste grátis vale ──────────────────
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
    -- checkout que nunca chegou a ser pago (ex.: cartão recusado na validação) não conta
    AND NOT (status = 'cancelada' AND iniciada_em IS NULL)
    -- teste grátis encerrado não conta (sem tolerância e sem "expirada")
    AND NOT (modalidade = 'teste' AND (status <> 'ativa' OR periodo_atual_fim <= NOW()))
  ORDER BY
    COALESCE(status IN ('ativa', 'inadimplente', 'cancelada') AND periodo_atual_fim > NOW(), FALSE) DESC,
    created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN 'sem_assinatura'; END IF;
  IF s.modalidade = 'teste' THEN RETURN 'teste'; END IF;

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

CREATE OR REPLACE FUNCTION public.tem_premium(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.estado_acesso(uid) IN ('admin', 'ativa', 'tolerancia', 'cancelada_vigente', 'teste');
$$;

-- Limite diário de IA: menor durante o teste grátis (app_config.plano.teste_limite_ia, padrão 15)
CREATE OR REPLACE FUNCTION public.registrar_uso_ia(limite INTEGER DEFAULT 80)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  total INTEGER;
  v_estado TEXT;
  v_limite INTEGER := GREATEST(limite, 1);
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'nao_autenticado'); END IF;
  v_estado := public.estado_acesso(uid);
  IF v_estado NOT IN ('admin', 'ativa', 'tolerancia', 'cancelada_vigente', 'teste') THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'sem_premium');
  END IF;
  IF v_estado = 'teste' THEN
    v_limite := LEAST(v_limite, GREATEST(COALESCE(
      (SELECT (valor ->> 'teste_limite_ia')::INTEGER FROM public.app_config WHERE chave = 'plano'), 15), 1));
  END IF;
  INSERT INTO public.ai_usage (user_id, dia, chamadas)
  VALUES (uid, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, 1)
  ON CONFLICT (user_id, dia) DO UPDATE SET chamadas = public.ai_usage.chamadas + 1
  RETURNING chamadas INTO total;
  IF total > v_limite THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', CASE WHEN v_estado = 'teste' THEN 'limite_teste' ELSE 'limite_diario' END, 'chamadas', total);
  END IF;
  RETURN jsonb_build_object('permitido', true, 'chamadas', total);
END;
$$;

-- Resumo de acesso do usuário logado (para o frontend), com o fim do teste grátis
CREATE OR REPLACE FUNCTION public.meu_acesso()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'estado', public.estado_acesso(auth.uid()),
    'premium', public.tem_premium(auth.uid()),
    'admin', public.is_admin(auth.uid()),
    'teste_ate', (SELECT max(periodo_atual_fim) FROM public.subscriptions
                  WHERE user_id = auth.uid() AND modalidade = 'teste' AND status = 'ativa' AND periodo_atual_fim > NOW())
  );
$$;
