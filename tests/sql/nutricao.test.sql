-- Testes de RLS da meta diária e dos alimentos favoritos.
-- Executa tudo dentro de um bloco DO que termina com RAISE EXCEPTION:
-- nenhuma alteração é persistida. Resultado esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid();  -- sem assinatura
  b UUID := gen_random_uuid();  -- em teste grátis (Premium)
  n INT := 0; cnt INT; ok BOOLEAN; v INT; dt TIMESTAMPTZ;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nutri-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"A"}', NOW(), NOW());
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 7}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nutri-b-'||b||'@exemplo.invalid', 'x', NOW(), '{"nome":"B"}', NOW(), NOW());

  -- ── A (sem assinatura) define a própria meta, mas não favorita ─────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.metas_nutricionais (user_id, sexo, nascimento, altura_cm, peso_kg, atividade, objetivo, ritmo_kg_semana, calorias, proteina_g, carboidrato_g, gordura_g)
  VALUES (a, 'feminino', '1990-01-01', 165, 70, 'leve', 'perder', 0.5, 1700, 140, 160, 55);
  n := n + 1;
  UPDATE public.metas_nutricionais SET calorias = 1800, personalizada = TRUE WHERE user_id = a;
  SELECT calorias INTO v FROM public.metas_nutricionais WHERE user_id = a;
  IF v <> 1800 THEN RAISE EXCEPTION 'FALHA 2: A não editou a própria meta'; END IF; n := n + 1;
  SELECT somar_exercicio::INT INTO v FROM public.metas_nutricionais WHERE user_id = a;
  IF v <> 0 THEN RAISE EXCEPTION 'FALHA 3: somar exercício deveria vir desligado'; END IF; n := n + 1;

  ok := FALSE; BEGIN INSERT INTO public.metas_nutricionais (user_id, sexo, nascimento, altura_cm, peso_kg, atividade, objetivo, calorias, proteina_g, carboidrato_g, gordura_g)
    VALUES (b, 'masculino', '1990-01-01', 180, 80, 'leve', 'manter', 2500, 150, 300, 70);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 4: A criou meta em nome de B'; END IF; n := n + 1;

  ok := FALSE; BEGIN UPDATE public.metas_nutricionais SET calorias = 500 WHERE user_id = a;
  EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 5: aceitou meta abaixo de 800 kcal'; END IF; n := n + 1;

  ok := FALSE; BEGIN INSERT INTO public.alimentos_favoritos (user_id, nome, quantidade, calorias) VALUES (a, 'Arroz', '100 g', 130);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 6: sem Premium favoritou alimento'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- ── B (teste grátis) favorita; não vê nem altera dados de A ────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT public.tem_premium() THEN RAISE EXCEPTION 'FALHA 7: B deveria estar em teste grátis'; END IF; n := n + 1;
  INSERT INTO public.alimentos_favoritos (user_id, nome, quantidade, calorias, proteina_g) VALUES (b, 'Arroz', '100 g', 130, 2.5);
  n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.alimentos_favoritos (user_id, nome, quantidade, calorias) VALUES (b, 'Arroz', '100 g', 130);
  EXCEPTION WHEN unique_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 9: favorito repetido'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.alimentos_favoritos (user_id, nome, quantidade, calorias) VALUES (a, 'Invasão', '', 1);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 10: B favoritou em nome de A'; END IF; n := n + 1;

  SELECT count(*) INTO cnt FROM public.metas_nutricionais; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 11: B vê a meta de A'; END IF; n := n + 1;
  UPDATE public.metas_nutricionais SET calorias = 3000 WHERE user_id = a;
  DELETE FROM public.metas_nutricionais WHERE user_id = a;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);
  SELECT calorias INTO v FROM public.metas_nutricionais WHERE user_id = a;
  IF v IS DISTINCT FROM 1800 THEN RAISE EXCEPTION 'FALHA 12: B alterou/apagou a meta de A'; END IF; n := n + 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.alimentos_favoritos; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 13: A vê favoritos de B'; END IF; n := n + 1;
  DELETE FROM public.alimentos_favoritos WHERE user_id = b;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', TRUE);
  SELECT count(*) INTO cnt FROM public.alimentos_favoritos WHERE user_id = b;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 14: A apagou favoritos de B'; END IF; n := n + 1;

  -- Visitante não acessa
  EXECUTE 'SET LOCAL ROLE anon';
  ok := FALSE; BEGIN SELECT count(*) INTO cnt FROM public.metas_nutricionais;
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok AND cnt <> 0 THEN RAISE EXCEPTION 'FALHA 15: visitante leu metas'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- Excluir a conta apaga meta e favoritos
  DELETE FROM auth.users WHERE id IN (a, b);
  SELECT count(*) INTO cnt FROM public.metas_nutricionais WHERE user_id IN (a, b);
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 16: meta ficou após excluir a conta'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.alimentos_favoritos WHERE user_id IN (a, b);
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 17: favoritos ficaram após excluir a conta'; END IF; n := n + 1;

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
