-- Testes de RLS e da rotina de lembretes. Tudo revertido no fim; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid();  -- sem assinatura
  b UUID := gen_random_uuid();  -- em teste grátis (Premium)
  n INT := 0; cnt INT; ok BOOLEAN; tipos TEXT;
  v_dia DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_agora TIMESTAMPTZ;
BEGIN
  v_agora := (v_dia + TIME '12:05') AT TIME ZONE 'America/Sao_Paulo';
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"A"}', NOW(), NOW());
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 7}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-b-'||b||'@exemplo.invalid', 'x', NOW(), '{"nome":"B"}', NOW(), NOW());

  -- Sem Premium não cria lembrete
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN INSERT INTO public.lembretes (user_id, tipo, horario) VALUES (a, 'almoco', '12:00');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 1: lembrete sem Premium'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- Premium cria; validações de fuso e dias; não grava aparelho nem lê as chaves direto
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.lembretes (user_id, tipo, horario, fuso) VALUES
    (b, 'almoco', '12:00', 'America/Sao_Paulo'), (b, 'agua', '12:00', 'America/Sao_Paulo'),
    (b, 'treino', '12:00', 'America/Sao_Paulo'), (b, 'jantar', '19:30', 'America/Sao_Paulo');
  SELECT count(*) INTO cnt FROM public.lembretes; IF cnt <> 4 THEN RAISE EXCEPTION 'FALHA 2: criar lembretes (%)', cnt; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.lembretes (user_id, tipo, horario, fuso) VALUES (b, 'peso', '07:00', 'Marte/Base');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 3: fuso inválido aceito'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.lembretes (user_id, tipo, horario, dias) VALUES (b, 'peso', '07:00', '{7}');
  EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 4: dia inválido aceito'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.push_inscricoes (user_id, endpoint, p256dh, auth) VALUES (b, 'https://x.example/1', 'k', 'a');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 5: aparelho gravado direto pelo usuário'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM 1 FROM public.push_config;
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 6: chaves VAPID legíveis'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.lembretes_devidos(v_agora);
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 7: usuário executou a rotina'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- A não vê lembretes de B
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.lembretes; IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 8: A vê lembretes de B'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', '', TRUE); -- a rotina roda como serviço (pg_cron)
  -- Rotina: às 12:05 vencem almoço, água e treino; o almoço já registrado não toca; o jantar ainda não venceu
  INSERT INTO public.food_logs (user_id, data, refeicao, nome, quantidade, calorias, proteina_g, carboidrato_g, gordura_g)
  VALUES (b, v_dia, 'Almoço', 'Arroz', '100 g', 128, 2.5, 28, 0.2);
  SELECT string_agg(tipo, ',' ORDER BY tipo) INTO tipos FROM public.lembretes_devidos(v_agora);
  IF tipos IS DISTINCT FROM 'agua,treino' THEN RAISE EXCEPTION 'FALHA 9: devidos às 12:05 (%)', tipos; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.lembretes_devidos(v_agora + INTERVAL '5 minutes');
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 10: repetiu no mesmo dia (%)', cnt; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.lembretes WHERE user_id = b AND tipo = 'almoco' AND ultimo_envio = v_dia;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 11: almoço não marcado como tratado'; END IF; n := n + 1;
  -- Mudar o horário libera para tocar de novo hoje; meta de água batida não toca
  UPDATE public.lembretes SET horario = '12:10' WHERE user_id = b AND tipo IN ('agua', 'treino');
  INSERT INTO public.registros_agua (user_id, data, ml) VALUES (b, v_dia, 2500);
  SELECT string_agg(tipo, ',' ORDER BY tipo) INTO tipos FROM public.lembretes_devidos(v_agora + INTERVAL '6 minutes');
  IF tipos IS DISTINCT FROM 'treino' THEN RAISE EXCEPTION 'FALHA 12: após mudar horário (%)', tipos; END IF; n := n + 1;
  -- Fora da janela de 15 minutos não toca
  SELECT count(*) INTO cnt FROM public.lembretes_janela(((v_dia + TIME '19:50') AT TIME ZONE 'America/Sao_Paulo'));
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 13: tocou fora da janela'; END IF; n := n + 1;
  -- Sem Premium não toca
  UPDATE public.subscriptions SET status = 'cancelada', periodo_atual_fim = NOW() - INTERVAL '1 day' WHERE user_id = b;
  SELECT count(*) INTO cnt FROM public.lembretes_devidos(((v_dia + TIME '19:35') AT TIME ZONE 'America/Sao_Paulo'));
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 14: tocou sem Premium'; END IF; n := n + 1;

  -- Excluir a conta apaga lembretes e aparelhos
  INSERT INTO public.push_inscricoes (user_id, endpoint, p256dh, auth) VALUES (b, 'https://x.example/' || b, 'k', 'a');
  DELETE FROM auth.users WHERE id = b;
  SELECT (SELECT count(*) FROM public.lembretes WHERE user_id = b) + (SELECT count(*) FROM public.push_inscricoes WHERE user_id = b) INTO cnt;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 15: dados ficaram após excluir a conta'; END IF; n := n + 1;

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
