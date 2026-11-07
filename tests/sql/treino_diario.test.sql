-- Testes do treino no diário: sessão concluída vira exercício com duração e calorias estimadas,
-- sem duplicar, treino incompleto também conta e sai do diário se ficar sem exercícios. Tudo revertido; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  u UUID := gen_random_uuid(); tid UUID; sid UUID; sid2 UUID; sid3 UUID; n INT := 0; cnt INT; i INT; r RECORD;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-'||u||'@exemplo.invalid', 'x', NOW(), '{}', NOW(), NOW());
  INSERT INTO public.registros_peso (user_id, data, peso_kg) VALUES (u, CURRENT_DATE, 80);
  -- Plano: 2 exercícios × 4 séries × (40 + 60 s) = 13 min
  INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano)
  VALUES (u, 'Hipertrofia', 'hipertrofia', 'iniciante', 3, '{"dias": [{"dia": "Treino A", "exercicios": [{"id": "e1", "nome": "Supino", "series": "4"}, {"id": "e2", "nome": "Remada", "series": "4"}]}]}')
  RETURNING id INTO tid;

  -- 1. Treino concluído (mesmo levando 50 min no relógio) conta só o executado: 13 min, 4,5 × 80 × 13/60 = 78 kcal
  INSERT INTO public.sessoes_treino (user_id, treino_id, treino_nome, dia_index, data_inicio, data_fim, concluido, series_realizadas)
  VALUES (u, tid, 'Hipertrofia', 0, NOW() - INTERVAL '50 minutes', NOW(), TRUE, '{"e1": 4, "e2": 4}') RETURNING id INTO sid;
  SELECT * INTO r FROM public.exercicios_registro WHERE sessao_id = sid;
  IF r.nome <> 'Musculação · Treino A' OR r.duracao_min <> 13 OR r.calorias <> 78 OR r.origem <> 'treino'
     OR r.data <> (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'FALHA 1: lançamento (% / % / % / %)', r.nome, r.duracao_min, r.calorias, r.data; END IF; n := n + 1;

  -- 2. Atualizar de novo como concluída não duplica
  UPDATE public.sessoes_treino SET concluido = TRUE WHERE id = sid;
  SELECT count(*) INTO cnt FROM public.exercicios_registro WHERE user_id = u;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 2: duplicou (%)', cnt; END IF; n := n + 1;

  -- 3. Sem nenhum exercício sai do diário; feito de novo volta
  UPDATE public.sessoes_treino SET concluido = FALSE, series_realizadas = '{}' WHERE id = sid;
  SELECT count(*) INTO cnt FROM public.exercicios_registro WHERE user_id = u;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 3: ficou no diário após desmarcar'; END IF; n := n + 1;
  UPDATE public.sessoes_treino SET concluido = TRUE, series_realizadas = '{"e1": 4, "e2": 4}' WHERE id = sid;
  SELECT count(*) INTO cnt FROM public.exercicios_registro WHERE user_id = u;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 4: não voltou ao marcar'; END IF; n := n + 1;

  -- 5. Outra sessão completa: 13 min do plano
  INSERT INTO public.sessoes_treino (user_id, treino_id, treino_nome, dia_index, data_inicio, data_fim, concluido, series_realizadas)
  VALUES (u, tid, 'Hipertrofia', 0, NOW() - INTERVAL '2 minutes', NOW(), TRUE, '{"e1": 4, "e2": 4}') RETURNING id INTO sid2;
  SELECT * INTO r FROM public.exercicios_registro WHERE sessao_id = sid2;
  IF r.duracao_min <> 13 OR r.calorias <> round(4.5 * 80 * 13 / 60.0)::INT THEN
    RAISE EXCEPTION 'FALHA 5: duração pelo plano (% / %)', r.duracao_min, r.calorias; END IF; n := n + 1;

  -- 6. Apagado à mão não volta só por outra alteração da sessão (sem novo exercício feito)
  DELETE FROM public.exercicios_registro WHERE sessao_id = sid2;
  UPDATE public.sessoes_treino SET data_fim = NOW() WHERE id = sid2;
  SELECT count(*) INTO cnt FROM public.exercicios_registro WHERE sessao_id = sid2;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 6: voltou após apagar'; END IF; n := n + 1;

  -- 6b. Treino incompleto conta: 1 de 2 exercícios feito entra no diário com o tempo só desse exercício
  INSERT INTO public.sessoes_treino (user_id, treino_id, treino_nome, dia_index, data_inicio, data_fim, concluido, series_realizadas)
  VALUES (u, tid, 'Hipertrofia', 0, NOW() - INTERVAL '1 minute', NOW(), FALSE, '{}') RETURNING id INTO sid3;
  SELECT count(*) INTO cnt FROM public.exercicios_registro WHERE sessao_id = sid3;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 6b: sessão vazia no diário'; END IF;
  -- 2 de 4 séries do primeiro exercício: 2 × (40 + 60 s) = 3 min, marcado como treino incompleto
  UPDATE public.sessoes_treino SET series_realizadas = '{"e1": 2}' WHERE id = sid3;
  SELECT * INTO r FROM public.exercicios_registro WHERE sessao_id = sid3;
  IF r.duracao_min IS NULL OR r.duracao_min <> 3 OR r.nome <> 'Musculação · Treino A · treino incompleto'
     OR r.calorias <> round(4.5 * 80 * 3 / 60.0)::INT THEN
    RAISE EXCEPTION 'FALHA 6b: incompleto (% / % / %)', r.nome, r.duracao_min, r.calorias; END IF; n := n + 1;
  IF NOT (SELECT feito FROM public.sessoes_treino WHERE id = sid3) THEN RAISE EXCEPTION 'FALHA 6c: incompleto não conta'; END IF; n := n + 1;
  -- 6d. Ao fazer o segundo, o mesmo lançamento é atualizado (sem duplicar)
  UPDATE public.sessoes_treino SET series_realizadas = '{"e1": 4, "e2": 4}' WHERE id = sid3;
  SELECT count(*), max(duracao_min) INTO cnt, i FROM public.exercicios_registro WHERE sessao_id = sid3;
  IF cnt <> 1 OR i <> 13 THEN RAISE EXCEPTION 'FALHA 6d: atualização (% / %)', cnt, i; END IF; n := n + 1;
  -- 6e. Ao concluir, some o "treino incompleto" do nome
  UPDATE public.sessoes_treino SET concluido = TRUE WHERE id = sid3;
  IF (SELECT nome FROM public.exercicios_registro WHERE sessao_id = sid3) <> 'Musculação · Treino A' THEN RAISE EXCEPTION 'FALHA 6e: nome ao concluir'; END IF; n := n + 1;

  -- 7. Apagar a sessão mantém o exercício no diário (sessao_id vira nulo)
  DELETE FROM public.sessoes_treino WHERE id = sid;
  SELECT count(*) INTO cnt FROM public.exercicios_registro WHERE user_id = u AND sessao_id IS NULL AND origem = 'treino';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 7: apagar a sessão'; END IF; n := n + 1;

  -- 8. O cliente não chama as funções internas
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::TEXT, TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public._treino_minutos_plano(tid, 0);
    RAISE EXCEPTION 'FALHA 8: função interna liberada';
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1;
  END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
