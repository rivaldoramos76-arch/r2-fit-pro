-- ============================================================
-- R2 Fit Pro — Evolução: carga por exercício, medidas e fotos.
--  1. sessoes_treino.detalhes: o que foi feito em cada exercício na sessão
--     { exercicioId: { nome, catalogo_id, carga, reps, series } } → "última vez", recordes e sugestão de carga.
--  2. medidas_corporais: cintura, quadril, peito, braço, coxa, panturrilha e % de gordura por data.
--  3. fotos_evolucao + bucket privado "evolucao": fotos de antes e depois (só a própria pessoa vê).
-- ============================================================

ALTER TABLE public.sessoes_treino ADD COLUMN IF NOT EXISTS detalhes JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE TABLE IF NOT EXISTS public.medidas_corporais (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data         DATE NOT NULL,
  cintura_cm   NUMERIC(5,1) CHECK (cintura_cm BETWEEN 30 AND 250),
  quadril_cm   NUMERIC(5,1) CHECK (quadril_cm BETWEEN 30 AND 250),
  peito_cm     NUMERIC(5,1) CHECK (peito_cm BETWEEN 30 AND 250),
  braco_cm     NUMERIC(5,1) CHECK (braco_cm BETWEEN 10 AND 100),
  coxa_cm      NUMERIC(5,1) CHECK (coxa_cm BETWEEN 20 AND 150),
  panturrilha_cm NUMERIC(5,1) CHECK (panturrilha_cm BETWEEN 15 AND 100),
  gordura_pct  NUMERIC(4,1) CHECK (gordura_pct BETWEEN 2 AND 70),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, data)
);

CREATE TABLE IF NOT EXISTS public.fotos_evolucao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  pose        TEXT NOT NULL DEFAULT 'frente' CHECK (pose IN ('frente', 'lado', 'costas')),
  caminho     TEXT NOT NULL CHECK (char_length(caminho) BETWEEN 5 AND 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fotos_evolucao_user_data_idx ON public.fotos_evolucao (user_id, data);

ALTER TABLE public.medidas_corporais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotos_evolucao ENABLE ROW LEVEL SECURITY;

-- Cada pessoa vê e apaga só os próprios registros; criar e editar exige Premium (como peso e diário)
CREATE POLICY medidas_select ON public.medidas_corporais FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY medidas_delete ON public.medidas_corporais FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY medidas_insert ON public.medidas_corporais FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.tem_premium());
CREATE POLICY medidas_update ON public.medidas_corporais FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());

CREATE POLICY fotos_select ON public.fotos_evolucao FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY fotos_delete ON public.fotos_evolucao FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY fotos_insert ON public.fotos_evolucao FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.tem_premium() AND split_part(caminho, '/', 1) = auth.uid()::TEXT);

REVOKE ALL ON public.medidas_corporais, public.fotos_evolucao FROM anon;

-- ─── Storage privado das fotos de evolução (pasta = id da pessoa) ───────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evolucao', 'evolucao', FALSE, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS evolucao_select ON storage.objects;
DROP POLICY IF EXISTS evolucao_insert ON storage.objects;
DROP POLICY IF EXISTS evolucao_delete ON storage.objects;
CREATE POLICY evolucao_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evolucao' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY evolucao_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evolucao' AND (storage.foldername(name))[1] = auth.uid()::TEXT AND public.tem_premium());
CREATE POLICY evolucao_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'evolucao' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
