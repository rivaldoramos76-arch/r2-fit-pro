-- ============================================================
-- R2 Fit Pro — Acompanhamento com personal.
-- O personal ativa o modo personal e recebe um código de convite. O aluno aceita o convite e
-- escolhe o que compartilhar (treinos, diário, peso) e se o personal pode enviar treinos, dietas e metas.
-- O personal nunca lê as tabelas do aluno diretamente: tudo passa por funções que conferem o vínculo
-- ativo, o que foi compartilhado e o Premium do personal. As políticas das tabelas existentes não mudam.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.personais (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo        TEXT NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9]{6}$'),
  nome_exibicao TEXT CHECK (char_length(nome_exibicao) <= 80),
  cref          TEXT CHECK (char_length(cref) <= 30),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.acompanhamentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personal_id   UUID NOT NULL REFERENCES public.personais(user_id) ON DELETE CASCADE,
  aluno_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ver_treinos   BOOLEAN NOT NULL DEFAULT TRUE,
  ver_diario    BOOLEAN NOT NULL DEFAULT TRUE,
  ver_peso      BOOLEAN NOT NULL DEFAULT TRUE,
  editar_planos BOOLEAN NOT NULL DEFAULT TRUE,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrado_em  TIMESTAMPTZ,
  CHECK (personal_id <> aluno_id),
  UNIQUE (personal_id, aluno_id)
);
CREATE INDEX IF NOT EXISTS acompanhamentos_aluno_idx ON public.acompanhamentos (aluno_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.acomp_mensagens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos(id) ON DELETE CASCADE,
  autor_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- texto: recado; treino/dieta/meta: aviso de algo enviado pelo personal; aviso: convite aceito
  tipo              TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'treino', 'dieta', 'meta', 'aviso')),
  texto             TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 2000),
  ref_id            UUID,
  lida_em           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS acomp_mensagens_idx ON public.acomp_mensagens (acompanhamento_id, created_at DESC);
CREATE INDEX IF NOT EXISTS acomp_mensagens_autor_idx ON public.acomp_mensagens (autor_id, created_at DESC);

-- Origem dos treinos e dietas enviados pelo personal (só informativo)
ALTER TABLE public.treinos ADD COLUMN IF NOT EXISTS enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.dietas  ADD COLUMN IF NOT EXISTS enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.personais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acompanhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acomp_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY personais_select ON public.personais FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY acompanhamentos_select ON public.acompanhamentos FOR SELECT TO authenticated
  USING (personal_id = auth.uid() OR aluno_id = auth.uid());
CREATE POLICY acomp_mensagens_select ON public.acomp_mensagens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.acompanhamentos a WHERE a.id = acompanhamento_id AND auth.uid() IN (a.personal_id, a.aluno_id)));
-- Escrita só pelas funções abaixo
REVOKE ALL ON public.personais, public.acompanhamentos, public.acomp_mensagens FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.personais, public.acompanhamentos, public.acomp_mensagens FROM authenticated;

-- ---------- Auxiliares (internas) ----------

CREATE OR REPLACE FUNCTION public._acomp_nome(uid UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(NULLIF(trim(p.nome), ''), split_part(u.email, '@', 1), 'Aluno')
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = uid;
$$;

CREATE OR REPLACE FUNCTION public._acomp_gerar_codigo()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  alfabeto CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem 0/O e 1/I
  c TEXT;
BEGIN
  LOOP
    SELECT string_agg(substr(alfabeto, 1 + floor(random() * 32)::INT, 1), '') INTO c FROM generate_series(1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.personais WHERE codigo = c);
  END LOOP;
  RETURN c;
END;
$$;

/** Vínculo ativo do personal logado com o aluno; exige Premium do personal. */
CREATE OR REPLACE FUNCTION public._acomp_do_personal(p_aluno UUID)
RETURNS public.acompanhamentos LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.acompanhamentos;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  SELECT * INTO v FROM public.acompanhamentos WHERE personal_id = auth.uid() AND aluno_id = p_aluno AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado ou acompanhamento encerrado.'; END IF;
  IF NOT public.tem_premium() THEN RAISE EXCEPTION 'Para acompanhar alunos é preciso ter o Premium ativo.'; END IF;
  RETURN v;
END;
$$;

-- ---------- Personal ----------

CREATE OR REPLACE FUNCTION public.acomp_ativar_personal(p_nome TEXT DEFAULT NULL, p_cref TEXT DEFAULT NULL, p_novo_codigo BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := auth.uid(); r public.personais;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  IF NOT public.tem_premium() THEN RAISE EXCEPTION 'Para atender alunos é preciso ter o Premium ativo.'; END IF;
  INSERT INTO public.personais AS pe (user_id, codigo, nome_exibicao, cref)
  VALUES (uid, public._acomp_gerar_codigo(), NULLIF(left(trim(p_nome), 80), ''), NULLIF(left(trim(p_cref), 30), ''))
  ON CONFLICT (user_id) DO UPDATE SET
    nome_exibicao = COALESCE(NULLIF(left(trim(p_nome), 80), ''), pe.nome_exibicao),
    cref = CASE WHEN p_cref IS NULL THEN pe.cref ELSE NULLIF(left(trim(p_cref), 30), '') END,
    codigo = CASE WHEN p_novo_codigo THEN public._acomp_gerar_codigo() ELSE pe.codigo END
  RETURNING * INTO r;
  RETURN jsonb_build_object('codigo', r.codigo, 'nome_exibicao', r.nome_exibicao, 'cref', r.cref);
END;
$$;

CREATE OR REPLACE FUNCTION public.acomp_meus_alunos(p_hoje DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
        (SELECT max(COALESCE(s.data_fim, s.data_inicio)) FROM public.sessoes_treino s WHERE s.user_id = a.aluno_id AND s.concluido) END,
      'treinos_7d', CASE WHEN a.ver_treinos THEN
        (SELECT count(*) FROM public.sessoes_treino s WHERE s.user_id = a.aluno_id AND s.concluido AND s.data_inicio >= NOW() - INTERVAL '7 days') END,
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
$$;

/** Dados do aluno no período, no mesmo formato do relatório semanal; só o que o aluno compartilhou. */
CREATE OR REPLACE FUNCTION public.acomp_dados_aluno(p_aluno UUID, p_inicio DATE, p_fim DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
        'treino_nome', s.treino_nome, 'dia_index', s.dia_index, 'data_inicio', s.data_inicio, 'data_fim', s.data_fim, 'concluido', s.concluido)
        ORDER BY s.data_inicio DESC)
      FROM public.sessoes_treino s WHERE s.user_id = p_aluno
        AND s.data_inicio >= (p_inicio - 1)::TIMESTAMPTZ AND s.data_inicio < (p_fim + 2)::TIMESTAMPTZ), '[]'::JSONB) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.acomp_treino_aluno(p_aluno UUID, p_treino UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.acompanhamentos := public._acomp_do_personal(p_aluno); r JSONB;
BEGIN
  IF NOT (v.ver_treinos OR v.editar_planos) THEN RAISE EXCEPTION 'O aluno não compartilhou os treinos.'; END IF;
  SELECT jsonb_build_object('id', t.id, 'nome', t.nome, 'objetivo', t.objetivo, 'nivel', t.nivel,
    'frequencia_semanal', t.frequencia_semanal, 'plano', t.plano, 'created_at', t.created_at)
  INTO r FROM public.treinos t WHERE t.id = p_treino AND t.user_id = p_aluno;
  IF r IS NULL THEN RAISE EXCEPTION 'Treino não encontrado.'; END IF;
  RETURN r;
END;
$$;

/** Copia um treino do aluno para a conta do personal, para editar com o editor normal e reenviar. */
CREATE OR REPLACE FUNCTION public.acomp_copiar_treino(p_aluno UUID, p_treino UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.acompanhamentos := public._acomp_do_personal(p_aluno); t public.treinos; novo UUID;
BEGIN
  IF NOT (v.ver_treinos OR v.editar_planos) THEN RAISE EXCEPTION 'O aluno não compartilhou os treinos.'; END IF;
  SELECT * INTO t FROM public.treinos WHERE id = p_treino AND user_id = p_aluno;
  IF NOT FOUND THEN RAISE EXCEPTION 'Treino não encontrado.'; END IF;
  IF (SELECT count(*) FROM public.treinos WHERE user_id = auth.uid()) >= 300 THEN RAISE EXCEPTION 'Você já tem muitos treinos salvos. Apague alguns antes.'; END IF;
  INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano)
  VALUES (auth.uid(), left(t.nome || ' · ' || public._acomp_nome(p_aluno), 120), t.objetivo, t.nivel, t.frequencia_semanal,
    CASE WHEN jsonb_typeof(t.plano) = 'object' THEN t.plano || jsonb_build_object('nome', left(t.nome || ' · ' || public._acomp_nome(p_aluno), 120)) ELSE t.plano END)
  RETURNING id INTO novo;
  RETURN novo;
END;
$$;

/** Envia um treino da conta do personal ao aluno (novo ou substituindo um treino do aluno). */
CREATE OR REPLACE FUNCTION public.acomp_enviar_treino(p_aluno UUID, p_origem UUID, p_substituir UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.acompanhamentos := public._acomp_do_personal(p_aluno); t public.treinos; novo UUID; v_nome TEXT; v_suf TEXT;
BEGIN
  IF NOT v.editar_planos THEN RAISE EXCEPTION 'O aluno não permitiu que você envie treinos, dietas e metas.'; END IF;
  SELECT * INTO t FROM public.treinos WHERE id = p_origem AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Treino não encontrado na sua conta.'; END IF;
  -- Tira o " · Nome do aluno" que a cópia ganhou
  v_suf := ' · ' || public._acomp_nome(p_aluno);
  v_nome := left(CASE WHEN char_length(t.nome) > char_length(v_suf) AND right(t.nome, char_length(v_suf)) = v_suf
    THEN left(t.nome, char_length(t.nome) - char_length(v_suf)) ELSE t.nome END, 120);
  IF p_substituir IS NOT NULL THEN
    UPDATE public.treinos SET nome = v_nome, objetivo = t.objetivo, nivel = t.nivel, frequencia_semanal = t.frequencia_semanal,
      plano = CASE WHEN jsonb_typeof(t.plano) = 'object' THEN t.plano || jsonb_build_object('nome', v_nome) ELSE t.plano END,
      enviado_por = auth.uid()
    WHERE id = p_substituir AND user_id = p_aluno RETURNING id INTO novo;
    IF novo IS NULL THEN RAISE EXCEPTION 'Treino do aluno não encontrado.'; END IF;
  ELSE
    IF (SELECT count(*) FROM public.treinos WHERE user_id = p_aluno) >= 50 THEN RAISE EXCEPTION 'O aluno já tem muitos treinos salvos.'; END IF;
    INSERT INTO public.treinos (user_id, nome, objetivo, nivel, frequencia_semanal, plano, enviado_por)
    VALUES (p_aluno, v_nome, t.objetivo, t.nivel, t.frequencia_semanal,
      CASE WHEN jsonb_typeof(t.plano) = 'object' THEN t.plano || jsonb_build_object('nome', v_nome) ELSE t.plano END, auth.uid())
    RETURNING id INTO novo;
  END IF;
  INSERT INTO public.acomp_mensagens (acompanhamento_id, autor_id, tipo, texto, ref_id)
  VALUES (v.id, auth.uid(), 'treino', CASE WHEN p_substituir IS NULL THEN 'Enviei um novo treino: ' ELSE 'Atualizei seu treino: ' END || v_nome, novo);
  RETURN novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.acomp_enviar_dieta(p_aluno UUID, p_origem UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.acompanhamentos := public._acomp_do_personal(p_aluno); d public.dietas; novo UUID;
BEGIN
  IF NOT v.editar_planos THEN RAISE EXCEPTION 'O aluno não permitiu que você envie treinos, dietas e metas.'; END IF;
  SELECT * INTO d FROM public.dietas WHERE id = p_origem AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Dieta não encontrada na sua conta.'; END IF;
  IF (SELECT count(*) FROM public.dietas WHERE user_id = p_aluno) >= 50 THEN RAISE EXCEPTION 'O aluno já tem muitas dietas salvas.'; END IF;
  INSERT INTO public.dietas (user_id, nome, objetivo, calorias_dia, plano, enviado_por)
  VALUES (p_aluno, d.nome, d.objetivo, d.calorias_dia, d.plano, auth.uid()) RETURNING id INTO novo;
  INSERT INTO public.acomp_mensagens (acompanhamento_id, autor_id, tipo, texto, ref_id)
  VALUES (v.id, auth.uid(), 'dieta', 'Enviei uma dieta: ' || d.nome, novo);
  RETURN novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.acomp_definir_meta(p_aluno UUID, p_calorias INT, p_proteina INT, p_carboidrato INT, p_gordura INT,
  p_agua_ml INT DEFAULT NULL, p_meta_peso NUMERIC DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.acompanhamentos := public._acomp_do_personal(p_aluno);
BEGIN
  IF NOT v.editar_planos THEN RAISE EXCEPTION 'O aluno não permitiu que você envie treinos, dietas e metas.'; END IF;
  IF p_calorias IS NULL OR p_calorias < 800 OR p_calorias > 6000 THEN RAISE EXCEPTION 'Calorias devem ficar entre 800 e 6000.'; END IF;
  IF p_proteina IS NULL OR p_carboidrato IS NULL OR p_gordura IS NULL
     OR p_proteina NOT BETWEEN 0 AND 500 OR p_carboidrato NOT BETWEEN 0 AND 900 OR p_gordura NOT BETWEEN 0 AND 400 THEN RAISE EXCEPTION 'Macros fora do limite.'; END IF;
  IF p_agua_ml IS NOT NULL AND p_agua_ml NOT BETWEEN 500 AND 8000 THEN RAISE EXCEPTION 'Meta de água deve ficar entre 500 e 8000 ml.'; END IF;
  IF p_meta_peso IS NOT NULL AND p_meta_peso NOT BETWEEN 30 AND 350 THEN RAISE EXCEPTION 'Peso meta deve ficar entre 30 e 350 kg.'; END IF;
  UPDATE public.metas_nutricionais SET calorias = p_calorias, proteina_g = p_proteina, carboidrato_g = p_carboidrato, gordura_g = p_gordura,
    meta_agua_ml = COALESCE(p_agua_ml, meta_agua_ml), meta_peso_kg = COALESCE(p_meta_peso, meta_peso_kg), personalizada = TRUE
  WHERE user_id = p_aluno;
  IF NOT FOUND THEN RAISE EXCEPTION 'O aluno ainda não configurou a meta diária no app. Peça para ele abrir "Meta diária" uma vez.'; END IF;
  INSERT INTO public.acomp_mensagens (acompanhamento_id, autor_id, tipo, texto)
  VALUES (v.id, auth.uid(), 'meta', format('Ajustei sua meta diária: %s kcal · P %sg · C %sg · G %sg', p_calorias, p_proteina, p_carboidrato, p_gordura));
END;
$$;

-- ---------- Aluno ----------

CREATE OR REPLACE FUNCTION public.acomp_ver_convite(p_codigo TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.personais;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  SELECT * INTO r FROM public.personais WHERE codigo = upper(trim(p_codigo));
  IF NOT FOUND THEN RAISE EXCEPTION 'Código de convite não encontrado. Confira com seu personal.'; END IF;
  RETURN jsonb_build_object('nome', COALESCE(r.nome_exibicao, public._acomp_nome(r.user_id)), 'cref', r.cref, 'proprio', r.user_id = auth.uid(),
    'ja_vinculado', EXISTS (SELECT 1 FROM public.acompanhamentos a WHERE a.personal_id = r.user_id AND a.aluno_id = auth.uid() AND a.ativo));
END;
$$;

CREATE OR REPLACE FUNCTION public.acomp_aceitar(p_codigo TEXT, p_ver_treinos BOOLEAN, p_ver_diario BOOLEAN, p_ver_peso BOOLEAN, p_editar_planos BOOLEAN)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := auth.uid(); r public.personais; v_id UUID; ja BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  SELECT * INTO r FROM public.personais WHERE codigo = upper(trim(p_codigo));
  IF NOT FOUND THEN RAISE EXCEPTION 'Código de convite não encontrado. Confira com seu personal.'; END IF;
  IF r.user_id = uid THEN RAISE EXCEPTION 'Este é o seu próprio código de personal.'; END IF;
  SELECT ativo INTO ja FROM public.acompanhamentos WHERE personal_id = r.user_id AND aluno_id = uid;
  IF NOT COALESCE(ja, FALSE) THEN
    IF (SELECT count(*) FROM public.acompanhamentos WHERE aluno_id = uid AND ativo) >= 5 THEN RAISE EXCEPTION 'Você já tem 5 profissionais acompanhando. Encerre um antes.'; END IF;
    IF (SELECT count(*) FROM public.acompanhamentos WHERE personal_id = r.user_id AND ativo) >= 300 THEN RAISE EXCEPTION 'Este personal atingiu o limite de alunos.'; END IF;
  END IF;
  INSERT INTO public.acompanhamentos (personal_id, aluno_id, ver_treinos, ver_diario, ver_peso, editar_planos)
  VALUES (r.user_id, uid, COALESCE(p_ver_treinos, TRUE), COALESCE(p_ver_diario, TRUE), COALESCE(p_ver_peso, TRUE), COALESCE(p_editar_planos, TRUE))
  ON CONFLICT (personal_id, aluno_id) DO UPDATE SET
    ver_treinos = EXCLUDED.ver_treinos, ver_diario = EXCLUDED.ver_diario, ver_peso = EXCLUDED.ver_peso,
    editar_planos = EXCLUDED.editar_planos, ativo = TRUE, encerrado_em = NULL
  RETURNING id INTO v_id;
  IF NOT COALESCE(ja, FALSE) THEN
    INSERT INTO public.acomp_mensagens (acompanhamento_id, autor_id, tipo, texto) VALUES (v_id, uid, 'aviso', 'Aceitou seu convite de acompanhamento 👋');
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.acomp_meus_personais()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'personal_id', a.personal_id, 'nome', COALESCE(p.nome_exibicao, public._acomp_nome(a.personal_id)), 'cref', p.cref,
    'desde', a.created_at, 'ver_treinos', a.ver_treinos, 'ver_diario', a.ver_diario, 'ver_peso', a.ver_peso, 'editar_planos', a.editar_planos,
    'nao_lidas', (SELECT count(*) FROM public.acomp_mensagens m WHERE m.acompanhamento_id = a.id AND m.autor_id = a.personal_id AND m.lida_em IS NULL)
  ) ORDER BY a.created_at), '[]'::JSONB)
  FROM public.acompanhamentos a JOIN public.personais p ON p.user_id = a.personal_id
  WHERE a.aluno_id = auth.uid() AND a.ativo;
$$;

CREATE OR REPLACE FUNCTION public.acomp_atualizar(p_id UUID, p_ver_treinos BOOLEAN, p_ver_diario BOOLEAN, p_ver_peso BOOLEAN, p_editar_planos BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.acompanhamentos SET ver_treinos = p_ver_treinos, ver_diario = p_ver_diario, ver_peso = p_ver_peso, editar_planos = p_editar_planos
  WHERE id = p_id AND aluno_id = auth.uid() AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acompanhamento não encontrado.'; END IF;
END;
$$;

/** Qualquer um dos dois pode encerrar; o personal perde o acesso na hora. */
CREATE OR REPLACE FUNCTION public.acomp_encerrar(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.acompanhamentos SET ativo = FALSE, encerrado_em = NOW()
  WHERE id = p_id AND auth.uid() IN (personal_id, aluno_id) AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acompanhamento não encontrado.'; END IF;
END;
$$;

-- ---------- Mensagens ----------

CREATE OR REPLACE FUNCTION public.acomp_enviar_mensagem(p_id UUID, p_texto TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := auth.uid(); a public.acompanhamentos; m public.acomp_mensagens; t TEXT := trim(p_texto);
BEGIN
  SELECT * INTO a FROM public.acompanhamentos WHERE id = p_id AND ativo AND uid IN (personal_id, aluno_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Acompanhamento não encontrado ou encerrado.'; END IF;
  IF uid = a.personal_id AND NOT public.tem_premium() THEN RAISE EXCEPTION 'Para acompanhar alunos é preciso ter o Premium ativo.'; END IF;
  IF t IS NULL OR char_length(t) = 0 THEN RAISE EXCEPTION 'Escreva uma mensagem.'; END IF;
  IF char_length(t) > 2000 THEN RAISE EXCEPTION 'Mensagem muito longa (máximo 2000 caracteres).'; END IF;
  IF (SELECT count(*) FROM public.acomp_mensagens WHERE autor_id = uid AND created_at > NOW() - INTERVAL '1 day') >= 300 THEN
    RAISE EXCEPTION 'Limite de mensagens de hoje atingido.';
  END IF;
  INSERT INTO public.acomp_mensagens (acompanhamento_id, autor_id, texto) VALUES (p_id, uid, t) RETURNING * INTO m;
  RETURN to_jsonb(m);
END;
$$;

CREATE OR REPLACE FUNCTION public.acomp_marcar_lidas(p_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.acomp_mensagens m SET lida_em = NOW()
  FROM public.acompanhamentos a
  WHERE m.acompanhamento_id = p_id AND a.id = p_id AND auth.uid() IN (a.personal_id, a.aluno_id)
    AND m.autor_id <> auth.uid() AND m.lida_em IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.acomp_nao_lidas()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'como_aluno', (SELECT count(*) FROM public.acomp_mensagens m JOIN public.acompanhamentos a ON a.id = m.acompanhamento_id
                   WHERE a.aluno_id = auth.uid() AND a.ativo AND m.autor_id <> auth.uid() AND m.lida_em IS NULL),
    'como_personal', (SELECT count(*) FROM public.acomp_mensagens m JOIN public.acompanhamentos a ON a.id = m.acompanhamento_id
                   WHERE a.personal_id = auth.uid() AND a.ativo AND m.autor_id <> auth.uid() AND m.lida_em IS NULL),
    'personal', EXISTS (SELECT 1 FROM public.personais WHERE user_id = auth.uid()));
$$;

-- ---------- Notificação no celular de cada mensagem nova ----------

CREATE OR REPLACE FUNCTION public.acomp_avisar_mensagem()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token TEXT := replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');
BEGIN
  INSERT INTO public.cron_tokens (token) VALUES (v_token);
  PERFORM net.http_post(
    url := 'https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/cron/acomp-aviso',
    body := jsonb_build_object('token', v_token, 'mensagem', NEW.id),
    headers := '{"Content-Type": "application/json"}'::JSONB,
    timeout_milliseconds := 15000);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- o aviso nunca impede a mensagem
END;
$$;
DROP TRIGGER IF EXISTS acomp_mensagens_aviso ON public.acomp_mensagens;
CREATE TRIGGER acomp_mensagens_aviso AFTER INSERT ON public.acomp_mensagens FOR EACH ROW EXECUTE FUNCTION public.acomp_avisar_mensagem();

-- ---------- Permissões ----------
REVOKE ALL ON FUNCTION public._acomp_nome(UUID), public._acomp_gerar_codigo(), public._acomp_do_personal(UUID), public.acomp_avisar_mensagem()
  FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'acomp_ativar_personal(TEXT, TEXT, BOOLEAN)', 'acomp_meus_alunos(DATE)', 'acomp_dados_aluno(UUID, DATE, DATE)',
    'acomp_treino_aluno(UUID, UUID)', 'acomp_copiar_treino(UUID, UUID)', 'acomp_enviar_treino(UUID, UUID, UUID)',
    'acomp_enviar_dieta(UUID, UUID)', 'acomp_definir_meta(UUID, INT, INT, INT, INT, INT, NUMERIC)',
    'acomp_ver_convite(TEXT)', 'acomp_aceitar(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN)', 'acomp_meus_personais()',
    'acomp_atualizar(UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN)', 'acomp_encerrar(UUID)',
    'acomp_enviar_mensagem(UUID, TEXT)', 'acomp_marcar_lidas(UUID)', 'acomp_nao_lidas()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
