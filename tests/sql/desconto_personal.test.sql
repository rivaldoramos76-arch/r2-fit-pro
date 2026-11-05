-- Testes do desconto do personal: 20% por aluno pagante, mínimo R$ 5,00, grátis a partir de 5,
-- só alunos pagantes contam e cada aluno conta para um personal só. Tudo revertido; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  p UUID := gen_random_uuid(); p2 UUID := gen_random_uuid(); x UUID := gen_random_uuid();
  al UUID[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  teste UUID := gen_random_uuid(); cort UUID := gen_random_uuid();
  n INT := 0; i INT; j JSONB; ok BOOLEAN; cnt INT;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0, "preco_centavos": 1990}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-'||u||'@exemplo.invalid', 'x', NOW(), '{}', NOW(), NOW()
  FROM unnest(al || ARRAY[p, p2, x, teste, cort]) u;
  INSERT INTO public.personais (user_id, codigo) VALUES (p, 'TSTAAA'), (p2, 'TSTBBB');
  -- Alunos pagantes (assinatura com período pago vigente)
  INSERT INTO public.subscriptions (user_id, provider, modalidade, status, plano_nome, preco_centavos, iniciada_em, periodo_atual_fim)
  SELECT u, 'asaas', 'recorrente', 'ativa', 'Premium', 1990, NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days' FROM unnest(al) u;
  -- Teste grátis e cortesia não contam
  INSERT INTO public.subscriptions (user_id, provider, modalidade, status, plano_nome, preco_centavos, iniciada_em, periodo_atual_fim)
  VALUES (teste, 'teste', 'teste', 'ativa', 'Premium', 1990, NOW(), NOW() + INTERVAL '5 days'),
         (cort, 'cortesia', 'cortesia', 'ativa', 'Premium', 1990, NOW(), NOW() + INTERVAL '5 days');
  INSERT INTO public.acompanhamentos (personal_id, aluno_id, created_at) VALUES
    (p, al[1], NOW() - INTERVAL '10 days'), (p, al[2], NOW() - INTERVAL '10 days'),
    (p, teste, NOW()), (p, cort, NOW());

  -- 1. Dois pagantes: 40% → R$ 11,94; teste e cortesia não contam
  j := public.acomp_desconto_personal(p);
  IF (j->>'alunos_pagantes')::INT <> 2 OR (j->>'percentual')::INT <> 40 OR (j->>'preco_centavos')::INT <> 1194 OR (j->>'gratis')::BOOLEAN THEN
    RAISE EXCEPTION 'FALHA 1: dois pagantes (%)', j; END IF; n := n + 1;

  -- 2. Aluno que já tem personal não conta para o segundo
  INSERT INTO public.acompanhamentos (personal_id, aluno_id) VALUES (p2, al[1]), (p2, al[6]);
  IF (public.acomp_desconto_personal(p2)->>'alunos_pagantes')::INT <> 1 THEN RAISE EXCEPTION 'FALHA 2: aluno contado para dois personais'; END IF; n := n + 1;
  IF (public.acomp_desconto_personal(p)->>'alunos_pagantes')::INT <> 2 THEN RAISE EXCEPTION 'FALHA 3: primeiro personal perdeu o aluno'; END IF; n := n + 1;

  -- 4. Quatro pagantes: 80% daria R$ 3,98, fica no mínimo de R$ 5,00
  INSERT INTO public.acompanhamentos (personal_id, aluno_id) VALUES (p, al[3]), (p, al[4]);
  j := public.acomp_desconto_personal(p);
  IF (j->>'preco_centavos')::INT <> 500 OR (j->>'faltam_para_gratis')::INT <> 1 THEN RAISE EXCEPTION 'FALHA 4: mínimo de R$ 5 (%)', j; END IF; n := n + 1;

  -- 5. Cinco pagantes: grátis, e a rotina libera o acesso bônus
  INSERT INTO public.acompanhamentos (personal_id, aluno_id) VALUES (p, al[5]);
  j := public.acomp_desconto_personal(p);
  IF NOT (j->>'gratis')::BOOLEAN OR (j->>'preco_centavos')::INT <> 0 THEN RAISE EXCEPTION 'FALHA 5: grátis (%)', j; END IF; n := n + 1;
  PERFORM public.acomp_rotina_bonus();
  PERFORM public.acomp_rotina_bonus(); -- rodar de novo não duplica
  SELECT count(*) INTO cnt FROM public.subscriptions WHERE user_id = p AND provider = 'personal_bonus' AND status = 'ativa';
  IF cnt <> 1 OR public.estado_acesso(p) <> 'ativa' THEN RAISE EXCEPTION 'FALHA 6: bônus (% / %)', cnt, public.estado_acesso(p); END IF; n := n + 1;

  -- 7. Aluno para de pagar: volta a ter desconto e o bônus vence sem ser renovado
  UPDATE public.subscriptions SET status = 'expirada', periodo_atual_fim = NOW() - INTERVAL '1 day' WHERE user_id = al[5] AND provider = 'asaas';
  IF (public.acomp_desconto_personal(p)->>'gratis')::BOOLEAN THEN RAISE EXCEPTION 'FALHA 7: grátis com 4 pagantes'; END IF; n := n + 1;
  UPDATE public.subscriptions SET periodo_atual_fim = NOW() - INTERVAL '1 minute' WHERE user_id = p AND provider = 'personal_bonus';
  PERFORM public.acomp_rotina_bonus();
  SELECT count(*) INTO cnt FROM public.subscriptions WHERE user_id = p AND provider = 'personal_bonus' AND status = 'expirada';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 8: bônus não venceu'; END IF; n := n + 1;

  -- 9. O bônus do personal não conta como aluno pagante para outro personal
  INSERT INTO public.acompanhamentos (personal_id, aluno_id) VALUES (p2, p);
  IF (public.acomp_desconto_personal(p2)->>'alunos_pagantes')::INT <> 1 THEN RAISE EXCEPTION 'FALHA 9: bônus contado como pagamento'; END IF; n := n + 1;

  -- 10. O cliente só vê o próprio desconto; quem não é personal recebe nulo
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF (public.acomp_meu_desconto()->>'alunos_pagantes')::INT <> 4 THEN RAISE EXCEPTION 'FALHA 10: meu desconto'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.acomp_desconto_personal(p2); EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 11: consultou desconto de outro personal'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.acomp_meu_desconto() IS NOT NULL THEN RAISE EXCEPTION 'FALHA 12: não personal com desconto'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
