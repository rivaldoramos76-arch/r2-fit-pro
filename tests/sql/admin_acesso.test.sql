-- Testes das ações do administrador (admin_gerenciar_acesso) e da edição no diário.
-- Executa tudo dentro de um bloco DO que termina com RAISE EXCEPTION:
-- nenhuma alteração é persistida. Resultado esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid();  -- cliente
  c UUID := gen_random_uuid();  -- administrador
  n INT := 0; cnt INT; ok BOOLEAN; j JSONB; v TEXT; fim TIMESTAMPTZ; pid UUID; f UUID;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"Cliente"}', NOW(), NOW()),
         (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-c-'||c||'@exemplo.invalid', 'x', NOW(), '{"nome":"Admin"}', NOW(), NOW());
  PERFORM public.provisionar_admin('adm-c-'||c||'@exemplo.invalid', 'teste');

  -- Cliente comum não executa ações de admin nem edita alimento sem Premium
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.admin_gerenciar_acesso(a, 'cortesia', '{}');
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 1: cliente liberou o próprio acesso'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  INSERT INTO public.food_logs (user_id, nome, quantidade, calorias) VALUES (a, 'Ovo', '4 ovos', 312) RETURNING id INTO f;
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN UPDATE public.food_logs SET calorias = 156 WHERE id = f;
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 2: sem Premium editou alimento'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- Admin: cortesia com data, estender, encerrar
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.admin_gerenciar_acesso(a, 'cortesia', jsonb_build_object('ate', (CURRENT_DATE + 10)::TEXT));
  IF j ->> 'estado' <> 'ativa' THEN RAISE EXCEPTION 'FALHA 3: cortesia não liberou (%)', j; END IF; n := n + 1;
  fim := (j ->> 'acesso_ate')::TIMESTAMPTZ;
  IF fim < NOW() + INTERVAL '9 days' OR fim > NOW() + INTERVAL '12 days' THEN RAISE EXCEPTION 'FALHA 4: data da cortesia (%)', fim; END IF; n := n + 1;
  j := public.admin_gerenciar_acesso(a, 'estender', '{"dias": 5}');
  IF (j ->> 'acesso_ate')::TIMESTAMPTZ <> fim + INTERVAL '5 days' THEN RAISE EXCEPTION 'FALHA 5: estender (%)', j; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.admin_gerenciar_acesso(a, 'estender', '{"dias": 0}');
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 6: aceitou 0 dias'; END IF; n := n + 1;
  j := public.admin_gerenciar_acesso(a, 'cortesia', '{}');
  SELECT count(*) INTO cnt FROM public.subscriptions WHERE user_id = a AND modalidade = 'cortesia';
  IF cnt <> 1 OR (j ->> 'acesso_ate')::TIMESTAMPTZ < '2099-01-01' THEN RAISE EXCEPTION 'FALHA 7: cortesia vitalícia deveria atualizar a existente'; END IF; n := n + 1;
  j := public.admin_gerenciar_acesso(a, 'encerrar', '{}');
  IF public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 8: encerrar não tirou o acesso'; END IF; n := n + 1;

  -- Pagamento manual libera 1 mês e envia confirmação; alterar status para estornado encerra
  j := public.admin_gerenciar_acesso(a, 'pagamento_manual', '{"meses": 1, "valor_centavos": 1990, "observacao": "Pix direto"}');
  IF NOT public.tem_premium(a) OR j ->> 'transicao' NOT IN ('ativacao', 'renovacao') THEN RAISE EXCEPTION 'FALHA 9: pagamento manual (%)', j; END IF; n := n + 1;
  SELECT id INTO pid FROM public.payments WHERE user_id = a AND metodo = 'manual';
  IF pid IS NULL THEN RAISE EXCEPTION 'FALHA 10: pagamento manual não registrado'; END IF; n := n + 1;
  j := public.admin_gerenciar_acesso(a, 'status_pagamento', jsonb_build_object('payment_id', pid, 'status', 'estornado'));
  IF public.tem_premium(a) OR j ->> 'transicao' <> 'estorno' THEN RAISE EXCEPTION 'FALHA 11: estorno pelo admin (%)', j; END IF; n := n + 1;
  j := public.admin_gerenciar_acesso(a, 'status_pagamento', jsonb_build_object('payment_id', pid, 'status', 'aprovado'));
  SELECT status INTO v FROM public.payments WHERE id = pid;
  -- Voltar um estorno para "aprovado" corrige o registro, mas não devolve o acesso sozinho
  IF v <> 'aprovado' OR public.tem_premium(a) THEN RAISE EXCEPTION 'FALHA 12: voltar para aprovado (%)', v; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.admin_gerenciar_acesso(a, 'pagamento_manual', '{"meses": 5, "valor_centavos": 1990}');
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 13: período inválido aceito'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.audit_logs WHERE actor_id = c AND acao LIKE 'admin.%';
  IF cnt < 7 THEN RAISE EXCEPTION 'FALHA 14: ações não auditadas (%)', cnt; END IF; n := n + 1;
  PERFORM public.admin_gerenciar_acesso(a, 'cortesia', '{}');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- Com Premium, o cliente edita o próprio alimento; não edita o de outro
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.food_logs SET calorias = 156, quantidade = '2 ovos' WHERE id = f;
  SELECT quantidade INTO v FROM public.food_logs WHERE id = f;
  IF v <> '2 ovos' THEN RAISE EXCEPTION 'FALHA 15: cliente Premium não editou o alimento'; END IF; n := n + 1;
  ok := FALSE; BEGIN UPDATE public.food_logs SET user_id = c WHERE id = f;
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 16: passou o alimento para outra conta'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
