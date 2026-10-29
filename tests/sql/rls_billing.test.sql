-- Testes de RLS, controle de acesso e máquina de estados de cobrança.
-- Executa tudo dentro de um bloco DO que termina com RAISE EXCEPTION:
-- nenhuma alteração é persistida. Resultado esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid();
  b UUID := gen_random_uuid();
  c UUID := gen_random_uuid();
  n INT := 0;
  v TEXT; j JSONB; cnt INT; fim1 TIMESTAMPTZ; fim2 TIMESTAMPTZ; sub UUID; ok BOOLEAN;
BEGIN
  -- ── Preparação (como postgres) ──────────────────────────────────────────
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'teste-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"Teste A","versao_termos":"2026-10-22"}', NOW(), NOW()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'teste-b-'||b||'@exemplo.invalid', 'x', NOW(), '{"nome":"Teste B"}', NOW(), NOW()),
         (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'teste-c-'||c||'@exemplo.invalid', 'x', NOW(), '{"nome":"Admin C"}', NOW(), NOW());

  SELECT count(*) INTO cnt FROM public.profiles WHERE id IN (a, b, c);
  IF cnt <> 3 THEN RAISE EXCEPTION 'FALHA 1: perfis não criados pelo trigger (%)', cnt; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.user_settings WHERE user_id IN (a, b, c);
  IF cnt <> 3 THEN RAISE EXCEPTION 'FALHA 2: preferências não criadas'; END IF; n := n + 1;
  SELECT versao_termos INTO v FROM public.profiles WHERE id = a;
  IF v IS DISTINCT FROM '2026-10-22' THEN RAISE EXCEPTION 'FALHA 3: aceite dos termos não registrado'; END IF; n := n + 1;

  INSERT INTO public.dietas (user_id, nome, objetivo, calorias_dia, plano) VALUES (b, 'Dieta B', 'x', 2000, '{}');
  INSERT INTO public.food_logs (user_id, nome, calorias) VALUES (b, 'Arroz B', 130);
  INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano) VALUES (a, 'Treino antigo A', 'x', 'Iniciante', 3, '{}');

  -- ── Usuário A sem assinatura ────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF public.estado_acesso() <> 'sem_assinatura' THEN RAISE EXCEPTION 'FALHA 4: estado inicial'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.profiles; IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 5: A vê perfis alheios (%)', cnt; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.dietas WHERE user_id = b; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 6: A vê dietas de B'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.food_logs WHERE user_id = b; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 7: A vê registros alimentares de B'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.treinos; IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 8: A não vê os próprios dados antigos'; END IF; n := n + 1;

  ok := FALSE; BEGIN INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano) VALUES (a, 'Novo', 'x', 'Iniciante', 3, '{}');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 9: sem Premium conseguiu criar treino'; END IF; n := n + 1;

  ok := FALSE; BEGIN INSERT INTO public.food_logs (user_id, nome, calorias) VALUES (a, 'X', 1);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 10: sem Premium conseguiu registrar alimento'; END IF; n := n + 1;

  ok := FALSE; BEGIN INSERT INTO public.dietas (user_id, nome, objetivo, calorias_dia, plano) VALUES (b, 'Invasão', 'x', 1, '{}');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 11: A inseriu dado em nome de B'; END IF; n := n + 1;

  ok := FALSE; BEGIN INSERT INTO public.subscriptions (user_id, plano_nome, preco_centavos, status, periodo_atual_fim) VALUES (a, 'x', 1, 'ativa', NOW() + INTERVAL '1 year');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 12: cliente criou a própria assinatura'; END IF; n := n + 1;

  ok := FALSE; BEGIN INSERT INTO public.admins (user_id) VALUES (a);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 13: cliente se tornou admin'; END IF; n := n + 1;

  ok := FALSE; BEGIN PERFORM public.billing_registrar_pagamento('{"provider_payment_id":"x","status":"aprovado"}');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 14: cliente executou função de cobrança'; END IF; n := n + 1;

  ok := FALSE; BEGIN PERFORM public.admin_metricas();
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 15: cliente acessou métricas admin'; END IF; n := n + 1;

  ok := FALSE; BEGIN PERFORM public.estado_acesso(b);
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 16: A consultou estado de B'; END IF; n := n + 1;

  ok := FALSE; BEGIN PERFORM public.provisionar_admin('qualquer@exemplo.invalid');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 17: cliente executou provisionar_admin'; END IF; n := n + 1;

  UPDATE public.app_config SET valor = valor || '{"preco_centavos": 100}' WHERE chave = 'plano';
  GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 18: cliente alterou o preço'; END IF; n := n + 1;

  SELECT count(*) INTO cnt FROM public.webhook_events; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 19: cliente lê webhooks'; END IF; n := n + 1;

  UPDATE public.profiles SET nome = 'A Editado', email = 'hack@exemplo.invalid' WHERE id = a;
  SELECT email INTO v FROM public.profiles WHERE id = a;
  IF v <> 'teste-a-'||a||'@exemplo.invalid' THEN RAISE EXCEPTION 'FALHA 20: cliente alterou e-mail do perfil'; END IF; n := n + 1;

  j := public.registrar_uso_ia(); IF (j ->> 'permitido')::BOOLEAN THEN RAISE EXCEPTION 'FALHA 21: IA liberada sem Premium'; END IF; n := n + 1;

  -- Suporte: cliente não define status/resposta
  INSERT INTO public.support_tickets (user_id, categoria, assunto, mensagem, status, resposta)
  VALUES (a, 'conta', 'Teste', 'Mensagem de teste longa', 'respondido', 'resposta forjada');
  SELECT status || '|' || COALESCE(resposta, 'null') INTO v FROM public.support_tickets WHERE user_id = a;
  IF v <> 'aberto|null' THEN RAISE EXCEPTION 'FALHA 22: cliente forjou resposta de suporte (%)', v; END IF; n := n + 1;
  ok := FALSE; BEGIN UPDATE public.support_tickets SET resposta = 'x' WHERE user_id = a;
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 23: cliente editou resposta do suporte'; END IF; n := n + 1;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- B não vê o chamado de A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.support_tickets; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 24: B vê chamados de A'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.treinos; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 25: B vê treinos de A'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- ── Cobrança (backend / service role) ───────────────────────────────────
  j := public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'PRE-'||a, 'user_id', a, 'provider_status', 'pending', 'preco_centavos', 1990, 'plano_nome', 'R2 Fit Pro Premium'));
  sub := (j ->> 'id')::UUID;
  IF public.estado_acesso(a) <> 'pagamento_pendente' THEN RAISE EXCEPTION 'FALHA 26: checkout pendente'; END IF; n := n + 1;

  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'PRE-'||a, 'provider_status', 'authorized'));
  IF public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 27: Premium liberado sem pagamento aprovado'; END IF; n := n + 1;

  ok := FALSE; BEGIN PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'PRE-'||a, 'user_id', b, 'provider_status', 'authorized'));
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 28: assinatura reatribuída a outro usuário'; END IF; n := n + 1;

  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY1-'||a, 'provider_subscription_id', 'PRE-'||a, 'status', 'recusado', 'valor_centavos', 1990));
  IF public.tem_premium(a) OR j ->> 'transicao' <> 'falha' THEN RAISE EXCEPTION 'FALHA 29: primeira cobrança recusada'; END IF; n := n + 1;

  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY2-'||a, 'provider_subscription_id', 'PRE-'||a, 'status', 'pendente', 'valor_centavos', 1990));
  IF public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 30: pagamento pendente liberou acesso'; END IF; n := n + 1;

  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY2-'||a, 'provider_subscription_id', 'PRE-'||a, 'status', 'aprovado', 'valor_centavos', 1990, 'pago_em', NOW()));
  IF j ->> 'transicao' <> 'ativacao' OR public.estado_acesso(a) <> 'ativa' THEN RAISE EXCEPTION 'FALHA 31: ativação após aprovação (%)', j; END IF; n := n + 1;
  SELECT periodo_atual_fim INTO fim1 FROM public.subscriptions WHERE id = sub;

  -- Notificação duplicada: nada muda
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY2-'||a, 'provider_subscription_id', 'PRE-'||a, 'status', 'aprovado', 'valor_centavos', 1990, 'pago_em', NOW()));
  SELECT periodo_atual_fim INTO fim2 FROM public.subscriptions WHERE id = sub;
  IF j ->> 'transicao' <> 'nenhuma' OR fim1 <> fim2 THEN RAISE EXCEPTION 'FALHA 32: duplicata alterou período'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.email_outbox WHERE user_id = a AND modelo = 'assinatura_confirmada';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 33: e-mail de confirmação duplicado ou ausente (%)', cnt; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.payments WHERE user_id = a; IF cnt <> 2 THEN RAISE EXCEPTION 'FALHA 34: pagamentos duplicados'; END IF; n := n + 1;

  -- Assinante consegue criar dados
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano) VALUES (a, 'Novo Premium', 'x', 'Iniciante', 3, '{}');
  SELECT count(*) INTO cnt FROM public.payments; IF cnt <> 2 THEN RAISE EXCEPTION 'FALHA 35: histórico financeiro do próprio usuário'; END IF; n := n + 1;
  j := public.registrar_uso_ia(); IF NOT (j ->> 'permitido')::BOOLEAN THEN RAISE EXCEPTION 'FALHA 36: IA bloqueada para assinante'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- Renovação
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY3-'||a, 'provider_subscription_id', 'PRE-'||a, 'status', 'aprovado', 'valor_centavos', 1990, 'pago_em', fim1 - INTERVAL '1 day'));
  SELECT periodo_atual_fim INTO fim2 FROM public.subscriptions WHERE id = sub;
  IF j ->> 'transicao' <> 'renovacao' OR fim2 <> fim1 + INTERVAL '1 month' THEN RAISE EXCEPTION 'FALHA 37: renovação (% / %)', fim1, fim2; END IF; n := n + 1;

  -- Falha de renovação: inadimplente, mas dentro do período continua com acesso
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY4-'||a, 'provider_subscription_id', 'PRE-'||a, 'status', 'recusado', 'valor_centavos', 1990));
  IF (SELECT status FROM public.subscriptions WHERE id = sub) <> 'inadimplente' OR NOT public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 38: falha de renovação'; END IF; n := n + 1;
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() - INTERVAL '1 day' WHERE id = sub;
  IF public.estado_acesso(a) <> 'tolerancia' THEN RAISE EXCEPTION 'FALHA 39: período de tolerância'; END IF; n := n + 1;
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() - INTERVAL '5 days' WHERE id = sub;
  IF public.estado_acesso(a) <> 'pagamento_pendente' OR public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 40: fim da tolerância'; END IF; n := n + 1;

  -- Regularização
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY5-'||a, 'provider_subscription_id', 'PRE-'||a, 'status', 'aprovado', 'valor_centavos', 1990, 'pago_em', NOW()));
  IF public.estado_acesso(a) <> 'ativa' THEN RAISE EXCEPTION 'FALHA 41: regularização'; END IF; n := n + 1;

  -- Cancelamento: acesso até o fim do período, depois expira
  PERFORM public.billing_cancelar(sub, FALSE);
  IF public.estado_acesso(a) <> 'cancelada_vigente' OR NOT public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 42: cancelamento com período vigente'; END IF; n := n + 1;
  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'PRE-'||a, 'provider_status', 'cancelled'));
  SELECT count(*) INTO cnt FROM public.email_outbox WHERE user_id = a AND modelo = 'assinatura_cancelada';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 43: e-mail de cancelamento duplicado (%)', cnt; END IF; n := n + 1;
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() - INTERVAL '1 minute' WHERE id = sub;
  IF public.estado_acesso(a) <> 'expirada' OR public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 44: término do acesso'; END IF; n := n + 1;

  -- Estorno encerra o acesso do período coberto
  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'PRE2-'||a, 'user_id', a, 'provider_status', 'authorized'));
  PERFORM public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY6-'||a, 'provider_subscription_id', 'PRE2-'||a, 'status', 'aprovado', 'valor_centavos', 1990, 'pago_em', NOW()));
  IF NOT public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 45: nova assinatura'; END IF; n := n + 1;
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'PAY6-'||a, 'provider_subscription_id', 'PRE2-'||a, 'status', 'estornado', 'valor_centavos', 1990, 'valor_estornado_centavos', 1990));
  IF j ->> 'transicao' <> 'estorno' OR public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 46: estorno não encerrou acesso'; END IF; n := n + 1;

  -- Regressão: checkout novo (sem período) não pode rebaixar acesso vigente de assinatura anterior
  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'PRE3-'||a, 'user_id', a, 'provider_status', 'pending'));
  UPDATE public.subscriptions SET status = 'cancelada', periodo_atual_fim = NOW() + INTERVAL '10 days' WHERE provider_subscription_id = 'PRE2-'||a;
  IF public.estado_acesso(a) <> 'cancelada_vigente' THEN RAISE EXCEPTION 'FALHA 46b: checkout pendente rebaixou acesso vigente (%)', public.estado_acesso(a); END IF; n := n + 1;
  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'PRE3-'||a, 'provider_status', 'cancelled'));
  IF public.estado_acesso(a) <> 'cancelada_vigente' THEN RAISE EXCEPTION 'FALHA 46c: cancelamento de checkout nunca ativado rebaixou acesso'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.email_outbox WHERE user_id = a AND dedupe_key = 'cancelada:' || (SELECT id FROM public.subscriptions WHERE provider_subscription_id = 'PRE3-'||a);
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 46d: e-mail de cancelamento para assinatura nunca ativada'; END IF; n := n + 1;

  -- ── Compras avulsas (Pix, boleto, cartão à vista, saldo) ─────────────────
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'AV1-'||b, 'user_id', b, 'status', 'pendente', 'valor_centavos', 1990, 'avulso', TRUE, 'meses', 1));
  IF public.tem_premium(b) OR EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = b) THEN RAISE EXCEPTION 'FALHA 58: Pix pendente liberou acesso'; END IF; n := n + 1;
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'AV1-'||b, 'user_id', b, 'status', 'aprovado', 'valor_centavos', 1990, 'avulso', TRUE, 'meses', 1, 'pago_em', NOW()));
  IF j ->> 'transicao' <> 'ativacao' OR public.estado_acesso(b) <> 'ativa' THEN RAISE EXCEPTION 'FALHA 59: compra avulsa aprovada (%)', j; END IF; n := n + 1;
  SELECT id, periodo_atual_fim INTO sub, fim1 FROM public.subscriptions WHERE user_id = b AND modalidade = 'avulso';
  IF fim1 < NOW() + INTERVAL '27 days' OR fim1 > NOW() + INTERVAL '32 days' OR (SELECT proxima_cobranca FROM public.subscriptions WHERE id = sub) IS NOT NULL
     OR (SELECT subscription_id FROM public.payments WHERE provider_payment_id = 'AV1-'||b) IS DISTINCT FROM sub THEN
    RAISE EXCEPTION 'FALHA 60: período de 1 mês sem cobrança automática'; END IF; n := n + 1;
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'AV1-'||b, 'user_id', b, 'status', 'aprovado', 'valor_centavos', 1990, 'avulso', TRUE, 'meses', 1, 'pago_em', NOW()));
  IF j ->> 'transicao' <> 'nenhuma' OR (SELECT periodo_atual_fim FROM public.subscriptions WHERE id = sub) <> fim1 THEN RAISE EXCEPTION 'FALHA 61: notificação duplicada estendeu o acesso'; END IF; n := n + 1;
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'AV2-'||b, 'user_id', b, 'status', 'aprovado', 'valor_centavos', 19900, 'avulso', TRUE, 'meses', 12, 'pago_em', NOW()));
  SELECT periodo_atual_fim INTO fim2 FROM public.subscriptions WHERE id = sub;
  IF j ->> 'transicao' <> 'renovacao' OR fim2 <> fim1 + INTERVAL '12 months'
     OR (SELECT count(*) FROM public.subscriptions WHERE user_id = b) <> 1
     OR (SELECT meses_periodo FROM public.subscriptions WHERE id = sub) <> 12 THEN
    RAISE EXCEPTION 'FALHA 62: plano anual não somou 12 meses ao período vigente (% / %)', fim1, fim2; END IF; n := n + 1;
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() + INTERVAL '2 days' WHERE id = sub;
  PERFORM public.billing_enfileirar_lembretes(); PERFORM public.billing_enfileirar_lembretes();
  SELECT count(*) INTO cnt FROM public.email_outbox WHERE user_id = b AND modelo = 'renovacao_lembrete';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 63: lembrete de renovação (%)', cnt; END IF; n := n + 1;
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() - INTERVAL '1 hour' WHERE id = sub;
  PERFORM public.billing_enfileirar_lembretes();
  SELECT count(*) INTO cnt FROM public.email_outbox WHERE user_id = b AND modelo = 'acesso_expirado';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 64: aviso de acesso expirado (%)', cnt; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.email_outbox WHERE user_id = a AND modelo IN ('renovacao_lembrete', 'acesso_expirado');
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 65: lembrete enviado a assinante recorrente'; END IF; n := n + 1;
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() + INTERVAL '11 months' WHERE id = sub;
  j := public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'AV2-'||b, 'user_id', b, 'status', 'estornado', 'valor_centavos', 19900, 'avulso', TRUE, 'meses', 12));
  IF j ->> 'transicao' <> 'estorno' OR (SELECT periodo_atual_fim FROM public.subscriptions WHERE id = sub) > NOW() THEN RAISE EXCEPTION 'FALHA 66: estorno do anual não encerrou o período'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'AV3-'||b, 'user_id', b, 'status', 'aprovado', 'valor_centavos', 1990, 'avulso', TRUE, 'meses', 5));
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 67: período avulso inválido aceito'; END IF; n := n + 1;
  PERFORM public.billing_registrar_pagamento(jsonb_build_object('provider_payment_id', 'AV4-'||b, 'user_id', b, 'status', 'recusado', 'valor_centavos', 1990, 'avulso', TRUE, 'meses', 1));
  SELECT count(*) INTO cnt FROM public.email_outbox WHERE user_id = b AND modelo = 'falha_cobranca';
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 68: e-mail de falha de cobrança para compra avulsa recusada'; END IF; n := n + 1;

  -- Cartão recusado na validação: o Mercado Pago cria e cancela a assinatura; quem nunca pagou não fica "expirado"
  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'RX-'||c, 'user_id', c, 'provider_status', 'authorized'));
  PERFORM public.billing_registrar_assinatura(jsonb_build_object('provider_subscription_id', 'RX-'||c, 'provider_status', 'cancelled'));
  IF public.estado_acesso(c) <> 'sem_assinatura' THEN RAISE EXCEPTION 'FALHA 69: cartão recusado aparece como %', public.estado_acesso(c); END IF; n := n + 1;

  -- ── Administrador ───────────────────────────────────────────────────────
  PERFORM public.provisionar_admin('teste-c-'||c||'@exemplo.invalid', 'teste');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.admin_metricas(); IF (j ->> 'usuarios_total')::INT < 3 THEN RAISE EXCEPTION 'FALHA 47: métricas admin'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.admin_usuarios(NULL, 200, 0) WHERE id IN (a, b, c); IF cnt <> 3 THEN RAISE EXCEPTION 'FALHA 48: listagem de usuários'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.payments WHERE user_id = a; IF cnt < 5 THEN RAISE EXCEPTION 'FALHA 49: admin não vê pagamentos'; END IF; n := n + 1;
  UPDATE public.app_config SET valor = valor || '{"preco_centavos": 2490}' WHERE chave = 'plano';
  GET DIAGNOSTICS cnt = ROW_COUNT; IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 50: admin não alterou preço'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.audit_logs WHERE acao = 'app_config.update' AND actor_id = c;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 51: alteração de preço não auditada'; END IF; n := n + 1;
  ok := FALSE; BEGIN UPDATE public.app_config SET valor = valor || '{"preco_centavos": 50}' WHERE chave = 'plano';
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 52: preço inválido aceito'; END IF; n := n + 1;
  UPDATE public.support_tickets SET resposta = 'Resposta oficial', status = 'respondido' WHERE user_id = a;
  SELECT count(*) INTO cnt FROM public.support_tickets WHERE user_id = a AND respondido_em IS NOT NULL;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 53: resposta do admin'; END IF; n := n + 1;
  IF public.estado_acesso(a) IS NULL THEN RAISE EXCEPTION 'FALHA 54: admin consulta estado'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
