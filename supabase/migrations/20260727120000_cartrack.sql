-- ============================================================
-- Cartrack (rastreamento GPS de frota) — integração REST directa
-- ============================================================
-- A Cartrack é uma API REST (HTTP Basic Auth), não um robô Apify.
-- A integração vive em plataformas_configuracao com plataforma='cartrack'
-- (username/password Basic guardados em client_id/client_secret, tal como
-- as restantes plataformas — texto simples, decisão documentada).
--
-- A viatura Cartrack é ligada à viatura do WeGest pela MATRÍCULA
-- (registration → viaturas.matricula), feito no edge function cartrack-sync.
-- O odómetro da Cartrack actualiza viaturas.km_atual das viaturas com match.
--
-- Migração idempotente/aditiva. `plataforma` é texto livre — 'cartrack' não
-- exige alteração de constraint.
-- ============================================================

-- Trigger partilhado de updated_at
CREATE OR REPLACE FUNCTION public.touch_cartrack_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

-- ------------------------------------------------------------
-- cartrack_vehicles — 1 linha por viatura Cartrack (estado actual)
-- Cobre: odómetro, última posição GPS, estado (ignição/velocidade).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cartrack_vehicles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id         uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  org_id                uuid NOT NULL DEFAULT get_current_org_id(),
  cartrack_vehicle_id   text NOT NULL,
  registration          text,                 -- matrícula na Cartrack
  chassis               text,
  descricao             text,                 -- nome/modelo, se disponível
  odometer              numeric,              -- km
  last_latitude         numeric,
  last_longitude        numeric,
  last_position_at      timestamptz,
  speed                 numeric,
  ignition              boolean,
  status                text,
  viatura_id            uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  raw_data              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integracao_id, cartrack_vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_cartrack_vehicles_integracao ON public.cartrack_vehicles (integracao_id);
CREATE INDEX IF NOT EXISTS idx_cartrack_vehicles_viatura    ON public.cartrack_vehicles (viatura_id);
CREATE INDEX IF NOT EXISTS idx_cartrack_vehicles_matricula  ON public.cartrack_vehicles (org_id, registration);

DROP TRIGGER IF EXISTS trg_cartrack_vehicles_updated_at ON public.cartrack_vehicles;
CREATE TRIGGER trg_cartrack_vehicles_updated_at
  BEFORE UPDATE ON public.cartrack_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.touch_cartrack_updated_at();

-- ------------------------------------------------------------
-- cartrack_trips — histórico de viagens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cartrack_trips (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id         uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  org_id                uuid NOT NULL DEFAULT get_current_org_id(),
  trip_id               text NOT NULL,
  cartrack_vehicle_id   text,
  registration          text,
  viatura_id            uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  driver_name           text,
  start_at              timestamptz,
  end_at                timestamptz,
  start_latitude        numeric,
  start_longitude       numeric,
  end_latitude          numeric,
  end_longitude         numeric,
  distance_km           numeric,
  duration_seconds      numeric,
  max_speed             numeric,
  odometer_start        numeric,
  odometer_end          numeric,
  raw_data              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integracao_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_cartrack_trips_integracao ON public.cartrack_trips (integracao_id);
CREATE INDEX IF NOT EXISTS idx_cartrack_trips_viatura    ON public.cartrack_trips (viatura_id);
CREATE INDEX IF NOT EXISTS idx_cartrack_trips_start      ON public.cartrack_trips (start_at);

DROP TRIGGER IF EXISTS trg_cartrack_trips_updated_at ON public.cartrack_trips;
CREATE TRIGGER trg_cartrack_trips_updated_at
  BEFORE UPDATE ON public.cartrack_trips
  FOR EACH ROW EXECUTE FUNCTION public.touch_cartrack_updated_at();

-- ------------------------------------------------------------
-- cartrack_events — alertas/eventos (ignição, excesso velocidade, etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cartrack_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id         uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  org_id                uuid NOT NULL DEFAULT get_current_org_id(),
  event_id              text NOT NULL,
  cartrack_vehicle_id   text,
  registration          text,
  viatura_id            uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  event_type            text,
  description           text,
  event_at              timestamptz,
  latitude              numeric,
  longitude             numeric,
  raw_data              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integracao_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_cartrack_events_integracao ON public.cartrack_events (integracao_id);
CREATE INDEX IF NOT EXISTS idx_cartrack_events_viatura    ON public.cartrack_events (viatura_id);
CREATE INDEX IF NOT EXISTS idx_cartrack_events_at         ON public.cartrack_events (event_at);

DROP TRIGGER IF EXISTS trg_cartrack_events_updated_at ON public.cartrack_events;
CREATE TRIGGER trg_cartrack_events_updated_at
  BEFORE UPDATE ON public.cartrack_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_cartrack_updated_at();

-- ------------------------------------------------------------
-- RLS — isolamento por organização (igual às tabelas de viaturas).
-- O cartrack-sync corre como service_role (bypassa RLS) e grava org_id
-- explícito derivado da integração.
-- ------------------------------------------------------------
ALTER TABLE public.cartrack_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartrack_trips    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartrack_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_cartrack_vehicles_all" ON public.cartrack_vehicles;
CREATE POLICY "mt_cartrack_vehicles_all" ON public.cartrack_vehicles
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

DROP POLICY IF EXISTS "mt_cartrack_trips_all" ON public.cartrack_trips;
CREATE POLICY "mt_cartrack_trips_all" ON public.cartrack_trips
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

DROP POLICY IF EXISTS "mt_cartrack_events_all" ON public.cartrack_events;
CREATE POLICY "mt_cartrack_events_all" ON public.cartrack_events
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

COMMENT ON TABLE public.cartrack_vehicles IS 'Cartrack: estado actual por viatura (odómetro, última posição GPS, ignição). Ligado a viaturas por matrícula.';
COMMENT ON TABLE public.cartrack_trips    IS 'Cartrack: histórico de viagens por viatura.';
COMMENT ON TABLE public.cartrack_events   IS 'Cartrack: alertas/eventos (ignição, velocidade, etc.) por viatura.';
