-- Tabela de configuração da integração Bolt
CREATE TABLE public.bolt_configuracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  client_secret text NOT NULL,
  company_id bigint NOT NULL,
  company_name text,
  ativo boolean DEFAULT false,
  ultimo_sync timestamp with time zone,
  sync_automatico boolean DEFAULT false,
  intervalo_sync_horas integer DEFAULT 6,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id)
);

-- Tabela de viagens importadas da Bolt
CREATE TABLE public.bolt_viagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference text UNIQUE NOT NULL,
  driver_uuid text,
  driver_name text,
  driver_phone text,
  motorista_id uuid REFERENCES public.motoristas_ativos(id),
  viatura_id uuid REFERENCES public.viaturas(id),
  vehicle_license_plate text,
  vehicle_model text,
  payment_method text,
  order_status text,
  order_created_timestamp timestamp with time zone,
  payment_confirmed_timestamp timestamp with time zone,
  pickup_address text,
  destination_address text,
  total_price numeric(10,2),
  driver_earnings numeric(10,2),
  commission numeric(10,2),
  dados_raw jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de mapeamento de motoristas Bolt para sistema
CREATE TABLE public.bolt_mapeamento_motoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_uuid text UNIQUE NOT NULL,
  driver_name text,
  driver_phone text,
  motorista_id uuid REFERENCES public.motoristas_ativos(id),
  auto_mapped boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de logs de sincronização
CREATE TABLE public.bolt_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL, -- 'sync', 'auth', 'error'
  status text NOT NULL, -- 'success', 'error', 'partial'
  mensagem text,
  viagens_novas integer DEFAULT 0,
  viagens_atualizadas integer DEFAULT 0,
  erros integer DEFAULT 0,
  detalhes jsonb,
  executado_por uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_bolt_viagens_order_reference ON public.bolt_viagens(order_reference);
CREATE INDEX idx_bolt_viagens_driver_uuid ON public.bolt_viagens(driver_uuid);
CREATE INDEX idx_bolt_viagens_motorista_id ON public.bolt_viagens(motorista_id);
CREATE INDEX idx_bolt_viagens_order_created ON public.bolt_viagens(order_created_timestamp);
CREATE INDEX idx_bolt_mapeamento_driver_uuid ON public.bolt_mapeamento_motoristas(driver_uuid);
CREATE INDEX idx_bolt_sync_logs_created ON public.bolt_sync_logs(created_at);

-- Enable RLS
ALTER TABLE public.bolt_configuracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_viagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_mapeamento_motoristas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies para bolt_configuracao (apenas admins)
CREATE POLICY "Admins podem gerir configuração Bolt"
  ON public.bolt_configuracao FOR ALL
  USING (is_current_user_admin() = true)
  WITH CHECK (is_current_user_admin() = true);

-- RLS Policies para bolt_viagens
CREATE POLICY "Admins podem ver todas as viagens Bolt"
  ON public.bolt_viagens FOR SELECT
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Admins podem gerir viagens Bolt"
  ON public.bolt_viagens FOR ALL
  USING (is_current_user_admin() = true)
  WITH CHECK (is_current_user_admin() = true);

-- RLS Policies para bolt_mapeamento_motoristas
CREATE POLICY "Admins podem gerir mapeamento Bolt"
  ON public.bolt_mapeamento_motoristas FOR ALL
  USING (is_current_user_admin() = true)
  WITH CHECK (is_current_user_admin() = true);

CREATE POLICY "Gestores podem ver mapeamento Bolt"
  ON public.bolt_mapeamento_motoristas FOR SELECT
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- RLS Policies para bolt_sync_logs
CREATE POLICY "Admins podem ver logs Bolt"
  ON public.bolt_sync_logs FOR SELECT
  USING (is_current_user_admin() = true);

CREATE POLICY "Sistema pode criar logs Bolt"
  ON public.bolt_sync_logs FOR INSERT
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_bolt_configuracao_updated_at
  BEFORE UPDATE ON public.bolt_configuracao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bolt_viagens_updated_at
  BEFORE UPDATE ON public.bolt_viagens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bolt_mapeamento_updated_at
  BEFORE UPDATE ON public.bolt_mapeamento_motoristas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();