-- ============================================================
-- R2 Fit Pro — Base comercial: perfis, configuração, assinaturas,
-- pagamentos, webhooks, suporte, LGPD, auditoria e e-mails.
-- Migração aditiva: não remove nem altera dados existentes.
-- ============================================================

-- ─── Perfis: novos campos (preserva dados existentes) ────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email              TEXT,
  ADD COLUMN IF NOT EXISTS telefone           TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento    DATE,
  ADD COLUMN IF NOT EXISTS aceite_termos_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS versao_termos      TEXT,
  ADD COLUMN IF NOT EXISTS marketing_opt_in   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nome_len CHECK (nome IS NULL OR char_length(nome) <= 120),
  ADD CONSTRAINT profiles_tel_len  CHECK (telefone IS NULL OR char_length(telefone) <= 30);

-- Preenche e-mail dos perfis existentes
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

-- Garante perfil para usuários que já existiam sem perfil
INSERT INTO public.profiles (id, nome, email)
SELECT u.id, COALESCE(u.raw_user_meta_data ->> 'nome', split_part(u.email, '@', 1)), u.email
FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, aceite_termos_em, versao_termos, marketing_opt_in)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1)), 120),
    NEW.email,
    CASE WHEN NEW.raw_user_meta_data ? 'versao_termos' THEN NOW() END,
    NEW.raw_user_meta_data ->> 'versao_termos',
    COALESCE((NEW.raw_user_meta_data ->> 'marketing_opt_in')::BOOLEAN, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Mantém e-mail do perfil sincronizado com auth.users
CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles SET email = NEW.email, updated_at = NOW() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_change();

-- ─── Preferências do usuário ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notificacoes  JSONB NOT NULL DEFAULT '{"email_cobranca": true, "email_novidades": false, "lembrete_treino": false}'::JSONB,
  audio         JSONB NOT NULL DEFAULT '{"volume": 1, "mudo": false}'::JSONB,
  preferencias  JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_json_obj CHECK (
    jsonb_typeof(notificacoes) = 'object' AND jsonb_typeof(audio) = 'object' AND jsonb_typeof(preferencias) = 'object'
    AND pg_column_size(preferencias) < 16384
  )
);
INSERT INTO public.user_settings (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

-- ─── Administradores (não editável pelo cliente) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.admins (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacao  TEXT
);

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = uid);
$$;

-- ─── Configuração comercial central (preço, empresa, textos) ─────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  chave       TEXT PRIMARY KEY CHECK (chave IN ('plano', 'empresa', 'textos')),
  valor       JSONB NOT NULL CHECK (jsonb_typeof(valor) = 'object'),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.app_config (chave, valor) VALUES
('plano', jsonb_build_object(
  'produto', 'R2 Fit Pro',
  'nome', 'R2 Fit Pro Premium',
  'preco_centavos', 1990,
  'moeda', 'BRL',
  'intervalo', 'mensal',
  'tolerancia_dias', 3,
  'arrependimento_dias', 7,
  'vendas_ativas', true,
  'beneficios', jsonb_build_array(
    'Planos de treino gerados por IA ou montados por você',
    'Catálogo de exercícios com busca inteligente',
    'Contador de treino com áudio e controle de séries',
    'Planos alimentares personalizados por IA',
    'Contador de calorias com estimativa por texto ou foto',
    'Histórico de treinos e registros alimentares'
  )
)),
('empresa', jsonb_build_object(
  'nome_fantasia', 'R2 Fit Pro',
  'razao_social', NULL,
  'cnpj', NULL,
  'endereco', NULL,
  'email_suporte', NULL,
  'email_privacidade', NULL,
  'telefone', NULL,
  'encarregado_dados', NULL,
  'foro', NULL
)),
('textos', jsonb_build_object(
  'versao_termos', '2026-10-22',
  'versao_privacidade', '2026-10-22',
  'aviso_global', NULL,
  'horario_suporte', NULL
))
ON CONFLICT (chave) DO NOTHING;

-- ─── Assinaturas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider                  TEXT NOT NULL DEFAULT 'mercadopago',
  provider_subscription_id  TEXT UNIQUE,
  provider_status           TEXT,
  status                    TEXT NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'ativa', 'inadimplente', 'cancelada', 'expirada')),
  plano_nome                TEXT NOT NULL,
  preco_centavos            INTEGER NOT NULL CHECK (preco_centavos > 0),
  moeda                     TEXT NOT NULL DEFAULT 'BRL',
  iniciada_em               TIMESTAMPTZ,
  periodo_atual_fim         TIMESTAMPTZ,
  proxima_cobranca          TIMESTAMPTZ,
  cancelada_em              TIMESTAMPTZ,
  checkout_url              TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- ─── Pagamentos (mantidos após exclusão de conta, por obrigação fiscal) ─────
CREATE TABLE IF NOT EXISTS public.payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id       UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider              TEXT NOT NULL DEFAULT 'mercadopago',
  provider_payment_id   TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('aprovado', 'pendente', 'recusado', 'estornado', 'cancelado', 'em_disputa')),
  status_detalhe        TEXT,
  valor_centavos        INTEGER NOT NULL CHECK (valor_centavos >= 0),
  valor_estornado_centavos INTEGER NOT NULL DEFAULT 0,
  moeda                 TEXT NOT NULL DEFAULT 'BRL',
  metodo                TEXT,
  pago_em               TIMESTAMPTZ,
  comprovante_url       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_payment_id)
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status, created_at DESC);

-- ─── Eventos de webhook (idempotência e diagnóstico) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL DEFAULT 'mercadopago',
  event_key     TEXT NOT NULL UNIQUE,
  topico        TEXT,
  acao          TEXT,
  resource_id   TEXT,
  assinatura_valida BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'processado', 'ignorado', 'erro', 'rejeitado')),
  tentativas    INTEGER NOT NULL DEFAULT 1,
  erro          TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON public.webhook_events(created_at DESC);

-- ─── Suporte ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria   TEXT NOT NULL CHECK (categoria IN ('conta', 'assinatura', 'pagamento', 'treino', 'dieta', 'calorias', 'privacidade', 'bug', 'outro')),
  assunto     TEXT NOT NULL CHECK (char_length(assunto) BETWEEN 3 AND 150),
  mensagem    TEXT NOT NULL CHECK (char_length(mensagem) BETWEEN 10 AND 5000),
  status      TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'respondido', 'fechado')),
  resposta    TEXT CHECK (resposta IS NULL OR char_length(resposta) <= 5000),
  respondido_em TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_user ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_status ON public.support_tickets(status, created_at DESC);

-- ─── Solicitações de privacidade (LGPD) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT,
  tipo          TEXT NOT NULL CHECK (tipo IN ('exportacao', 'exclusao', 'correcao', 'revogacao', 'informacao')),
  status        TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida', 'recusada')),
  detalhes      TEXT CHECK (detalhes IS NULL OR char_length(detalhes) <= 3000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_em  TIMESTAMPTZ
);

-- ─── Auditoria ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID,
  acao        TEXT NOT NULL,
  alvo        TEXT,
  detalhes    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- ─── Fila de e-mails transacionais ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  destinatario TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  dedupe_key  TEXT UNIQUE,
  dados       JSONB NOT NULL DEFAULT '{}'::JSONB,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro', 'sem_provedor')),
  tentativas  INTEGER NOT NULL DEFAULT 0,
  erro        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_em  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON public.email_outbox(status, created_at);

-- ─── Uso de IA (limite diário anti-abuso) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia       DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE,
  chamadas  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, dia)
);

-- ============================================================
-- Regras de acesso
-- ============================================================

-- Estado de acesso calculado no servidor (fonte única de verdade)
CREATE OR REPLACE FUNCTION public.estado_acesso(uid UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s RECORD;
  tolerancia INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN 'visitante'; END IF;
  -- Clientes (anon/authenticated) só consultam o próprio estado, exceto admins.
  -- service_role e acesso direto ao banco não têm essa restrição.
  IF uid IS DISTINCT FROM auth.uid() AND auth.role() IN ('anon', 'authenticated')
     AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = uid) THEN RETURN 'admin'; END IF;

  SELECT COALESCE((valor ->> 'tolerancia_dias')::INTEGER, 0) INTO tolerancia
  FROM public.app_config WHERE chave = 'plano';
  tolerancia := COALESCE(tolerancia, 0);

  -- Prioriza assinatura com acesso vigente; depois a mais recente
  SELECT * INTO s FROM public.subscriptions
  WHERE user_id = uid
  ORDER BY
    (status IN ('ativa', 'inadimplente', 'cancelada') AND periodo_atual_fim > NOW()) DESC,
    created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN 'sem_assinatura'; END IF;

  IF s.status = 'ativa' THEN
    -- Sem pagamento aprovado não há período pago: não libera acesso
    IF s.periodo_atual_fim IS NULL THEN RETURN 'pagamento_pendente'; END IF;
    IF s.periodo_atual_fim > NOW() THEN RETURN 'ativa'; END IF;
    IF s.periodo_atual_fim + make_interval(days => tolerancia) > NOW() THEN RETURN 'tolerancia'; END IF;
    RETURN 'expirada';
  ELSIF s.status = 'inadimplente' THEN
    IF s.periodo_atual_fim IS NOT NULL AND s.periodo_atual_fim + make_interval(days => tolerancia) > NOW() THEN
      RETURN 'tolerancia';
    END IF;
    RETURN 'pagamento_pendente';
  ELSIF s.status = 'cancelada' THEN
    IF s.periodo_atual_fim IS NOT NULL AND s.periodo_atual_fim > NOW() THEN RETURN 'cancelada_vigente'; END IF;
    RETURN 'expirada';
  ELSIF s.status = 'pendente' THEN
    RETURN 'pagamento_pendente';
  END IF;
  RETURN 'expirada';
END;
$$;

CREATE OR REPLACE FUNCTION public.tem_premium(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.estado_acesso(uid) IN ('admin', 'ativa', 'tolerancia', 'cancelada_vigente');
$$;

-- Contabiliza uma chamada de IA e informa se está dentro do limite diário
CREATE OR REPLACE FUNCTION public.registrar_uso_ia(limite INTEGER DEFAULT 80)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  total INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'nao_autenticado'); END IF;
  IF NOT public.tem_premium(uid) THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'sem_premium'); END IF;
  INSERT INTO public.ai_usage (user_id, dia, chamadas)
  VALUES (uid, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, 1)
  ON CONFLICT (user_id, dia) DO UPDATE SET chamadas = public.ai_usage.chamadas + 1
  RETURNING chamadas INTO total;
  IF total > GREATEST(limite, 1) THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'limite_diario', 'chamadas', total);
  END IF;
  RETURN jsonb_build_object('permitido', true, 'chamadas', total);
END;
$$;

-- Resumo de acesso do usuário logado (para o frontend)
CREATE OR REPLACE FUNCTION public.meu_acesso()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'estado', public.estado_acesso(auth.uid()),
    'premium', public.tem_premium(auth.uid()),
    'admin', public.is_admin(auth.uid())
  );
$$;

-- ─── Auditoria automática ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, acao, alvo, detalhes)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END ->> 'id',
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END ->> 'chave',
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END ->> 'user_id'
    ),
    CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW))
      WHEN TG_OP = 'DELETE' THEN jsonb_build_object('antes', to_jsonb(OLD))
      ELSE jsonb_build_object('depois', to_jsonb(NEW))
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_app_config ON public.app_config;
CREATE TRIGGER audit_app_config AFTER INSERT OR UPDATE OR DELETE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();
DROP TRIGGER IF EXISTS audit_admins ON public.admins;
CREATE TRIGGER audit_admins AFTER INSERT OR UPDATE OR DELETE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

-- Respostas de suporte feitas por admin ficam auditadas
CREATE OR REPLACE FUNCTION public.auditar_ticket_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_admin(auth.uid()) AND auth.uid() IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.audit_logs (actor_id, acao, alvo, detalhes)
    VALUES (auth.uid(), 'support_tickets.update', NEW.id::TEXT,
            jsonb_build_object('status_antes', OLD.status, 'status_depois', NEW.status, 'respondeu', NEW.resposta IS DISTINCT FROM OLD.resposta));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS audit_support_admin ON public.support_tickets;
CREATE TRIGGER audit_support_admin AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.auditar_ticket_admin();

-- Usuário comum só pode alterar campos permitidos do próprio ticket
CREATE OR REPLACE FUNCTION public.proteger_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := NOW();
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin(auth.uid()) THEN
      NEW.status := 'aberto'; NEW.resposta := NULL; NEW.respondido_em := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF NOT public.is_admin(auth.uid()) THEN
    -- cliente só pode fechar o próprio chamado
    IF NEW.resposta IS DISTINCT FROM OLD.resposta OR NEW.assunto IS DISTINCT FROM OLD.assunto
       OR NEW.mensagem IS DISTINCT FROM OLD.mensagem OR NEW.categoria IS DISTINCT FROM OLD.categoria
       OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.status NOT IN (OLD.status, 'fechado') THEN
      RAISE EXCEPTION 'Alteração não permitida';
    END IF;
  ELSIF NEW.resposta IS DISTINCT FROM OLD.resposta THEN
    NEW.respondido_em := NOW();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proteger_ticket ON public.support_tickets;
CREATE TRIGGER proteger_ticket BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.proteger_ticket();

-- Perfil: cliente não altera e-mail nem registros de aceite diretamente
CREATE OR REPLACE FUNCTION public.proteger_perfil()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.id := OLD.id;
    NEW.email := OLD.email;
    NEW.created_at := OLD.created_at;
    IF NEW.versao_termos IS DISTINCT FROM OLD.versao_termos THEN
      NEW.aceite_termos_em := NOW();
    ELSE
      NEW.aceite_termos_em := OLD.aceite_termos_em;
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proteger_perfil ON public.profiles;
CREATE TRIGGER proteger_perfil BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.user_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage         ENABLE ROW LEVEL SECURITY;

-- Perfis: substitui a política genérica por políticas explícitas
DROP POLICY IF EXISTS "Usuário vê próprio perfil" ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Dados de treino/dieta/calorias: leitura e exclusão sempre permitidas ao dono
-- (acesso aos próprios dados - LGPD); criação e edição exigem Premium.
DROP POLICY IF EXISTS "Usuário gerencia próprias dietas" ON public.dietas;
CREATE POLICY dietas_select ON public.dietas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dietas_delete ON public.dietas FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY dietas_insert ON public.dietas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.tem_premium());
CREATE POLICY dietas_update ON public.dietas FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());

DROP POLICY IF EXISTS "Usuário gerencia próprios treinos" ON public.treinos;
CREATE POLICY treinos_select ON public.treinos FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY treinos_delete ON public.treinos FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY treinos_insert ON public.treinos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.tem_premium());
CREATE POLICY treinos_update ON public.treinos FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.tem_premium());

DROP POLICY IF EXISTS "Usuário gerencia próprias sessões" ON public.sessoes_treino;
CREATE POLICY sessoes_select ON public.sessoes_treino FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY sessoes_delete ON public.sessoes_treino FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY sessoes_insert ON public.sessoes_treino FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.tem_premium()
              AND (treino_id IS NULL OR EXISTS (SELECT 1 FROM public.treinos t WHERE t.id = treino_id AND t.user_id = auth.uid())));
CREATE POLICY sessoes_update ON public.sessoes_treino FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.tem_premium()
              AND (treino_id IS NULL OR EXISTS (SELECT 1 FROM public.treinos t WHERE t.id = treino_id AND t.user_id = auth.uid())));

DROP POLICY IF EXISTS food_logs_select ON public.food_logs;
DROP POLICY IF EXISTS food_logs_insert ON public.food_logs;
DROP POLICY IF EXISTS food_logs_delete ON public.food_logs;
CREATE POLICY food_logs_select ON public.food_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY food_logs_delete ON public.food_logs FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY food_logs_insert ON public.food_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.tem_premium());

-- Preferências
CREATE POLICY user_settings_select ON public.user_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_settings_insert ON public.user_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY user_settings_update ON public.user_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Admins: só leitura para administradores; inclusão apenas via SQL privilegiado
CREATE POLICY admins_select ON public.admins FOR SELECT TO authenticated USING (public.is_admin());

-- Configuração: leitura pública (preço e dados exibidos na página comercial), escrita só admin
CREATE POLICY app_config_select ON public.app_config FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY app_config_update ON public.app_config FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Assinaturas e pagamentos: leitura do dono ou admin; escrita somente pelo backend (service role)
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Webhooks, auditoria, e-mails: somente admin lê
CREATE POLICY webhook_events_select ON public.webhook_events FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY email_outbox_select ON public.email_outbox FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY ai_usage_select ON public.ai_usage FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- Suporte
CREATE POLICY support_select ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY support_insert ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY support_update ON public.support_tickets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Privacidade
CREATE POLICY privacy_select ON public.privacy_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY privacy_insert ON public.privacy_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'aberta' AND concluida_em IS NULL);
CREATE POLICY privacy_update_admin ON public.privacy_requests FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── Permissões de funções ───────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.estado_acesso(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tem_premium(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_uso_ia(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meu_acesso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_acesso(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tem_premium(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_uso_ia(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meu_acesso() TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_auditoria() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_user_email_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auditar_ticket_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_ticket() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_perfil() FROM PUBLIC, anon, authenticated;
