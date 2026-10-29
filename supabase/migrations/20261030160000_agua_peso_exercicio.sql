-- ============================================================
-- R2 Fit Pro — Água, peso e exercício (diário Premium).
-- ============================================================
ALTER TABLE public.metas_nutricionais
  ADD COLUMN IF NOT EXISTS meta_agua_ml INT CHECK (meta_agua_ml BETWEEN 500 AND 8000),
  ADD COLUMN IF NOT EXISTS meta_peso_kg NUMERIC(5,1) CHECK (meta_peso_kg BETWEEN 30 AND 350);

CREATE TABLE IF NOT EXISTS public.registros_agua (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  ml          INT NOT NULL CHECK (ml BETWEEN 1 AND 5000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS registros_agua_user_data_idx ON public.registros_agua (user_id, data);

CREATE TABLE IF NOT EXISTS public.registros_peso (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  peso_kg     NUMERIC(5,1) NOT NULL CHECK (peso_kg BETWEEN 30 AND 350),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, data)
);

CREATE TABLE IF NOT EXISTS public.exercicios_registro (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data         DATE NOT NULL,
  nome         TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 120),
  duracao_min  INT NOT NULL CHECK (duracao_min BETWEEN 1 AND 600),
  calorias     INT NOT NULL CHECK (calorias BETWEEN 0 AND 4000),
  origem       TEXT NOT NULL DEFAULT 'lista' CHECK (origem IN ('lista', 'ia', 'treino')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS exercicios_registro_user_data_idx ON public.exercicios_registro (user_id, data);

ALTER TABLE public.registros_agua ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_peso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercicios_registro ENABLE ROW LEVEL SECURITY;

-- Cada pessoa vê e apaga só os próprios registros; criar e editar exige Premium (como o diário)
CREATE POLICY agua_select ON public.registros_agua FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY agua_delete ON public.registros_agua FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY agua_insert ON public.registros_agua FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.tem_premium());

CREATE POLICY peso_select ON public.registros_peso FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY peso_delete ON public.registros_peso FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY peso_insert ON public.registros_peso FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.tem_premium());
CREATE POLICY peso_update ON public.registros_peso FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());

CREATE POLICY exercicio_select ON public.exercicios_registro FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY exercicio_delete ON public.exercicios_registro FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY exercicio_insert ON public.exercicios_registro FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.tem_premium());
CREATE POLICY exercicio_update ON public.exercicios_registro FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());

REVOKE ALL ON public.registros_agua, public.registros_peso, public.exercicios_registro FROM anon;
