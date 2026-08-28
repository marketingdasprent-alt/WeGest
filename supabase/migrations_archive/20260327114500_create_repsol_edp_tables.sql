-- Criar estruturas para Repsol
CREATE TABLE IF NOT EXISTS public.repsol_cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID REFERENCES plataformas_configuracao(id) ON DELETE CASCADE,
  card_number TEXT NOT NULL,
  card_status TEXT,
  motorista_id UUID REFERENCES motoristas_ativos(id),
  viatura_id UUID REFERENCES viaturas(id),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_number)
);

CREATE TABLE IF NOT EXISTS public.repsol_transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID NOT NULL REFERENCES plataformas_configuracao(id) ON DELETE CASCADE,
  card_number TEXT,
  transaction_id TEXT NOT NULL,
  amount NUMERIC(10,2) DEFAULT 0,
  quantity NUMERIC(10,3),
  fuel_type TEXT,
  transaction_date TIMESTAMPTZ NOT NULL,
  station_name TEXT,
  motorista_id UUID REFERENCES motoristas_ativos(id) ON DELETE SET NULL,
  viatura_id UUID REFERENCES viaturas(id) ON DELETE SET NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(integracao_id, transaction_id)
);

-- Criar estruturas para EDP
CREATE TABLE IF NOT EXISTS public.edp_cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID REFERENCES plataformas_configuracao(id) ON DELETE CASCADE,
  card_number TEXT NOT NULL,
  card_status TEXT,
  motorista_id UUID REFERENCES motoristas_ativos(id),
  viatura_id UUID REFERENCES viaturas(id),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_number)
);

CREATE TABLE IF NOT EXISTS public.edp_transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID NOT NULL REFERENCES plataformas_configuracao(id) ON DELETE CASCADE,
  card_number TEXT,
  transaction_id TEXT NOT NULL,
  amount NUMERIC(10,2) DEFAULT 0,
  quantity NUMERIC(10,3),
  transaction_date TIMESTAMPTZ NOT NULL,
  station_name TEXT,
  motorista_id UUID REFERENCES motoristas_ativos(id) ON DELETE SET NULL,
  viatura_id UUID REFERENCES viaturas(id) ON DELETE SET NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(integracao_id, transaction_id)
);

-- Habilitar RLS e adicionar políticas básicas (Admin)
ALTER TABLE public.repsol_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repsol_transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edp_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edp_transacoes ENABLE ROW LEVEL SECURITY;

-- Políticas Repsol
CREATE POLICY "Admins podem gerir repsol_cartoes" ON public.repsol_cartoes FOR ALL TO authenticated USING (is_current_user_admin());
CREATE POLICY "Admins podem gerir repsol_transacoes" ON public.repsol_transacoes FOR ALL TO authenticated USING (is_current_user_admin());

-- Políticas EDP
CREATE POLICY "Admins podem gerir edp_cartoes" ON public.edp_cartoes FOR ALL TO authenticated USING (is_current_user_admin());
CREATE POLICY "Admins podem gerir edp_transacoes" ON public.edp_transacoes FOR ALL TO authenticated USING (is_current_user_admin());
