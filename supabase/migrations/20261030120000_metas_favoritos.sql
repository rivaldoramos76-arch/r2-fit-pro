-- ============================================================
-- R2 Fit Pro — Meta diária de calorias/macros e alimentos favoritos.
-- A meta é uma preferência da conta (qualquer usuário logado define);
-- favoritar alimentos faz parte do diário, que é Premium.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.metas_nutricionais (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sexo             TEXT NOT NULL CHECK (sexo IN ('masculino', 'feminino')),
  nascimento       DATE NOT NULL CHECK (nascimento > DATE '1900-01-01'),
  altura_cm        NUMERIC(5,1) NOT NULL CHECK (altura_cm BETWEEN 100 AND 250),
  peso_kg          NUMERIC(5,1) NOT NULL CHECK (peso_kg BETWEEN 30 AND 350),
  atividade        TEXT NOT NULL CHECK (atividade IN ('sedentario', 'leve', 'moderado', 'intenso', 'muito_intenso')),
  objetivo         TEXT NOT NULL CHECK (objetivo IN ('perder', 'manter', 'ganhar')),
  ritmo_kg_semana  NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (ritmo_kg_semana BETWEEN 0 AND 1),
  calorias         INT NOT NULL CHECK (calorias BETWEEN 800 AND 6000),
  proteina_g       INT NOT NULL CHECK (proteina_g BETWEEN 0 AND 500),
  carboidrato_g    INT NOT NULL CHECK (carboidrato_g BETWEEN 0 AND 900),
  gordura_g        INT NOT NULL CHECK (gordura_g BETWEEN 0 AND 400),
  personalizada    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Por padrão a meta não muda com o exercício do dia (escolha do produto)
  somar_exercicio  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.metas_nutricionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY metas_select ON public.metas_nutricionais FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY metas_insert ON public.metas_nutricionais FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY metas_update ON public.metas_nutricionais FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY metas_delete ON public.metas_nutricionais FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.metas_nutricionais FROM anon;

CREATE OR REPLACE FUNCTION public.metas_touch() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS metas_touch ON public.metas_nutricionais;
CREATE TRIGGER metas_touch BEFORE UPDATE ON public.metas_nutricionais FOR EACH ROW EXECUTE FUNCTION public.metas_touch();

CREATE TABLE IF NOT EXISTS public.alimentos_favoritos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 200),
  quantidade     TEXT NOT NULL DEFAULT '' CHECK (char_length(quantidade) <= 120),
  calorias       INT NOT NULL CHECK (calorias BETWEEN 0 AND 10000),
  proteina_g     NUMERIC(7,1) NOT NULL DEFAULT 0 CHECK (proteina_g >= 0),
  carboidrato_g  NUMERIC(7,1) NOT NULL DEFAULT 0 CHECK (carboidrato_g >= 0),
  gordura_g      NUMERIC(7,1) NOT NULL DEFAULT 0 CHECK (gordura_g >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, nome, quantidade)
);
ALTER TABLE public.alimentos_favoritos ENABLE ROW LEVEL SECURITY;
CREATE POLICY favoritos_select ON public.alimentos_favoritos FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY favoritos_delete ON public.alimentos_favoritos FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY favoritos_insert ON public.alimentos_favoritos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.tem_premium());
REVOKE ALL ON public.alimentos_favoritos FROM anon;

-- "Recentes" do diário: últimos registros da pessoa
CREATE INDEX IF NOT EXISTS food_logs_user_created_idx ON public.food_logs (user_id, created_at DESC);
