-- Testes de RLS de água, peso e exercício. Tudo revertido no fim; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid();  -- sem assinatura
  b UUID := gen_random_uuid();  -- em teste grátis (Premium)
  n INT := 0; cnt INT; ok BOOLEAN; v NUMERIC;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"A"}', NOW(), NOW());
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 7}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-b-'||b||'@exemplo.invalid', 'x', NOW(), '{"nome":"B"}', NOW(), NOW());

  -- Sem Premium não registra
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN INSERT INTO public.registros_agua (user_id, data, ml) VALUES (a, CURRENT_DATE, 250);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 1: água sem Premium'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.registros_peso (user_id, data, peso_kg) VALUES (a, CURRENT_DATE, 80);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 2: peso sem Premium'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.exercicios_registro (user_id, data, nome, duracao_min, calorias) VALUES (a, CURRENT_DATE, 'Corrida', 30, 300);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 3: exercício sem Premium'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- Premium registra; peso tem um registro por dia (upsert substitui)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.registros_agua (user_id, data, ml) VALUES (b, CURRENT_DATE, 250), (b, CURRENT_DATE, 500);
  INSERT INTO public.exercicios_registro (user_id, data, nome, duracao_min, calorias, origem) VALUES (b, CURRENT_DATE, 'Corrida', 30, 300, 'lista');
  INSERT INTO public.registros_peso (user_id, data, peso_kg) VALUES (b, CURRENT_DATE, 82.6);
  INSERT INTO public.registros_peso (user_id, data, peso_kg) VALUES (b, CURRENT_DATE, 82.1)
    ON CONFLICT (user_id, data) DO UPDATE SET peso_kg = EXCLUDED.peso_kg;
  SELECT peso_kg INTO v FROM public.registros_peso WHERE user_id = b;
  IF v <> 82.1 THEN RAISE EXCEPTION 'FALHA 4: upsert do peso (%)', v; END IF; n := n + 1;
  SELECT sum(ml) INTO cnt FROM public.registros_agua WHERE user_id = b;
  IF cnt <> 750 THEN RAISE EXCEPTION 'FALHA 5: água (%)', cnt; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.registros_peso (user_id, data, peso_kg) VALUES (b, CURRENT_DATE - 1, 900);
  EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 6: peso absurdo aceito'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.registros_agua (user_id, data, ml) VALUES (a, CURRENT_DATE, 250);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 7: B registrou água em nome de A'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- A não vê nem apaga registros de B
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.registros_agua; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 8: A vê água de B'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.registros_peso; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 9: A vê peso de B'; END IF; n := n + 1;
  DELETE FROM public.exercicios_registro WHERE user_id = b;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.exercicios_registro WHERE user_id = b;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 10: A apagou exercício de B'; END IF; n := n + 1;

  -- Excluir a conta apaga tudo
  DELETE FROM auth.users WHERE id = b;
  SELECT (SELECT count(*) FROM public.registros_agua WHERE user_id = b) + (SELECT count(*) FROM public.registros_peso WHERE user_id = b)
       + (SELECT count(*) FROM public.exercicios_registro WHERE user_id = b) INTO cnt;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 11: registros ficaram após excluir a conta'; END IF; n := n + 1;

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
