-- Expandir configuração Uber em plataformas_configuracao
ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS uber_scopes text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS redirect_uri text,
  ADD COLUMN IF NOT EXISTS privacy_policy_url text,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_secret_hint text,
  ADD COLUMN IF NOT EXISTS uber_environment text DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS encryption_key_fingerprint text,
  ADD COLUMN IF NOT EXISTS oauth_state_secret_hint text,
  ADD COLUMN IF NOT EXISTS oauth_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_oauth_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamp with time zone;

-- Tabela de motoristas Uber sincronizados da API supplier-level
CREATE TABLE IF NOT EXISTS public.uber_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  uber_driver_id text NOT NULL,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  status text,
  account_status text,
  flow_type text,
  onboarding_status text,
  city text,
  rating numeric,
  raw_profile jsonb,
  encrypted_fields jsonb,
  decrypted_fields jsonb,
  consent_granted_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_drivers_integracao_driver_unique UNIQUE (integracao_id, uber_driver_id)
);

-- Tokens OAuth por motorista
CREATE TABLE IF NOT EXISTS public.uber_driver_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  uber_driver_id text NOT NULL,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamp with time zone,
  consented_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_driver_tokens_integracao_driver_unique UNIQUE (integracao_id, uber_driver_id)
);

-- Perfil detalhado do motorista obtido por OAuth Authorization Code
CREATE TABLE IF NOT EXISTS public.uber_driver_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  uber_driver_id text NOT NULL,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_fields jsonb,
  decrypted_fields jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_driver_profiles_integracao_driver_unique UNIQUE (integracao_id, uber_driver_id)
);

CREATE TABLE IF NOT EXISTS public.uber_driver_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  uber_driver_id text NOT NULL,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  compliance_status text,
  compliance_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_driver_compliance_integracao_driver_unique UNIQUE (integracao_id, uber_driver_id)
);

CREATE TABLE IF NOT EXISTS public.uber_driver_risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  uber_driver_id text NOT NULL,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  risk_level text,
  risk_score numeric,
  risk_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_driver_risk_profiles_integracao_driver_unique UNIQUE (integracao_id, uber_driver_id)
);

-- Viaturas Uber e documentos
CREATE TABLE IF NOT EXISTS public.uber_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  viatura_id uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  uber_vehicle_id text NOT NULL,
  owner_id text,
  license_plate text,
  normalized_license_plate text GENERATED ALWAYS AS (public.normalize_plate(license_plate)) STORED,
  make text,
  model text,
  color text,
  year integer,
  status text,
  supply_status text,
  fleet_status text,
  raw_vehicle jsonb,
  encrypted_fields jsonb,
  decrypted_fields jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_vehicles_integracao_vehicle_unique UNIQUE (integracao_id, uber_vehicle_id)
);

CREATE TABLE IF NOT EXISTS public.uber_vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  uber_vehicle_id text NOT NULL,
  uber_vehicle_uuid uuid REFERENCES public.uber_vehicles(id) ON DELETE CASCADE,
  viatura_id uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  document_id text,
  document_type text,
  status text,
  expires_at timestamp with time zone,
  raw_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_vehicle_documents_integracao_document_unique UNIQUE NULLS NOT DISTINCT (integracao_id, uber_vehicle_id, document_id)
);

-- Transações Uber separadas de uber_viagens legado
CREATE TABLE IF NOT EXISTS public.uber_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  uber_transaction_id text NOT NULL,
  trip_reference text,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  viatura_id uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  uber_driver_id text,
  uber_vehicle_id text,
  transaction_type text,
  status text,
  currency text,
  gross_amount numeric,
  net_amount numeric,
  commission_amount numeric,
  occurred_at timestamp with time zone,
  settled_at timestamp with time zone,
  raw_transaction jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_transactions_integracao_external_unique UNIQUE (integracao_id, uber_transaction_id)
);

-- Webhooks e cursores de sync
CREATE TABLE IF NOT EXISTS public.uber_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid REFERENCES public.plataformas_configuracao(id) ON DELETE SET NULL,
  event_id text,
  event_type text NOT NULL,
  signature text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'pending',
  processed_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_webhook_events_event_unique UNIQUE NULLS NOT DISTINCT (integracao_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.uber_sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  domain text NOT NULL,
  cursor_value text,
  synced_from timestamp with time zone,
  synced_to timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_sync_cursors_integracao_domain_unique UNIQUE (integracao_id, domain)
);

CREATE TABLE IF NOT EXISTS public.uber_write_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  executado_por uuid,
  operation text NOT NULL,
  entity_type text NOT NULL,
  entity_external_id text,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb,
  status text NOT NULL,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_uber_drivers_integracao_id ON public.uber_drivers(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_drivers_motorista_id ON public.uber_drivers(motorista_id);
CREATE INDEX IF NOT EXISTS idx_uber_drivers_phone_norm ON public.uber_drivers((public.normalize_phone(phone)));
CREATE INDEX IF NOT EXISTS idx_uber_drivers_email ON public.uber_drivers(lower(email));
CREATE INDEX IF NOT EXISTS idx_uber_driver_tokens_integracao_id ON public.uber_driver_tokens(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_driver_profiles_integracao_id ON public.uber_driver_profiles(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_driver_compliance_integracao_id ON public.uber_driver_compliance(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_driver_risk_profiles_integracao_id ON public.uber_driver_risk_profiles(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_vehicles_integracao_id ON public.uber_vehicles(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_vehicles_viatura_id ON public.uber_vehicles(viatura_id);
CREATE INDEX IF NOT EXISTS idx_uber_vehicles_plate_norm ON public.uber_vehicles(normalized_license_plate);
CREATE INDEX IF NOT EXISTS idx_uber_vehicle_documents_integracao_id ON public.uber_vehicle_documents(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_transactions_integracao_id ON public.uber_transactions(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_transactions_occurred_at ON public.uber_transactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_uber_webhook_events_integracao_id ON public.uber_webhook_events(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_webhook_events_processing_status ON public.uber_webhook_events(processing_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uber_sync_cursors_integracao_id ON public.uber_sync_cursors(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_write_logs_integracao_id ON public.uber_write_logs(integracao_id, created_at DESC);

-- Trigger helper reutilizável
CREATE OR REPLACE FUNCTION public.update_uber_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_uber_drivers_updated_at ON public.uber_drivers;
CREATE TRIGGER update_uber_drivers_updated_at
BEFORE UPDATE ON public.uber_drivers
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_driver_tokens_updated_at ON public.uber_driver_tokens;
CREATE TRIGGER update_uber_driver_tokens_updated_at
BEFORE UPDATE ON public.uber_driver_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_driver_profiles_updated_at ON public.uber_driver_profiles;
CREATE TRIGGER update_uber_driver_profiles_updated_at
BEFORE UPDATE ON public.uber_driver_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_driver_compliance_updated_at ON public.uber_driver_compliance;
CREATE TRIGGER update_uber_driver_compliance_updated_at
BEFORE UPDATE ON public.uber_driver_compliance
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_driver_risk_profiles_updated_at ON public.uber_driver_risk_profiles;
CREATE TRIGGER update_uber_driver_risk_profiles_updated_at
BEFORE UPDATE ON public.uber_driver_risk_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_vehicles_updated_at ON public.uber_vehicles;
CREATE TRIGGER update_uber_vehicles_updated_at
BEFORE UPDATE ON public.uber_vehicles
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_vehicle_documents_updated_at ON public.uber_vehicle_documents;
CREATE TRIGGER update_uber_vehicle_documents_updated_at
BEFORE UPDATE ON public.uber_vehicle_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_transactions_updated_at ON public.uber_transactions;
CREATE TRIGGER update_uber_transactions_updated_at
BEFORE UPDATE ON public.uber_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

DROP TRIGGER IF EXISTS update_uber_sync_cursors_updated_at ON public.uber_sync_cursors;
CREATE TRIGGER update_uber_sync_cursors_updated_at
BEFORE UPDATE ON public.uber_sync_cursors
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_updated_at_column();

-- Ativar RLS
ALTER TABLE public.uber_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_driver_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_driver_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_driver_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_write_logs ENABLE ROW LEVEL SECURITY;

-- Políticas admin-only para tabelas técnicas Uber
DROP POLICY IF EXISTS "Admins podem gerir motoristas Uber" ON public.uber_drivers;
CREATE POLICY "Admins podem gerir motoristas Uber"
ON public.uber_drivers
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir tokens OAuth Uber" ON public.uber_driver_tokens;
CREATE POLICY "Admins podem gerir tokens OAuth Uber"
ON public.uber_driver_tokens
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir perfis OAuth Uber" ON public.uber_driver_profiles;
CREATE POLICY "Admins podem gerir perfis OAuth Uber"
ON public.uber_driver_profiles
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir compliance Uber" ON public.uber_driver_compliance;
CREATE POLICY "Admins podem gerir compliance Uber"
ON public.uber_driver_compliance
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir risco Uber" ON public.uber_driver_risk_profiles;
CREATE POLICY "Admins podem gerir risco Uber"
ON public.uber_driver_risk_profiles
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir viaturas Uber" ON public.uber_vehicles;
CREATE POLICY "Admins podem gerir viaturas Uber"
ON public.uber_vehicles
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir documentos viaturas Uber" ON public.uber_vehicle_documents;
CREATE POLICY "Admins podem gerir documentos viaturas Uber"
ON public.uber_vehicle_documents
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir transações Uber" ON public.uber_transactions;
CREATE POLICY "Admins podem gerir transações Uber"
ON public.uber_transactions
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir webhooks Uber" ON public.uber_webhook_events;
CREATE POLICY "Admins podem gerir webhooks Uber"
ON public.uber_webhook_events
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir cursores Uber" ON public.uber_sync_cursors;
CREATE POLICY "Admins podem gerir cursores Uber"
ON public.uber_sync_cursors
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

DROP POLICY IF EXISTS "Admins podem gerir logs escrita Uber" ON public.uber_write_logs;
CREATE POLICY "Admins podem gerir logs escrita Uber"
ON public.uber_write_logs
FOR ALL
USING (public.is_current_user_admin() = true)
WITH CHECK (public.is_current_user_admin() = true);

-- Permissões de leitura operacionais em transações
DROP POLICY IF EXISTS "Operacionais podem ver transações Uber" ON public.uber_transactions;
CREATE POLICY "Operacionais podem ver transações Uber"
ON public.uber_transactions
FOR SELECT
USING (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'motoristas_gestao'));

-- Helper para obter config Uber de forma segura em funções server-side
CREATE OR REPLACE FUNCTION public.get_uber_platform_config(p_integracao_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  plataforma text,
  client_id text,
  client_secret text,
  uber_scopes text[],
  redirect_uri text,
  privacy_policy_url text,
  webhook_url text,
  webhook_secret_hint text,
  uber_environment text,
  encryption_key_fingerprint text,
  oauth_state_secret_hint text,
  oauth_enabled boolean,
  ativo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pc.id,
    pc.nome,
    pc.plataforma,
    pc.client_id,
    pc.client_secret,
    pc.uber_scopes,
    pc.redirect_uri,
    pc.privacy_policy_url,
    pc.webhook_url,
    pc.webhook_secret_hint,
    pc.uber_environment,
    pc.encryption_key_fingerprint,
    pc.oauth_state_secret_hint,
    pc.oauth_enabled,
    pc.ativo
  FROM public.plataformas_configuracao pc
  WHERE pc.id = p_integracao_id
    AND pc.plataforma = 'uber';
$$;