-- Cardio e HIIT no treino (boxe, corrida, bike…): exercícios com "tipo": "cardio" e "met" no plano.
-- O lançamento no diário passa a somar o gasto de cada exercício pelo seu MET (musculação continua 4,5)
-- e o nome diz "Cardio" (só cardio), "Musculação" (só musculação) ou "Treino" (misto).

/** Minutos das séries feitas × MET de cada exercício (para kcal = soma × peso / 60), e quantos feitos são cardio. */
CREATE OR REPLACE FUNCTION public._treino_met_minutos(p_treino UUID, p_dia INT, p_feitos JSONB, OUT met_min NUMERIC, OUT feitos INT, OUT cardio INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(sum(m.minutos * m.met), 0), count(*)::INT, count(*) FILTER (WHERE m.cardio)::INT
  FROM (
    SELECT LEAST(
             CASE jsonb_typeof(p_feitos -> (e ->> 'id'))
               WHEN 'number' THEN (p_feitos ->> (e ->> 'id'))::NUMERIC
               WHEN 'array' THEN jsonb_array_length(p_feitos -> (e ->> 'id'))::NUMERIC
               ELSE 0 END,
             COALESCE(NULLIF(substring(e ->> 'series' FROM '\d+'), '')::NUMERIC, 3))
           * (COALESCE(NULLIF(substring(e ->> 'tempo_execucao_segundos' FROM '\d+'), '')::NUMERIC, 40)
              + COALESCE(NULLIF(substring(e ->> 'tempo_descanso_segundos' FROM '\d+'), '')::NUMERIC, 60)) / 60.0 AS minutos,
           CASE WHEN e ->> 'tipo' = 'cardio'
                THEN LEAST(GREATEST(COALESCE(NULLIF(substring(e ->> 'met' FROM '[0-9]+(?:\.[0-9]+)?'), '')::NUMERIC, 8), 2), 16)
                ELSE 4.5 END AS met,
           (e ->> 'tipo' = 'cardio') AS cardio
    FROM public.treinos t, jsonb_array_elements(COALESCE(t.plano -> 'dias' -> p_dia -> 'exercicios', '[]'::JSONB)) e
    WHERE t.id = p_treino AND jsonb_typeof(t.plano -> 'dias' -> p_dia -> 'exercicios') = 'array'
      AND jsonb_typeof(p_feitos) = 'object' AND p_feitos ? (e ->> 'id')
  ) m;
$$;

CREATE OR REPLACE FUNCTION public.treino_para_diario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n INT; v_plano INT; v_min INT; v_peso NUMERIC; v_data DATE; v_dia TEXT; v_kcal INT; v_nome TEXT;
        v_met_min NUMERIC; v_feitos INT; v_cardio INT; v_tipo TEXT;
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
  SELECT met_min, feitos, cardio INTO v_met_min, v_feitos, v_cardio
    FROM public._treino_met_minutos(NEW.treino_id, NEW.dia_index, NEW.series_realizadas);
  SELECT peso_kg INTO v_peso FROM public.registros_peso WHERE user_id = NEW.user_id ORDER BY data DESC LIMIT 1;
  IF v_peso IS NULL THEN SELECT peso_kg INTO v_peso FROM public.metas_nutricionais WHERE user_id = NEW.user_id; END IF;
  SELECT NULLIF(trim(t.plano -> 'dias' -> NEW.dia_index ->> 'dia'), '') INTO v_dia FROM public.treinos t WHERE t.id = NEW.treino_id;
  v_data := (COALESCE(NEW.data_fim, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
  -- Gasto pelo MET de cada exercício feito; sem detalhe por exercício, musculação (4,5) sobre o tempo total
  v_kcal := LEAST(round(CASE WHEN COALESCE(v_met_min, 0) > 0
                             THEN COALESCE(v_peso, 70) * LEAST(v_met_min, 180 * 16) / 60.0
                             ELSE 4.5 * COALESCE(v_peso, 70) * v_min / 60.0 END)::INT, 4000);
  v_tipo := CASE WHEN COALESCE(v_cardio, 0) = 0 THEN 'Musculação' WHEN v_cardio = v_feitos THEN 'Cardio' ELSE 'Treino' END;
  v_nome := left(v_tipo || ' · ' || COALESCE(v_dia, NULLIF(trim(NEW.treino_nome), ''), 'treino'), 100)
            || CASE WHEN NEW.concluido THEN '' ELSE ' · treino incompleto' END;
  INSERT INTO public.exercicios_registro (user_id, data, nome, duracao_min, calorias, origem, sessao_id)
  VALUES (NEW.user_id, v_data, v_nome, v_min, v_kcal, 'treino', NEW.id)
  ON CONFLICT (sessao_id) WHERE sessao_id IS NOT NULL
  DO UPDATE SET data = EXCLUDED.data, nome = EXCLUDED.nome, duracao_min = EXCLUDED.duracao_min, calorias = EXCLUDED.calorias;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._treino_met_minutos(UUID, INT, JSONB), public.treino_para_diario() FROM PUBLIC, anon, authenticated;
