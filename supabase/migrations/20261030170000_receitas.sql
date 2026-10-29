-- ============================================================
-- R2 Fit Pro — Receitas salvas (ingredientes + rendimento em porções).
-- Os valores por porção são calculados no app a partir dos ingredientes.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receitas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 120),
  porcoes       NUMERIC(5,1) NOT NULL DEFAULT 1 CHECK (porcoes > 0 AND porcoes <= 100),
  -- [{nome, quantidade, calorias, proteina_g, carboidrato_g, gordura_g}]
  ingredientes  JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(ingredientes) = 'array' AND jsonb_array_length(ingredientes) <= 60),
  modo_preparo  TEXT CHECK (char_length(modo_preparo) <= 4000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS receitas_user_idx ON public.receitas (user_id, nome);

ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY receitas_select ON public.receitas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY receitas_delete ON public.receitas FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY receitas_insert ON public.receitas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.tem_premium());
CREATE POLICY receitas_update ON public.receitas FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());
REVOKE ALL ON public.receitas FROM anon;

DROP TRIGGER IF EXISTS receitas_touch ON public.receitas;
CREATE TRIGGER receitas_touch BEFORE UPDATE ON public.receitas FOR EACH ROW EXECUTE FUNCTION public.metas_touch();
