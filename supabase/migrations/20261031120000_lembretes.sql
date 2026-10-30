-- ============================================================
-- R2 Fit Pro — Lembretes por notificação (Web Push).
-- O pg_cron chama a Edge Function a cada 5 minutos; ela envia os lembretes
-- que venceram e que ainda fazem sentido (ex.: refeição ainda não registrada).
-- ============================================================

-- Horários escolhidos pela pessoa. dias: 0 = domingo … 6 = sábado (EXTRACT(DOW)).
CREATE TABLE IF NOT EXISTS public.lembretes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('cafe', 'almoco', 'lanche', 'jantar', 'agua', 'treino', 'peso')),
  horario       TIME NOT NULL,
  dias          SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'
                CHECK (dias <@ '{0,1,2,3,4,5,6}'::SMALLINT[] AND cardinality(dias) BETWEEN 1 AND 7),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  fuso          TEXT NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (char_length(fuso) BETWEEN 1 AND 64),
  ultimo_envio  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lembretes_user_idx ON public.lembretes (user_id);
CREATE INDEX IF NOT EXISTS lembretes_ativos_idx ON public.lembretes (horario) WHERE ativo;

-- Fuso inválido falha aqui (em vez de quebrar a rotina depois)
CREATE OR REPLACE FUNCTION public.lembretes_validar() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM NOW() AT TIME ZONE NEW.fuso;
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := NOW(); END IF;
  IF TG_OP = 'UPDATE' AND (NEW.horario IS DISTINCT FROM OLD.horario OR NEW.dias IS DISTINCT FROM OLD.dias OR NEW.fuso IS DISTINCT FROM OLD.fuso) THEN
    NEW.ultimo_envio := NULL; -- horário novo pode valer ainda hoje
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lembretes_validar ON public.lembretes;
CREATE TRIGGER lembretes_validar BEFORE INSERT OR UPDATE ON public.lembretes FOR EACH ROW EXECUTE FUNCTION public.lembretes_validar();

ALTER TABLE public.lembretes ENABLE ROW LEVEL SECURITY;
CREATE POLICY lembretes_select ON public.lembretes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY lembretes_delete ON public.lembretes FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY lembretes_insert ON public.lembretes FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND public.tem_premium()
  AND (SELECT count(*) FROM public.lembretes l WHERE l.user_id = auth.uid()) < 30);
CREATE POLICY lembretes_update ON public.lembretes FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());
REVOKE ALL ON public.lembretes FROM anon;

-- Aparelhos inscritos para receber notificações (gravados pela Edge Function)
CREATE TABLE IF NOT EXISTS public.push_inscricoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh      TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 200),
  auth        TEXT NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 100),
  user_agent  TEXT CHECK (char_length(user_agent) <= 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_uso  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_inscricoes_user_idx ON public.push_inscricoes (user_id);
ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_inscricoes_select ON public.push_inscricoes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY push_inscricoes_delete ON public.push_inscricoes FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.push_inscricoes FROM anon;
REVOKE INSERT, UPDATE ON public.push_inscricoes FROM authenticated;

-- Chaves VAPID: geradas pela Edge Function no primeiro uso; só a chave de serviço lê
CREATE TABLE IF NOT EXISTS public.push_config (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  vapid_publica   TEXT NOT NULL,
  vapid_privada   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_config FROM anon, authenticated;

-- Candidatos: ativos, no dia da semana e até 15 min após o horário (no fuso da pessoa), ainda não enviados hoje
CREATE OR REPLACE FUNCTION public.lembretes_janela(p_agora TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (id UUID, user_id UUID, tipo TEXT, fuso TEXT, dia_local DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.id, l.user_id, l.tipo, l.fuso, (p_agora AT TIME ZONE l.fuso)::DATE
  FROM public.lembretes l
  WHERE l.ativo
    AND EXTRACT(DOW FROM p_agora AT TIME ZONE l.fuso)::SMALLINT = ANY (l.dias)
    AND (p_agora AT TIME ZONE l.fuso)::TIME - l.horario BETWEEN INTERVAL '0' AND INTERVAL '14 minutes 59 seconds'
    AND (l.ultimo_envio IS NULL OR l.ultimo_envio < (p_agora AT TIME ZONE l.fuso)::DATE)
$$;

-- Marca os lembretes da janela como tratados hoje e devolve só os que ainda fazem sentido:
-- refeição não registrada, meta de água não batida, treino não feito, peso não registrado; e acesso Premium.
CREATE OR REPLACE FUNCTION public.lembretes_devidos(p_agora TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (id UUID, user_id UUID, tipo TEXT)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  WITH janela AS (SELECT * FROM public.lembretes_janela(p_agora)),
  marcados AS (
    UPDATE public.lembretes l SET ultimo_envio = j.dia_local
    FROM janela j WHERE l.id = j.id
    RETURNING l.id, l.user_id, l.tipo, j.fuso, j.dia_local
  )
  SELECT m.id, m.user_id, m.tipo FROM marcados m
  WHERE public.tem_premium(m.user_id)
    AND CASE m.tipo
      WHEN 'cafe'   THEN NOT EXISTS (SELECT 1 FROM public.food_logs f WHERE f.user_id = m.user_id AND f.data = m.dia_local AND f.refeicao ILIKE 'caf%')
      WHEN 'almoco' THEN NOT EXISTS (SELECT 1 FROM public.food_logs f WHERE f.user_id = m.user_id AND f.data = m.dia_local AND f.refeicao ILIKE 'almo%')
      WHEN 'lanche' THEN NOT EXISTS (SELECT 1 FROM public.food_logs f WHERE f.user_id = m.user_id AND f.data = m.dia_local AND f.refeicao ILIKE 'lanch%')
      WHEN 'jantar' THEN NOT EXISTS (SELECT 1 FROM public.food_logs f WHERE f.user_id = m.user_id AND f.data = m.dia_local AND (f.refeicao ILIKE 'jant%' OR f.refeicao ILIKE 'ceia%'))
      WHEN 'agua'   THEN COALESCE((SELECT sum(a.ml) FROM public.registros_agua a WHERE a.user_id = m.user_id AND a.data = m.dia_local), 0)
                         < COALESCE((SELECT mn.meta_agua_ml FROM public.metas_nutricionais mn WHERE mn.user_id = m.user_id), 2000)
      WHEN 'treino' THEN NOT EXISTS (SELECT 1 FROM public.sessoes_treino s WHERE s.user_id = m.user_id
                          AND (s.data_inicio AT TIME ZONE m.fuso)::DATE = m.dia_local)
      WHEN 'peso'   THEN NOT EXISTS (SELECT 1 FROM public.registros_peso p WHERE p.user_id = m.user_id AND p.data = m.dia_local)
      ELSE FALSE
    END
$$;
REVOKE ALL ON FUNCTION public.lembretes_janela(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lembretes_devidos(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- Rotina do pg_cron: só chama a Edge Function quando há algum lembrete na janela
CREATE OR REPLACE FUNCTION public.lembretes_rotina()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_token TEXT := replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lembretes_janela(NOW())) THEN RETURN; END IF;
  DELETE FROM public.cron_tokens WHERE created_at < NOW() - INTERVAL '1 hour';
  INSERT INTO public.cron_tokens (token) VALUES (v_token);
  PERFORM net.http_post(
    url := 'https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/cron/lembretes',
    body := jsonb_build_object('token', v_token),
    headers := '{"Content-Type": "application/json"}'::JSONB,
    timeout_milliseconds := 30000);
END;
$$;
REVOKE ALL ON FUNCTION public.lembretes_rotina() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('r2-lembretes-push') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'r2-lembretes-push');
SELECT cron.schedule('r2-lembretes-push', '*/5 * * * *', 'SELECT public.lembretes_rotina()');
