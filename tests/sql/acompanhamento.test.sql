-- Testes do acompanhamento com personal: convite, o que o aluno compartilha, envio de treino/dieta/meta,
-- mensagens e encerramento. Tudo revertido no fim; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  p UUID := gen_random_uuid();  -- personal (teste grátis = Premium)
  al UUID := gen_random_uuid(); -- aluno (sem assinatura)
  x UUID := gen_random_uuid();  -- estranho (Premium)
  n INT := 0; cnt INT; ok BOOLEAN; j JSONB; cod TEXT; vid UUID; tp UUID; ta UUID; novo UUID; dp UUID;
  claims_p TEXT; claims_al TEXT; claims_x TEXT;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (al, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-al-'||al||'@exemplo.invalid', 'x', NOW(), '{"nome":"Aluna Bia"}', NOW(), NOW());
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 7}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (p, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-p-'||p||'@exemplo.invalid', 'x', NOW(), '{"nome":"Rafa"}', NOW(), NOW()),
         (x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-x-'||x||'@exemplo.invalid', 'x', NOW(), '{"nome":"X"}', NOW(), NOW());
  claims_p := json_build_object('sub', p, 'role', 'authenticated')::TEXT;
  claims_al := json_build_object('sub', al, 'role', 'authenticated')::TEXT;
  claims_x := json_build_object('sub', x, 'role', 'authenticated')::TEXT;

  -- Dados do aluno e treino/dieta do personal (inseridos pelo sistema)
  INSERT INTO public.food_logs (user_id, data, refeicao, nome, calorias) VALUES (al, CURRENT_DATE, 'Almoço', 'Arroz', 300);
  INSERT INTO public.registros_peso (user_id, data, peso_kg) VALUES (al, CURRENT_DATE, 70.5);
  INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano) VALUES (al, 'Treino da Bia', 'emagrecimento', 'iniciante', 3, '{"nome":"Treino da Bia"}') RETURNING id INTO ta;
  INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano) VALUES (p, 'ABC Hipertrofia', 'hipertrofia', 'intermediario', 4, '{"nome":"ABC Hipertrofia"}') RETURNING id INTO tp;
  INSERT INTO public.dietas (user_id, nome, objetivo, calorias_dia, plano) VALUES (p, 'Dieta 1800', 'emagrecimento', 1800, '{}') RETURNING id INTO dp;

  -- 1. Sem Premium não ativa o modo personal
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.acomp_ativar_personal('Bia', NULL); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 1: ativou personal sem Premium'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 2. Personal ativa e recebe código
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.acomp_ativar_personal('Rafa Personal', '123456-G/SP');
  cod := j->>'codigo';
  IF cod !~ '^[A-Z0-9]{6}$' OR j->>'cref' <> '123456-G/SP' THEN RAISE EXCEPTION 'FALHA 2: código (%)', j; END IF; n := n + 1;
  -- 3. Não grava direto nas tabelas
  ok := FALSE; BEGIN INSERT INTO public.acompanhamentos (personal_id, aluno_id) VALUES (p, al); EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 3: insert direto em acompanhamentos'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 4. Aluno vê o convite e aceita sem compartilhar o peso
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.acomp_ver_convite(lower(cod));
  IF j->>'nome' <> 'Rafa Personal' OR (j->>'ja_vinculado')::BOOLEAN THEN RAISE EXCEPTION 'FALHA 4: convite (%)', j; END IF; n := n + 1;
  vid := public.acomp_aceitar(cod, TRUE, TRUE, FALSE, TRUE);
  SELECT count(*) INTO cnt FROM public.acompanhamentos WHERE id = vid AND NOT ver_peso;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 5: vínculo'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 6. Personal vê só o que foi compartilhado e não lê as tabelas do aluno direto
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.acomp_dados_aluno(al, CURRENT_DATE - 6, CURRENT_DATE);
  IF jsonb_array_length(j->'alimentos') <> 1 OR j->'pesos' <> 'null'::JSONB OR jsonb_array_length(j->'treinos') <> 1 THEN RAISE EXCEPTION 'FALHA 6: dados (%)', j; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.food_logs WHERE user_id = al;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 7: personal leu food_logs direto'; END IF; n := n + 1;
  j := public.acomp_meus_alunos(CURRENT_DATE);
  IF jsonb_array_length(j) <> 1 OR (j->0->>'kcal_hoje')::INT <> 300 OR j->0->'peso' <> 'null'::JSONB OR (j->0->>'nao_lidas')::INT <> 1 THEN RAISE EXCEPTION 'FALHA 8: lista de alunos (%)', j; END IF; n := n + 1;

  -- 9. Envia treino novo e substitui; envia dieta
  novo := public.acomp_enviar_treino(al, tp, NULL);
  PERFORM public.acomp_enviar_treino(al, tp, ta);
  PERFORM public.acomp_enviar_dieta(al, dp);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.treinos WHERE user_id = al AND enviado_por = p AND nome = 'ABC Hipertrofia';
  IF cnt <> 2 THEN RAISE EXCEPTION 'FALHA 9: treinos enviados (%)', cnt; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.dietas WHERE user_id = al AND enviado_por = p;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 10: dieta enviada'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.acomp_mensagens WHERE acompanhamento_id = vid AND tipo IN ('treino', 'dieta');
  IF cnt <> 3 THEN RAISE EXCEPTION 'FALHA 11: avisos na conversa (%)', cnt; END IF; n := n + 1;

  -- 12. Não envia treino que não é dele; copia treino do aluno para editar
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.acomp_enviar_treino(al, ta, NULL); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 12: enviou treino do próprio aluno como seu'; END IF; n := n + 1;
  novo := public.acomp_copiar_treino(al, ta);
  SELECT count(*) INTO cnt FROM public.treinos WHERE id = novo AND user_id = p AND nome = 'ABC Hipertrofia · Aluna Bia';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 13: cópia do treino'; END IF; n := n + 1;
  -- Reenviar a cópia tira o nome do aluno do título
  PERFORM public.acomp_enviar_treino(al, novo, ta);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.treinos WHERE id = ta AND nome = 'ABC Hipertrofia' AND plano->>'nome' = 'ABC Hipertrofia';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 14: nome ao reenviar a cópia'; END IF; n := n + 1;

  -- 15. Meta: exige a meta configurada pelo aluno; depois ajusta
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.acomp_definir_meta(al, 1800, 130, 180, 60); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 15: meta sem configuração'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  INSERT INTO public.metas_nutricionais (user_id, sexo, nascimento, altura_cm, peso_kg, atividade, objetivo, calorias, proteina_g, carboidrato_g, gordura_g)
  VALUES (al, 'feminino', '1995-01-01', 165, 70, 'leve', 'perder', 1600, 110, 160, 55);
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.acomp_definir_meta(al, 1800, 130, 180, 60, 2500, NULL);
  ok := FALSE; BEGIN PERFORM public.acomp_definir_meta(al, 500, 10, 10, 10); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 16: meta absurda aceita'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.metas_nutricionais WHERE user_id = al AND calorias = 1800 AND meta_agua_ml = 2500 AND personalizada;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 17: meta ajustada'; END IF; n := n + 1;

  -- 18. Estranho (mesmo Premium) não vê nada nem manda mensagem
  PERFORM set_config('request.jwt.claims', claims_x, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.acomp_dados_aluno(al, CURRENT_DATE - 6, CURRENT_DATE); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 18: estranho leu dados do aluno'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.acomp_mensagens;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 19: estranho vê mensagens'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.acomp_enviar_mensagem(vid, 'oi'); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 20: estranho mandou mensagem'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 21. Mensagens: aluno manda, personal lê e marca como lida
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.acomp_enviar_mensagem(vid, '  Treinei hoje!  ');
  j := public.acomp_nao_lidas();
  IF (j->>'como_aluno')::INT <> 5 OR (j->>'personal')::BOOLEAN THEN RAISE EXCEPTION 'FALHA 21: não lidas do aluno (%)', j; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.acomp_enviar_mensagem(vid, '   '); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 22: mensagem vazia'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.acomp_mensagens WHERE texto = 'Treinei hoje!';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 23: personal não vê a mensagem'; END IF; n := n + 1;
  PERFORM public.acomp_marcar_lidas(vid);
  j := public.acomp_nao_lidas();
  IF (j->>'como_personal')::INT <> 0 OR NOT (j->>'personal')::BOOLEAN THEN RAISE EXCEPTION 'FALHA 24: marcar lidas (%)', j; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 25. Aluno tira a permissão de enviar: personal não envia mais
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.acomp_atualizar(vid, TRUE, FALSE, FALSE, FALSE);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.acomp_enviar_treino(al, tp, NULL); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 25: enviou sem permissão'; END IF; n := n + 1;
  j := public.acomp_dados_aluno(al, CURRENT_DATE - 6, CURRENT_DATE);
  IF j->'alimentos' <> 'null'::JSONB OR j->'meta' <> 'null'::JSONB THEN RAISE EXCEPTION 'FALHA 26: diário ainda visível'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 27. Aluno encerra: personal perde o acesso na hora
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.acomp_encerrar(vid);
  j := public.acomp_meus_personais();
  IF jsonb_array_length(j) <> 0 THEN RAISE EXCEPTION 'FALHA 27: ainda listado'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.acomp_dados_aluno(al, CURRENT_DATE - 6, CURRENT_DATE); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 28: personal leu após encerrar'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 29. Excluir a conta do personal apaga o vínculo e as mensagens
  DELETE FROM auth.users WHERE id = p;
  SELECT count(*) INTO cnt FROM public.acompanhamentos WHERE id = vid;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 29: vínculo ficou após excluir a conta'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.treinos WHERE user_id = al AND enviado_por IS NULL AND nome = 'ABC Hipertrofia';
  IF cnt < 1 THEN RAISE EXCEPTION 'FALHA 30: treinos enviados sumiram com a conta do personal'; END IF; n := n + 1;

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
