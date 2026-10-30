-- Testes do Asaas nas funções de cobrança e nas tabelas protegidas. Tudo revertido; esperado: "TESTES_OK (9)".
DO $t$
DECLARE a UUID := gen_random_uuid(); n INT := 0; j JSONB; cnt INT; ok BOOLEAN; v TEXT;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'as-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"A"}', NOW(), NOW());
  -- assinatura Asaas criada (ativa no Asaas, ainda sem pagamento) não libera acesso
  j := public.billing_registrar_assinatura(jsonb_build_object('provider','asaas','provider_subscription_id','sub_t'||a,'user_id',a,'provider_status','active','preco_centavos',1990));
  SELECT provider INTO v FROM public.subscriptions WHERE provider_subscription_id = 'sub_t'||a;
  IF v <> 'asaas' OR public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 1: assinatura asaas (% / %)', v, public.estado_acesso(a); END IF; n := n + 1;
  -- pagamento confirmado ativa; mesmo id de pagamento em outro provedor não conflita
  j := public.billing_registrar_pagamento(jsonb_build_object('provider','asaas','provider_payment_id','pay_x'||a,'provider_subscription_id','sub_t'||a,'status','aprovado','valor_centavos',1990,'pago_em',NOW()));
  IF j->>'transicao' <> 'ativacao' OR public.estado_acesso(a) <> 'ativa' THEN RAISE EXCEPTION 'FALHA 2: ativação asaas (%)', j; END IF; n := n + 1;
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id','pay_x'||a,'provider_subscription_id','sub_t'||a,'status','pendente','valor_centavos',1990));
  SELECT count(*) INTO cnt FROM public.payments WHERE provider_payment_id = 'pay_x'||a;
  IF cnt <> 2 OR (SELECT status FROM public.payments WHERE provider='asaas' AND provider_payment_id='pay_x'||a) <> 'aprovado' THEN RAISE EXCEPTION 'FALHA 3: provedores separados (%)', cnt; END IF; n := n + 1;
  -- duplicata do mesmo evento não muda nada
  j := public.billing_registrar_pagamento(jsonb_build_object('provider','asaas','provider_payment_id','pay_x'||a,'provider_subscription_id','sub_t'||a,'status','aprovado','valor_centavos',1990,'pago_em',NOW()));
  IF j->>'transicao' <> 'nenhuma' THEN RAISE EXCEPTION 'FALHA 4: duplicata'; END IF; n := n + 1;
  -- cancelamento (assinatura apagada no Asaas)
  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider','asaas','provider_subscription_id','sub_t'||a,'provider_status','cancelled'));
  IF public.estado_acesso(a) <> 'cancelada_vigente' THEN RAISE EXCEPTION 'FALHA 5: cancelada com período vigente (%)', public.estado_acesso(a); END IF; n := n + 1;
  -- avulso Asaas cria assinatura avulsa com provider asaas
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() - INTERVAL '1 minute' WHERE provider_subscription_id = 'sub_t'||a;
  j := public.billing_registrar_pagamento(jsonb_build_object('provider','asaas','provider_payment_id','pay_av'||a,'user_id',a,'status','aprovado','valor_centavos',19900,'avulso',TRUE,'meses',12,'pago_em',NOW()));
  SELECT provider INTO v FROM public.subscriptions WHERE user_id = a AND modalidade = 'avulso';
  IF v <> 'asaas' OR public.estado_acesso(a) <> 'ativa' THEN RAISE EXCEPTION 'FALHA 6: avulso asaas (%)', v; END IF; n := n + 1;
  -- tabelas do Asaas inacessíveis ao cliente
  INSERT INTO public.asaas_config (id, webhook_token) VALUES (TRUE, 'tok') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.asaas_clientes (user_id, customer_id) VALUES (a, 'cus_t'||a);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM 1 FROM public.asaas_config; EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 7: token do webhook legível'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM 1 FROM public.asaas_clientes; EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 8: clientes asaas legíveis'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  DELETE FROM auth.users WHERE id = a;
  IF EXISTS (SELECT 1 FROM public.asaas_clientes WHERE user_id = a) THEN RAISE EXCEPTION 'FALHA 9: cliente asaas ficou após excluir a conta'; END IF; n := n + 1;
  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END $t$;
