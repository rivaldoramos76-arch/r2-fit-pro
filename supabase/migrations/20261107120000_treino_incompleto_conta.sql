-- ============================================================
-- R2 Fit Pro — Treino incompleto também conta.
-- Uma sessão com pelo menos 1 exercício feito vale como treino em tudo: diário de exercícios,
-- ranking e feed dos amigos, curtidas e painel do personal. A coluna gerada `feito` diz isso.
-- O lançamento no diário é criado no primeiro exercício e atualizado a cada exercício feito.
-- Conta só o executado: o tempo é o das séries feitas (séries feitas × (execução + descanso)), sem
-- somar intervalos parados. Enquanto o treino não termina, o lançamento diz "treino incompleto".
-- Basta 1 série feita para entrar no diário. Sem nenhuma série, sai do diário.
-- ============================================================

ALTER TABLE public.sessoes_treino ADD COLUMN IF NOT EXISTS feito BOOLEAN
  GENERATED ALWAYS AS (concluido OR (jsonb_typeof(series_realizadas) = 'object' AND series_realizadas <> '{}'::JSONB)) STORED;
CREATE INDEX IF NOT EXISTS sessoes_treino_feito_idx ON public.sessoes_treino (user_id, data_inicio) WHERE feito;

/** Minutos só das séries feitas: séries feitas × (execução + descanso) de cada exercício.
 *  `p_feitos` = { exercicioId: séries feitas } (o formato antigo em lista conta pelo tamanho). */
CREATE OR REPLACE FUNCTION public._treino_minutos_feitos(p_treino UUID, p_dia INT, p_feitos JSONB)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(round(sum(
           LEAST(
             CASE jsonb_typeof(p_feitos -> (e ->> 'id'))
               WHEN 'number' THEN (p_feitos ->> (e ->> 'id'))::NUMERIC
               WHEN 'array' THEN jsonb_array_length(p_feitos -> (e ->> 'id'))::NUMERIC
               ELSE 0 END,
             COALESCE(NULLIF(substring(e ->> 'series' FROM '\d+'), '')::NUMERIC, 3))
           * (COALESCE(NULLIF(substring(e ->> 'tempo_execucao_segundos' FROM '\d+'), '')::NUMERIC, 40)
              + COALESCE(NULLIF(substring(e ->> 'tempo_descanso_segundos' FROM '\d+'), '')::NUMERIC, 60))) / 60.0)::INT, 0)
  FROM public.treinos t, jsonb_array_elements(COALESCE(t.plano -> 'dias' -> p_dia -> 'exercicios', '[]'::JSONB)) e
  WHERE t.id = p_treino AND jsonb_typeof(t.plano -> 'dias' -> p_dia -> 'exercicios') = 'array'
    AND jsonb_typeof(p_feitos) = 'object' AND p_feitos ? (e ->> 'id');
$$;

CREATE OR REPLACE FUNCTION public.treino_para_diario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n INT; v_plano INT; v_min INT; v_peso NUMERIC; v_data DATE; v_dia TEXT; v_kcal INT; v_nome TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.series_realizadas IS NOT DISTINCT FROM OLD.series_realizadas AND NEW.concluido = OLD.concluido THEN
    RETURN NEW;
  END IF;
  v_n := CASE WHEN jsonb_typeof(NEW.series_realizadas) = 'object' THEN (SELECT count(*) FROM jsonb_object_keys(NEW.series_realizadas)) ELSE 0 END;
  IF v_n = 0 AND NOT NEW.concluido THEN
    DELETE FROM public.exercicios_registro WHERE sessao_id = NEW.id AND origem = 'treino';
    RETURN NEW;
  END IF;
  v_plano := COALESCE(NULLIF(public._treino_minutos_feitos(NEW.treino_id, NEW.dia_index, NEW.series_realizadas), 0),
                      CASE WHEN NEW.concluido THEN 45 ELSE LEAST(45, 10 * GREATEST(v_n, 1)) END);
  v_min := LEAST(GREATEST(v_plano, 1), 180);
  SELECT peso_kg INTO v_peso FROM public.registros_peso WHERE user_id = NEW.user_id ORDER BY data DESC LIMIT 1;
  IF v_peso IS NULL THEN SELECT peso_kg INTO v_peso FROM public.metas_nutricionais WHERE user_id = NEW.user_id; END IF;
  SELECT NULLIF(trim(t.plano -> 'dias' -> NEW.dia_index ->> 'dia'), '') INTO v_dia FROM public.treinos t WHERE t.id = NEW.treino_id;
  v_data := (COALESCE(NEW.data_fim, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_kcal := LEAST(round(4.5 * COALESCE(v_peso, 70) * v_min / 60.0)::INT, 4000);
  v_nome := left('Musculação · ' || COALESCE(v_dia, NULLIF(trim(NEW.treino_nome), ''), 'treino'), 100)
            || CASE WHEN NEW.concluido THEN '' ELSE ' · treino incompleto' END;
  INSERT INTO public.exercicios_registro (user_id, data, nome, duracao_min, calorias, origem, sessao_id)
  VALUES (NEW.user_id, v_data, v_nome, v_min, v_kcal, 'treino', NEW.id)
  ON CONFLICT (sessao_id) WHERE sessao_id IS NOT NULL
  DO UPDATE SET data = EXCLUDED.data, nome = EXCLUDED.nome, duracao_min = EXCLUDED.duracao_min, calorias = EXCLUDED.calorias;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sessoes_treino_diario ON public.sessoes_treino;
CREATE TRIGGER sessoes_treino_diario AFTER INSERT OR UPDATE OF series_realizadas, concluido ON public.sessoes_treino
  FOR EACH ROW EXECUTE FUNCTION public.treino_para_diario();

REVOKE ALL ON FUNCTION public._treino_minutos_feitos(UUID, INT, JSONB), public.treino_para_diario() FROM PUBLIC, anon, authenticated;

-- Contagens: vale treino com pelo menos 1 exercício feito
CREATE OR REPLACE FUNCTION public.acomp_meus_alunos(p_hoje date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  uid UUID := auth.uid();
  hoje DATE := COALESCE(p_hoje, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  IF NOT public.tem_premium() THEN RAISE EXCEPTION 'Para acompanhar alunos é preciso ter o Premium ativo.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY x->>'nome') FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'aluno_id', a.aluno_id, 'nome', public._acomp_nome(a.aluno_id), 'desde', a.created_at,
      'ver_treinos', a.ver_treinos, 'ver_diario', a.ver_diario, 'ver_peso', a.ver_peso, 'editar_planos', a.editar_planos,
      'ultimo_treino', CASE WHEN a.ver_treinos THEN
        (SELECT max(COALESCE(s.data_fim, s.data_inicio)) FROM public.sessoes_treino s WHERE s.user_id = a.aluno_id AND s.feito) END,
      'treinos_7d', CASE WHEN a.ver_treinos THEN
        (SELECT count(*) FROM public.sessoes_treino s WHERE s.user_id = a.aluno_id AND s.feito AND s.data_inicio >= NOW() - INTERVAL '7 days') END,
      'dias_diario_7d', CASE WHEN a.ver_diario THEN
        (SELECT count(DISTINCT f.data) FROM public.food_logs f WHERE f.user_id = a.aluno_id AND f.data > hoje - 7 AND f.data <= hoje) END,
      'kcal_hoje', CASE WHEN a.ver_diario THEN
        (SELECT COALESCE(sum(f.calorias), 0) FROM public.food_logs f WHERE f.user_id = a.aluno_id AND f.data = hoje) END,
      'meta_kcal', CASE WHEN a.ver_diario THEN (SELECT m.calorias FROM public.metas_nutricionais m WHERE m.user_id = a.aluno_id) END,
      'peso', CASE WHEN a.ver_peso THEN
        (SELECT jsonb_build_object('data', p.data, 'peso_kg', p.peso_kg) FROM public.registros_peso p WHERE p.user_id = a.aluno_id ORDER BY p.data DESC LIMIT 1) END,
      'nao_lidas', (SELECT count(*) FROM public.acomp_mensagens mm WHERE mm.acompanhamento_id = a.id AND mm.autor_id = a.aluno_id AND mm.lida_em IS NULL)
    ) AS x
    FROM public.acompanhamentos a WHERE a.personal_id = uid AND a.ativo
  ) t), '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.acomp_dados_aluno(p_aluno uuid, p_inicio date, p_fim date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v public.acompanhamentos := public._acomp_do_personal(p_aluno);
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 62 THEN RAISE EXCEPTION 'Período inválido.'; END IF;
  RETURN jsonb_build_object(
    'id', v.id, 'aluno_id', p_aluno, 'nome', public._acomp_nome(p_aluno), 'desde', v.created_at,
    'ver_treinos', v.ver_treinos, 'ver_diario', v.ver_diario, 'ver_peso', v.ver_peso, 'editar_planos', v.editar_planos,
    'meta', CASE WHEN v.ver_diario OR v.editar_planos THEN (SELECT jsonb_build_object(
        'calorias', m.calorias, 'proteina_g', m.proteina_g, 'carboidrato_g', m.carboidrato_g, 'gordura_g', m.gordura_g,
        'agua_ml', m.meta_agua_ml, 'meta_peso_kg', m.meta_peso_kg, 'somar_exercicio', m.somar_exercicio, 'personalizada', m.personalizada,
        'peso_kg', m.peso_kg, 'objetivo', m.objetivo)
      FROM public.metas_nutricionais m WHERE m.user_id = p_aluno) END,
    'alimentos', CASE WHEN v.ver_diario THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'data', f.data, 'refeicao', f.refeicao, 'nome', f.nome, 'quantidade', f.quantidade, 'calorias', f.calorias,
        'proteina_g', f.proteina_g, 'carboidrato_g', f.carboidrato_g, 'gordura_g', f.gordura_g) ORDER BY f.data, f.created_at)
      FROM public.food_logs f WHERE f.user_id = p_aluno AND f.data BETWEEN p_inicio AND p_fim), '[]'::JSONB) END,
    'agua', CASE WHEN v.ver_diario THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('data', g.data, 'ml', g.ml))
      FROM public.registros_agua g WHERE g.user_id = p_aluno AND g.data BETWEEN p_inicio AND p_fim), '[]'::JSONB) END,
    'exercicios', CASE WHEN v.ver_diario THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('data', e.data, 'nome', e.nome, 'duracao_min', e.duracao_min, 'calorias', e.calorias))
      FROM public.exercicios_registro e WHERE e.user_id = p_aluno AND e.data BETWEEN p_inicio AND p_fim), '[]'::JSONB) END,
    'pesos', CASE WHEN v.ver_peso THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('data', p.data, 'peso_kg', p.peso_kg) ORDER BY p.data)
      FROM (SELECT data, peso_kg FROM public.registros_peso WHERE user_id = p_aluno ORDER BY data DESC LIMIT 180) p), '[]'::JSONB) END,
    'treinos', CASE WHEN v.ver_treinos OR v.editar_planos THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.nome, 'objetivo', t.objetivo, 'nivel', t.nivel, 'frequencia_semanal', t.frequencia_semanal,
        'created_at', t.created_at, 'enviado_por_mim', t.enviado_por IS NOT DISTINCT FROM auth.uid()) ORDER BY t.created_at DESC)
      FROM public.treinos t WHERE t.user_id = p_aluno), '[]'::JSONB) END,
    'sessoes', CASE WHEN v.ver_treinos THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'treino_nome', s.treino_nome, 'dia_index', s.dia_index, 'data_inicio', s.data_inicio, 'data_fim', s.data_fim,
        'concluido', s.concluido, 'feito', s.feito)
        ORDER BY s.data_inicio DESC)
      FROM public.sessoes_treino s WHERE s.user_id = p_aluno
        AND s.data_inicio >= (p_inicio - 1)::TIMESTAMPTZ AND s.data_inicio < (p_fim + 2)::TIMESTAMPTZ), '[]'::JSONB) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.social_feed(p_antes timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE uid UUID := public._social_exigir_perfil();
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'data_fim') DESC) FROM (
    SELECT jsonb_build_object(
      'sessao_id', s.id, 'user_id', s.user_id, 'nome', public._social_nome(s.user_id), 'eu', s.user_id = uid,
      'treino_nome', s.treino_nome, 'dia_index', s.dia_index, 'data_fim', COALESCE(s.data_fim, s.data_inicio),
      'minutos', CASE WHEN s.data_fim IS NOT NULL THEN GREATEST(1, round(extract(epoch FROM s.data_fim - s.data_inicio) / 60))::INT END,
      'exercicios', CASE WHEN jsonb_typeof(s.series_realizadas) = 'object' THEN (SELECT count(*) FROM jsonb_object_keys(s.series_realizadas)) ELSE 0 END,
      'curtidas', (SELECT count(*) FROM public.social_curtidas c WHERE c.sessao_id = s.id),
      'curti', EXISTS (SELECT 1 FROM public.social_curtidas c WHERE c.sessao_id = s.id AND c.user_id = uid),
      'quem_curtiu', (SELECT jsonb_agg(public._social_nome(c.user_id) ORDER BY c.created_at) FROM (SELECT * FROM public.social_curtidas c2 WHERE c2.sessao_id = s.id ORDER BY c2.created_at LIMIT 5) c)
    ) AS x
    FROM public.sessoes_treino s JOIN public.social_perfis p ON p.user_id = s.user_id
    WHERE s.feito
      AND (s.user_id = uid OR (p.mostrar_treinos AND s.user_id IN (SELECT public._social_amigos(uid))))
      AND COALESCE(s.data_fim, s.data_inicio) > NOW() - INTERVAL '30 days'
      AND (p_antes IS NULL OR COALESCE(s.data_fim, s.data_inicio) < p_antes)
    ORDER BY COALESCE(s.data_fim, s.data_inicio) DESC
    LIMIT 30
  ) t), '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.social_curtir(p_sessao uuid, p_curtir boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE uid UUID := public._social_exigir_perfil(); dono UUID;
BEGIN
  SELECT s.user_id INTO dono FROM public.sessoes_treino s JOIN public.social_perfis p ON p.user_id = s.user_id
  WHERE s.id = p_sessao AND s.feito AND (s.user_id = uid OR (p.mostrar_treinos AND s.user_id IN (SELECT public._social_amigos(uid))));
  IF dono IS NULL THEN RAISE EXCEPTION 'Treino não encontrado.'; END IF;
  IF p_curtir THEN
    INSERT INTO public.social_curtidas (sessao_id, user_id) VALUES (p_sessao, uid) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.social_curtidas WHERE sessao_id = p_sessao AND user_id = uid;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.social_ranking(p_inicio date, p_fim date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE uid UUID := public._social_exigir_perfil();
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 31 THEN RAISE EXCEPTION 'Período inválido.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'treinos')::INT DESC, (x->>'dias_diario')::INT DESC, x->>'nome') FROM (
    SELECT jsonb_build_object(
      'user_id', p.user_id, 'nome', public._social_nome(p.user_id), 'eu', p.user_id = uid,
      'treinos', (SELECT count(*) FROM public.sessoes_treino s WHERE s.user_id = p.user_id AND s.feito
                    AND (COALESCE(s.data_fim, s.data_inicio) AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_inicio AND p_fim),
      'dias_diario', (SELECT count(DISTINCT f.data) FROM public.food_logs f WHERE f.user_id = p.user_id AND f.data BETWEEN p_inicio AND p_fim)
    ) AS x
    FROM public.social_perfis p
    WHERE p.entrar_ranking AND (p.user_id = uid OR p.user_id IN (SELECT public._social_amigos(uid)))
  ) t), '[]'::JSONB);
END;
$function$;
