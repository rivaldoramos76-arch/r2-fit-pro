-- ============================================================
-- R2 Fit Pro — Banco de alimentos compartilhado (complementa a TACO do app):
-- alimentos estimados pela IA, produtos lidos pelo código de barras
-- (Open Food Facts) e tabelas nutricionais fotografadas.
-- Todos os assinantes leem; a gravação passa por uma função que valida
-- os valores, evita duplicados e limita o volume por pessoa.
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalizar_nome_alimento(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '\s+', ' ', 'g'))
$$;

CREATE TABLE IF NOT EXISTS public.alimentos_base (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  nome_busca     TEXT NOT NULL,
  marca          TEXT CHECK (char_length(marca) <= 80),
  codigo_barras  TEXT UNIQUE CHECK (codigo_barras ~ '^[0-9]{8,14}$'),
  -- valores por 100 g (ou 100 ml)
  kcal           NUMERIC(6,1) NOT NULL CHECK (kcal BETWEEN 0 AND 950),
  proteina       NUMERIC(5,1) NOT NULL CHECK (proteina BETWEEN 0 AND 100),
  carboidrato    NUMERIC(5,1) NOT NULL CHECK (carboidrato BETWEEN 0 AND 100),
  gordura        NUMERIC(5,1) NOT NULL CHECK (gordura BETWEEN 0 AND 100),
  porcao_rotulo  TEXT CHECK (char_length(porcao_rotulo) <= 60),
  porcao_g       NUMERIC(6,1) CHECK (porcao_g > 0 AND porcao_g <= 2000),
  fonte          TEXT NOT NULL CHECK (fonte IN ('ia', 'rotulo', 'off')),
  criado_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Um mesmo nome (sem código de barras) só entra uma vez
CREATE UNIQUE INDEX IF NOT EXISTS alimentos_base_nome_unico ON public.alimentos_base (nome_busca) WHERE codigo_barras IS NULL;
CREATE INDEX IF NOT EXISTS alimentos_base_nome_idx ON public.alimentos_base (nome_busca text_pattern_ops);

ALTER TABLE public.alimentos_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY alimentos_base_select ON public.alimentos_base FOR SELECT TO authenticated USING (TRUE);
REVOKE ALL ON public.alimentos_base FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.alimentos_base FROM authenticated;

CREATE OR REPLACE FUNCTION public.salvar_alimento_base(p JSONB)
RETURNS public.alimentos_base LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_nome   TEXT := btrim(p ->> 'nome');
  v_busca  TEXT;
  v_codigo TEXT := NULLIF(regexp_replace(coalesce(p ->> 'codigo_barras', ''), '\D', '', 'g'), '');
  v_linha  public.alimentos_base%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.tem_premium() THEN RAISE EXCEPTION 'Recurso Premium'; END IF;
  IF (SELECT count(*) FROM public.alimentos_base WHERE criado_por = v_uid AND created_at > NOW() - INTERVAL '1 day') >= 60 THEN
    RAISE EXCEPTION 'Limite diário de novos alimentos atingido';
  END IF;
  v_busca := public.normalizar_nome_alimento(v_nome);
  IF v_codigo IS NOT NULL THEN
    SELECT * INTO v_linha FROM public.alimentos_base WHERE codigo_barras = v_codigo;
  ELSE
    SELECT * INTO v_linha FROM public.alimentos_base WHERE nome_busca = v_busca AND codigo_barras IS NULL;
  END IF;
  IF FOUND THEN RETURN v_linha; END IF;

  INSERT INTO public.alimentos_base (nome, nome_busca, marca, codigo_barras, kcal, proteina, carboidrato, gordura,
                                     porcao_rotulo, porcao_g, fonte, criado_por)
  VALUES (v_nome, v_busca, NULLIF(btrim(p ->> 'marca'), ''), v_codigo,
          round((p ->> 'kcal')::NUMERIC, 1), round((p ->> 'proteina')::NUMERIC, 1),
          round((p ->> 'carboidrato')::NUMERIC, 1), round((p ->> 'gordura')::NUMERIC, 1),
          NULLIF(btrim(p ->> 'porcao_rotulo'), ''), NULLIF(p ->> 'porcao_g', '')::NUMERIC,
          p ->> 'fonte', v_uid)
  RETURNING * INTO v_linha;
  RETURN v_linha;
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_alimento_base(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_alimento_base(JSONB) TO authenticated;
