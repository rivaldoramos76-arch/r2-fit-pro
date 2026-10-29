-- Testes de RLS das receitas. Tudo revertido no fim; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid();  -- sem assinatura
  b UUID := gen_random_uuid();  -- em teste grátis (Premium)
  n INT := 0; cnt INT; ok BOOLEAN; rid UUID; v NUMERIC;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"A"}', NOW(), NOW());
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 7}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-b-'||b||'@exemplo.invalid', 'x', NOW(), '{"nome":"B"}', NOW(), NOW());

  -- Sem Premium não cria receita
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN INSERT INTO public.receitas (user_id, nome) VALUES (a, 'Bolo');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 1: receita sem Premium'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- Premium cria e edita; validações
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.receitas (user_id, nome, porcoes, ingredientes)
  VALUES (b, 'Frango com arroz', 4, '[{"nome":"Arroz","quantidade":"200 g","calorias":256,"proteina_g":5,"carboidrato_g":56,"gordura_g":0.4}]')
  RETURNING id INTO rid;
  UPDATE public.receitas SET porcoes = 5 WHERE id = rid RETURNING porcoes INTO v;
  IF v IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'FALHA 2: edição da receita'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.receitas (user_id, nome, porcoes) VALUES (b, 'X', 0);
  EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 3: 0 porções aceito'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.receitas (user_id, nome, ingredientes) VALUES (b, 'X', '{"a":1}');
  EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 4: ingredientes fora de lista aceito'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.receitas (user_id, nome) VALUES (a, 'Em nome de A');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 5: B criou receita em nome de A'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- A não vê, não edita nem apaga receitas de B
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.receitas; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 6: A vê receita de B'; END IF; n := n + 1;
  UPDATE public.receitas SET nome = 'Hackeada' WHERE id = rid;
  DELETE FROM public.receitas WHERE id = rid;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.receitas WHERE id = rid AND nome = 'Frango com arroz';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 7: A alterou/apagou receita de B'; END IF; n := n + 1;

  -- O dono vê e apaga
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.receitas; IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 8: dono não vê a receita'; END IF; n := n + 1;
  DELETE FROM public.receitas WHERE id = rid;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.receitas WHERE id = rid;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 9: dono não apagou'; END IF; n := n + 1;

  -- Excluir a conta apaga as receitas
  INSERT INTO public.receitas (user_id, nome) VALUES (b, 'Outra');
  DELETE FROM auth.users WHERE id = b;
  SELECT count(*) INTO cnt FROM public.receitas WHERE user_id = b;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 10: receitas ficaram após excluir a conta'; END IF; n := n + 1;

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
