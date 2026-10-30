-- ============================================================
-- R2 Fit Pro — Amigos dentro do app.
-- Cada pessoa ativa seu perfil de amigos e recebe um código. Amizade = pedido aceito pelos dois.
-- O feed mostra só treinos concluídos (nada de diário, calorias ou peso), e só de quem deixou
-- "mostrar treinos" ligado. O ranking da semana conta treinos e dias com o diário em dia, e só
-- inclui quem deixou "entrar no ranking" ligado. Tudo passa por funções que conferem a amizade.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.social_perfis (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo          TEXT NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9]{6}$'),
  apelido         TEXT CHECK (char_length(apelido) BETWEEN 1 AND 40),
  mostrar_treinos BOOLEAN NOT NULL DEFAULT TRUE,
  entrar_ranking  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.amizades (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante  UUID NOT NULL REFERENCES public.social_perfis(user_id) ON DELETE CASCADE,
  destinatario UUID NOT NULL REFERENCES public.social_perfis(user_id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceita')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aceita_em    TIMESTAMPTZ,
  CHECK (solicitante <> destinatario)
);
CREATE UNIQUE INDEX IF NOT EXISTS amizades_par_idx ON public.amizades (LEAST(solicitante, destinatario), GREATEST(solicitante, destinatario));
CREATE INDEX IF NOT EXISTS amizades_destinatario_idx ON public.amizades (destinatario, status);

CREATE TABLE IF NOT EXISTS public.social_curtidas (
  sessao_id  UUID NOT NULL REFERENCES public.sessoes_treino(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sessao_id, user_id)
);

ALTER TABLE public.social_perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amizades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_curtidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_perfis_select ON public.social_perfis FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Sem outras políticas: amizades e curtidas só pelas funções abaixo
REVOKE ALL ON public.social_perfis, public.amizades, public.social_curtidas FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.social_perfis, public.amizades, public.social_curtidas FROM authenticated;
REVOKE SELECT ON public.amizades, public.social_curtidas FROM authenticated;

-- ---------- Auxiliares (internas) ----------

CREATE OR REPLACE FUNCTION public._social_nome(uid UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(NULLIF(trim(s.apelido), ''), split_part(public._acomp_nome(uid), ' ', 1))
  FROM (SELECT uid AS id) x LEFT JOIN public.social_perfis s ON s.user_id = x.id;
$$;

/** Ids dos amigos (amizade aceita) de uid. */
CREATE OR REPLACE FUNCTION public._social_amigos(uid UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN a.solicitante = uid THEN a.destinatario ELSE a.solicitante END
  FROM public.amizades a WHERE a.status = 'aceita' AND uid IN (a.solicitante, a.destinatario);
$$;

CREATE OR REPLACE FUNCTION public._social_exigir_perfil()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.social_perfis WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Ative os amigos primeiro.'; END IF;
  RETURN auth.uid();
END;
$$;

-- ---------- Perfil ----------

CREATE OR REPLACE FUNCTION public.social_ativar(p_apelido TEXT DEFAULT NULL, p_mostrar_treinos BOOLEAN DEFAULT NULL, p_entrar_ranking BOOLEAN DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := auth.uid(); r public.social_perfis; ap TEXT := NULLIF(left(trim(p_apelido), 40), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  INSERT INTO public.social_perfis AS sp (user_id, codigo, apelido, mostrar_treinos, entrar_ranking)
  VALUES (uid, public._acomp_gerar_codigo_social(), ap, COALESCE(p_mostrar_treinos, TRUE), COALESCE(p_entrar_ranking, TRUE))
  ON CONFLICT (user_id) DO UPDATE SET
    apelido = COALESCE(ap, sp.apelido),
    mostrar_treinos = COALESCE(p_mostrar_treinos, sp.mostrar_treinos),
    entrar_ranking = COALESCE(p_entrar_ranking, sp.entrar_ranking)
  RETURNING * INTO r;
  RETURN jsonb_build_object('codigo', r.codigo, 'apelido', r.apelido, 'mostrar_treinos', r.mostrar_treinos, 'entrar_ranking', r.entrar_ranking,
    'nome', public._social_nome(uid));
END;
$$;

-- ---------- Amizades ----------

CREATE OR REPLACE FUNCTION public.social_adicionar(p_codigo TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := public._social_exigir_perfil(); outro UUID; a public.amizades;
BEGIN
  SELECT user_id INTO outro FROM public.social_perfis WHERE codigo = upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'));
  IF outro IS NULL THEN RAISE EXCEPTION 'Código não encontrado. Confira com seu amigo.'; END IF;
  IF outro = uid THEN RAISE EXCEPTION 'Este é o seu próprio código.'; END IF;
  SELECT * INTO a FROM public.amizades WHERE LEAST(solicitante, destinatario) = LEAST(uid, outro) AND GREATEST(solicitante, destinatario) = GREATEST(uid, outro);
  IF FOUND THEN
    IF a.status = 'aceita' THEN RETURN jsonb_build_object('status', 'ja_amigos', 'nome', public._social_nome(outro)); END IF;
    IF a.destinatario = uid THEN -- o outro já tinha pedido: aceita
      UPDATE public.amizades SET status = 'aceita', aceita_em = NOW() WHERE id = a.id;
      RETURN jsonb_build_object('status', 'aceita', 'nome', public._social_nome(outro));
    END IF;
    RETURN jsonb_build_object('status', 'pendente', 'nome', public._social_nome(outro));
  END IF;
  IF (SELECT count(*) FROM public.amizades WHERE uid IN (solicitante, destinatario)) >= 300 THEN RAISE EXCEPTION 'Você atingiu o limite de amigos.'; END IF;
  IF (SELECT count(*) FROM public.amizades WHERE solicitante = uid AND status = 'pendente' AND created_at > NOW() - INTERVAL '1 day') >= 30 THEN
    RAISE EXCEPTION 'Muitos pedidos hoje. Tente amanhã.';
  END IF;
  INSERT INTO public.amizades (solicitante, destinatario) VALUES (uid, outro);
  RETURN jsonb_build_object('status', 'enviado', 'nome', public._social_nome(outro));
END;
$$;

CREATE OR REPLACE FUNCTION public.social_responder(p_id UUID, p_aceitar BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_aceitar THEN
    UPDATE public.amizades SET status = 'aceita', aceita_em = NOW() WHERE id = p_id AND destinatario = auth.uid() AND status = 'pendente';
  ELSE
    DELETE FROM public.amizades WHERE id = p_id AND destinatario = auth.uid() AND status = 'pendente';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
END;
$$;

/** Desfaz amizade ou cancela pedido (qualquer um dos dois). */
CREATE OR REPLACE FUNCTION public.social_remover(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE outro UUID;
BEGIN
  DELETE FROM public.amizades WHERE id = p_id AND auth.uid() IN (solicitante, destinatario)
  RETURNING CASE WHEN solicitante = auth.uid() THEN destinatario ELSE solicitante END INTO outro;
  IF outro IS NULL THEN RAISE EXCEPTION 'Amizade não encontrada.'; END IF;
  -- Some com as curtidas trocadas entre os dois
  DELETE FROM public.social_curtidas c USING public.sessoes_treino s
  WHERE c.sessao_id = s.id AND ((c.user_id = auth.uid() AND s.user_id = outro) OR (c.user_id = outro AND s.user_id = auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.social_amigos()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := auth.uid(); r public.social_perfis;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  SELECT * INTO r FROM public.social_perfis WHERE user_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('perfil', NULL); END IF;
  RETURN jsonb_build_object(
    'perfil', jsonb_build_object('codigo', r.codigo, 'apelido', r.apelido, 'mostrar_treinos', r.mostrar_treinos, 'entrar_ranking', r.entrar_ranking, 'nome', public._social_nome(uid)),
    'amigos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'user_id', o.id, 'nome', public._social_nome(o.id), 'desde', a.aceita_em) ORDER BY public._social_nome(o.id))
      FROM public.amizades a CROSS JOIN LATERAL (SELECT CASE WHEN a.solicitante = uid THEN a.destinatario ELSE a.solicitante END AS id) o
      WHERE a.status = 'aceita' AND uid IN (a.solicitante, a.destinatario)), '[]'::JSONB),
    'recebidos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nome', public._social_nome(a.solicitante), 'em', a.created_at) ORDER BY a.created_at DESC)
      FROM public.amizades a WHERE a.status = 'pendente' AND a.destinatario = uid), '[]'::JSONB),
    'enviados', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nome', public._social_nome(a.destinatario), 'em', a.created_at) ORDER BY a.created_at DESC)
      FROM public.amizades a WHERE a.status = 'pendente' AND a.solicitante = uid), '[]'::JSONB)
  );
END;
$$;

-- ---------- Feed e ranking ----------

/** Treinos concluídos meus e dos amigos (quem mostra treinos), mais recentes primeiro. */
CREATE OR REPLACE FUNCTION public.social_feed(p_antes TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
    WHERE s.concluido
      AND (s.user_id = uid OR (p.mostrar_treinos AND s.user_id IN (SELECT public._social_amigos(uid))))
      AND COALESCE(s.data_fim, s.data_inicio) > NOW() - INTERVAL '30 days'
      AND (p_antes IS NULL OR COALESCE(s.data_fim, s.data_inicio) < p_antes)
    ORDER BY COALESCE(s.data_fim, s.data_inicio) DESC
    LIMIT 30
  ) t), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.social_curtir(p_sessao UUID, p_curtir BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := public._social_exigir_perfil(); dono UUID;
BEGIN
  SELECT s.user_id INTO dono FROM public.sessoes_treino s JOIN public.social_perfis p ON p.user_id = s.user_id
  WHERE s.id = p_sessao AND s.concluido AND (s.user_id = uid OR (p.mostrar_treinos AND s.user_id IN (SELECT public._social_amigos(uid))));
  IF dono IS NULL THEN RAISE EXCEPTION 'Treino não encontrado.'; END IF;
  IF p_curtir THEN
    INSERT INTO public.social_curtidas (sessao_id, user_id) VALUES (p_sessao, uid) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.social_curtidas WHERE sessao_id = p_sessao AND user_id = uid;
  END IF;
END;
$$;

/** Ranking do período entre eu e meus amigos (quem entra no ranking): treinos concluídos e dias com diário. */
CREATE OR REPLACE FUNCTION public.social_ranking(p_inicio DATE, p_fim DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := public._social_exigir_perfil();
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 31 THEN RAISE EXCEPTION 'Período inválido.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'treinos')::INT DESC, (x->>'dias_diario')::INT DESC, x->>'nome') FROM (
    SELECT jsonb_build_object(
      'user_id', p.user_id, 'nome', public._social_nome(p.user_id), 'eu', p.user_id = uid,
      'treinos', (SELECT count(*) FROM public.sessoes_treino s WHERE s.user_id = p.user_id AND s.concluido
                    AND (COALESCE(s.data_fim, s.data_inicio) AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_inicio AND p_fim),
      'dias_diario', (SELECT count(DISTINCT f.data) FROM public.food_logs f WHERE f.user_id = p.user_id AND f.data BETWEEN p_inicio AND p_fim)
    ) AS x
    FROM public.social_perfis p
    WHERE p.entrar_ranking AND (p.user_id = uid OR p.user_id IN (SELECT public._social_amigos(uid)))
  ) t), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.social_pendentes()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::INT FROM public.amizades WHERE destinatario = auth.uid() AND status = 'pendente';
$$;

-- Código de amigo: mesmo alfabeto do código de personal, único entre os perfis de amigos
CREATE OR REPLACE FUNCTION public._acomp_gerar_codigo_social()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE alfabeto CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c TEXT;
BEGIN
  LOOP
    SELECT string_agg(substr(alfabeto, 1 + floor(random() * 32)::INT, 1), '') INTO c FROM generate_series(1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.social_perfis WHERE codigo = c);
  END LOOP;
  RETURN c;
END;
$$;

-- ---------- Permissões ----------
REVOKE ALL ON FUNCTION public._social_nome(UUID), public._social_amigos(UUID), public._social_exigir_perfil(), public._acomp_gerar_codigo_social()
  FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'social_ativar(TEXT, BOOLEAN, BOOLEAN)', 'social_adicionar(TEXT)', 'social_responder(UUID, BOOLEAN)', 'social_remover(UUID)',
    'social_amigos()', 'social_feed(TIMESTAMPTZ)', 'social_curtir(UUID, BOOLEAN)', 'social_ranking(DATE, DATE)', 'social_pendentes()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
