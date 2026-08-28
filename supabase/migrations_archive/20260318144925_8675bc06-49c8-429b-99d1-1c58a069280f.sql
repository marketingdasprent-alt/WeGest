
CREATE TABLE public.uber_viagens_detalhadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID NOT NULL REFERENCES plataformas_configuracao(id),
  uber_driver_id TEXT,
  driver_name TEXT,
  trip_date TIMESTAMPTZ,
  pickup_time TIMESTAMPTZ,
  dropoff_time TIMESTAMPTZ,
  pickup_address TEXT,
  dropoff_address TEXT,
  duration_minutes NUMERIC,
  distance_km NUMERIC,
  fare_amount NUMERIC,
  status TEXT,
  trip_type TEXT,
  raw_row JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.uber_viagens_detalhadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerir viagens detalhadas Uber"
ON public.uber_viagens_detalhadas
FOR ALL
TO public
USING (is_current_user_admin())
WITH CHECK (is_current_user_admin());

CREATE POLICY "Gestores podem ver viagens detalhadas Uber"
ON public.uber_viagens_detalhadas
FOR SELECT
TO public
USING (has_permission(auth.uid(), 'motoristas_gestao'));

CREATE INDEX idx_uber_viagens_detalhadas_integracao ON public.uber_viagens_detalhadas(integracao_id);
CREATE INDEX idx_uber_viagens_detalhadas_driver ON public.uber_viagens_detalhadas(uber_driver_id);
CREATE INDEX idx_uber_viagens_detalhadas_trip_date ON public.uber_viagens_detalhadas(trip_date);
