-- Estrutura base para integração Uber
CREATE TABLE IF NOT EXISTS public.uber_viagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  trip_reference TEXT NOT NULL,
  external_trip_id TEXT,
  motorista_id UUID REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  viatura_id UUID REFERENCES public.viaturas(id) ON DELETE SET NULL,
  driver_name TEXT,
  driver_phone TEXT,
  vehicle_license_plate TEXT,
  vehicle_model TEXT,
  pickup_address TEXT,
  destination_address TEXT,
  payment_method TEXT,
  trip_status TEXT,
  trip_created_at TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  total_price NUMERIC,
  driver_earnings NUMERIC,
  commission NUMERIC,
  dados_raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uber_viagens_integracao_trip_reference_key UNIQUE (integracao_id, trip_reference)
);

CREATE TABLE IF NOT EXISTS public.uber_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  executado_por UUID,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL,
  mensagem TEXT,
  viagens_novas INTEGER DEFAULT 0,
  viagens_atualizadas INTEGER DEFAULT 0,
  erros INTEGER DEFAULT 0,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uber_viagens_integracao_id ON public.uber_viagens(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_viagens_trip_created_at ON public.uber_viagens(trip_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uber_viagens_vehicle_license_plate ON public.uber_viagens(vehicle_license_plate);
CREATE INDEX IF NOT EXISTS idx_uber_viagens_motorista_id ON public.uber_viagens(motorista_id);
CREATE INDEX IF NOT EXISTS idx_uber_viagens_viatura_id ON public.uber_viagens(viatura_id);
CREATE INDEX IF NOT EXISTS idx_uber_sync_logs_integracao_id ON public.uber_sync_logs(integracao_id);
CREATE INDEX IF NOT EXISTS idx_uber_sync_logs_created_at ON public.uber_sync_logs(created_at DESC);

ALTER TABLE public.uber_viagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uber_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerir viagens Uber"
ON public.uber_viagens
FOR ALL
USING (is_current_user_admin() = true)
WITH CHECK (is_current_user_admin() = true);

CREATE POLICY "Admins podem ver todas as viagens Uber"
ON public.uber_viagens
FOR SELECT
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'::text));

CREATE POLICY "Admins podem ver logs Uber"
ON public.uber_sync_logs
FOR SELECT
USING (is_current_user_admin() = true);

CREATE POLICY "Sistema pode criar logs Uber"
ON public.uber_sync_logs
FOR INSERT
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_uber_viagens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_update_uber_viagens_updated_at ON public.uber_viagens;
CREATE TRIGGER trg_update_uber_viagens_updated_at
BEFORE UPDATE ON public.uber_viagens
FOR EACH ROW
EXECUTE FUNCTION public.update_uber_viagens_updated_at();