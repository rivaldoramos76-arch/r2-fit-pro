-- Testes do banco compartilhado de alimentos (alimentos_base / salvar_alimento_base).
-- Executa tudo dentro de um bloco DO que termina com RAISE EXCEPTION: nada é persistido.
-- Resultado esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid();  -- sem assinatura
  b UUID := gen_random_uuid();  -- em teste grátis (Premium)
  n INT := 0; cnt INT; ok BOOLEAN; r public.alimentos_base; r2 public.alimentos_base; i INT;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ab-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"A"}', NOW(), NOW());
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 7}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ab-b-'||b||'@exemplo.invalid', 'x', NOW(), '{"nome":"B"}', NOW(), NOW());

  IF public.normalizar_nome_alimento('  Açaí   na Tigela ') <> 'acai na tigela' THEN RAISE EXCEPTION 'FALHA 1: normalização'; END IF; n := n + 1;

  -- Sem Premium não grava; ninguém grava direto na tabela
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.salvar_alimento_base('{"nome":"Teste","kcal":100,"proteina":1,"carboidrato":1,"gordura":1,"fonte":"ia"}');
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 2: sem Premium gravou'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN INSERT INTO public.alimentos_base (nome, nome_busca, kcal, proteina, carboidrato, gordura, fonte) VALUES ('X', 'x', 1, 1, 1, 1, 'ia');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 3: inserção direta permitida'; END IF; n := n + 1;

  -- Premium grava; mesmo nome não duplica (devolve o existente)
  r := public.salvar_alimento_base('{"nome":"Açaí na tigela","kcal":140,"proteina":2,"carboidrato":24,"gordura":4,"porcao_rotulo":"tigela","porcao_g":300,"fonte":"ia"}');
  IF r.nome_busca <> 'acai na tigela' OR r.criado_por <> b THEN RAISE EXCEPTION 'FALHA 4: gravação'; END IF; n := n + 1;
  r2 := public.salvar_alimento_base('{"nome":"acai NA tigela","kcal":999,"proteina":2,"carboidrato":24,"gordura":4,"fonte":"ia"}');
  IF r2.id <> r.id OR r2.kcal <> 140 THEN RAISE EXCEPTION 'FALHA 5: duplicou ou sobrescreveu'; END IF; n := n + 1;

  -- Código de barras: único e validado
  r := public.salvar_alimento_base('{"nome":"Achocolatado","codigo_barras":"7891000100103","kcal":380,"proteina":4,"carboidrato":88,"gordura":2,"porcao_g":20,"fonte":"off"}');
  r2 := public.salvar_alimento_base('{"nome":"Outro nome","codigo_barras":"7891000100103","kcal":1,"proteina":1,"carboidrato":1,"gordura":1,"fonte":"rotulo"}');
  IF r2.id <> r.id THEN RAISE EXCEPTION 'FALHA 6: código duplicado'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.salvar_alimento_base('{"nome":"Errado","codigo_barras":"12","kcal":1,"proteina":1,"carboidrato":1,"gordura":1,"fonte":"off"}');
  EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 7: código inválido aceito'; END IF; n := n + 1;

  -- Valores fora da faixa são recusados
  ok := FALSE; BEGIN PERFORM public.salvar_alimento_base('{"nome":"Absurdo","kcal":5000,"proteina":1,"carboidrato":1,"gordura":1,"fonte":"ia"}');
  EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 8: kcal absurda aceita'; END IF; n := n + 1;

  -- Todos os assinantes leem
  SELECT count(*) INTO cnt FROM public.alimentos_base WHERE nome_busca IN ('acai na tigela', 'achocolatado');
  IF cnt <> 2 THEN RAISE EXCEPTION 'FALHA 9: leitura (%)', cnt; END IF; n := n + 1;

  -- Limite diário por pessoa (60)
  FOR i IN 1..58 LOOP
    PERFORM public.salvar_alimento_base(jsonb_build_object('nome', 'Item ' || i, 'kcal', 10, 'proteina', 1, 'carboidrato', 1, 'gordura', 1, 'fonte', 'ia'));
  END LOOP;
  ok := FALSE; BEGIN PERFORM public.salvar_alimento_base('{"nome":"Item extra","kcal":10,"proteina":1,"carboidrato":1,"gordura":1,"fonte":"ia"}');
  EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 10: limite diário'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- Visitante não lê
  EXECUTE 'SET LOCAL ROLE anon';
  ok := FALSE; BEGIN SELECT count(*) INTO cnt FROM public.alimentos_base;
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 11: visitante leu o banco'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
