-- ============================================================
-- R2 Fit Pro — Treino concluído entra sozinho no diário como exercício.
-- Quando a sessão do dia fica concluída, grava em exercicios_registro (origem 'treino'):
-- "Musculação · Treino A", a duração e as calorias estimadas (MET 4,5 × peso × horas).
-- Duração: o tempo real da sessão (ou o do plano, se for maior; o relógio começa no fim do
-- primeiro exercício). Se a sessão for desmarcada, o lançamento sai do diário.
-- O aluno pode editar ou apagar o lançamento normalmente.
-- ============================================================

ALTER TABLE public.exercicios_registro ADD COLUMN IF NOT EXISTS sessao_id UUID REFERENCES public.sessoes_treino(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exercicios_registro_sessao_idx ON public.exercicios_registro (sessao_id) WHERE sessao_id IS NOT NULL;

/** Minutos previstos no plano para o dia do treino (séries × (execução + descanso)). */
CREATE OR REPLACE FUNCTION public._treino_minutos_plano(p_treino UUID, p_dia INT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(round(sum(
           COALESCE(NULLIF(substring(e ->> 'series' FROM '\d+'), '')::NUMERIC, 3)
           * (COALESCE(NULLIF(substring(e ->> 'tempo_execucao_segundos' FROM '\d+'), '')::NUMERIC, 40)
              + COALESCE(NULLIF(substring(e ->> 'tempo_descanso_segundos' FROM '\d+'), '')::NUMERIC, 60))) / 60.0)::INT, 0)
  FROM public.treinos t, jsonb_array_elements(COALESCE(t.plano -> 'dias' -> p_dia -> 'exercicios', '[]'::JSONB)) e
  WHERE t.id = p_treino AND jsonb_typeof(t.plano -> 'dias' -> p_dia -> 'exercicios') = 'array';
$$;

CREATE OR REPLACE FUNCTION public.treino_para_diario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_real NUMERIC; v_plano INT; v_min INT; v_peso NUMERIC; v_data DATE; v_dia TEXT;
BEGIN
  IF NEW.concluido AND (TG_OP = 'INSERT' OR NOT OLD.concluido) THEN
    IF EXISTS (SELECT 1 FROM public.exercicios_registro WHERE sessao_id = NEW.id) THEN RETURN NEW; END IF;
    v_real := extract(epoch FROM (COALESCE(NEW.data_fim, NOW()) - NEW.data_inicio)) / 60;
    v_plano := COALESCE(NULLIF(public._treino_minutos_plano(NEW.treino_id, NEW.dia_index), 0), 45);
    v_min := LEAST(GREATEST(CASE WHEN v_real BETWEEN 5 AND 180 THEN GREATEST(round(v_real)::INT, v_plano) ELSE v_plano END, 5), 180);
    SELECT peso_kg INTO v_peso FROM public.registros_peso WHERE user_id = NEW.user_id ORDER BY data DESC LIMIT 1;
    IF v_peso IS NULL THEN SELECT peso_kg INTO v_peso FROM public.metas_nutricionais WHERE user_id = NEW.user_id; END IF;
    SELECT NULLIF(trim(t.plano -> 'dias' -> NEW.dia_index ->> 'dia'), '') INTO v_dia FROM public.treinos t WHERE t.id = NEW.treino_id;
    v_data := (COALESCE(NEW.data_fim, NOW()) AT TIME ZONE 'America/Sao_Paulo')::DATE;
    INSERT INTO public.exercicios_registro (user_id, data, nome, duracao_min, calorias, origem, sessao_id)
    VALUES (NEW.user_id, v_data, left('Musculação · ' || COALESCE(v_dia, NULLIF(trim(NEW.treino_nome), ''), 'treino'), 120),
            v_min, LEAST(round(4.5 * COALESCE(v_peso, 70) * v_min / 60.0)::INT, 4000), 'treino', NEW.id);
  ELSIF TG_OP = 'UPDATE' AND OLD.concluido AND NOT NEW.concluido THEN
    DELETE FROM public.exercicios_registro WHERE sessao_id = NEW.id AND origem = 'treino';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sessoes_treino_diario ON public.sessoes_treino;
CREATE TRIGGER sessoes_treino_diario AFTER INSERT OR UPDATE OF concluido ON public.sessoes_treino
  FOR EACH ROW EXECUTE FUNCTION public.treino_para_diario();

REVOKE ALL ON FUNCTION public._treino_minutos_plano(UUID, INT), public.treino_para_diario() FROM PUBLIC, anon, authenticated;
