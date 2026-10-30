-- ============================================================
-- R2 Fit Pro — Peso final da receita pronta (opcional).
-- Com ele, a receita pode ser registrada no diário em gramas.
-- ============================================================
ALTER TABLE public.receitas
  ADD COLUMN IF NOT EXISTS peso_final_g NUMERIC(7,1)
  CHECK (peso_final_g IS NULL OR (peso_final_g > 0 AND peso_final_g <= 50000));
