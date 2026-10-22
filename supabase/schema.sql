-- ============================================================
-- R2 Fit Pro — Schema do Banco de Dados
-- ============================================================

-- profiles (extende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome        TEXT,
  avatar_url  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- dietas
CREATE TABLE IF NOT EXISTS public.dietas (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome         TEXT NOT NULL,
  objetivo     TEXT NOT NULL,
  calorias_dia INTEGER NOT NULL,
  plano        JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- treinos
CREATE TABLE IF NOT EXISTS public.treinos (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome                TEXT NOT NULL,
  objetivo            TEXT NOT NULL,
  nivel               TEXT NOT NULL,
  frequencia_semanal  INTEGER NOT NULL,
  plano               JSONB NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- sessoes_treino
CREATE TABLE IF NOT EXISTS public.sessoes_treino (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  treino_id         UUID REFERENCES public.treinos(id) ON DELETE SET NULL,
  treino_nome       TEXT,
  dia_index         INTEGER DEFAULT 0,
  data_inicio       TIMESTAMPTZ DEFAULT NOW(),
  data_fim          TIMESTAMPTZ,
  concluido         BOOLEAN DEFAULT FALSE,
  series_realizadas JSONB DEFAULT '{}'::JSONB
);

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dietas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treinos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_treino ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Usuário vê próprio perfil" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Dietas
CREATE POLICY "Usuário gerencia próprias dietas" ON public.dietas
  FOR ALL USING (auth.uid() = user_id);

-- Treinos
CREATE POLICY "Usuário gerencia próprios treinos" ON public.treinos
  FOR ALL USING (auth.uid() = user_id);

-- Sessões
CREATE POLICY "Usuário gerencia próprias sessões" ON public.sessoes_treino
  FOR ALL USING (auth.uid() = user_id);

-- ─── Trigger: cria perfil ao cadastrar ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dietas_user_id ON public.dietas(user_id);
CREATE INDEX IF NOT EXISTS idx_treinos_user_id ON public.treinos(user_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_user_id ON public.sessoes_treino(user_id);
CREATE INDEX IF NOT EXISTS idx_dietas_created ON public.dietas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treinos_created ON public.treinos(created_at DESC);
