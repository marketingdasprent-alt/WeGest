-- ============================================================
-- Tabelas `renting_extras` + `reserva_extras`
-- ============================================================
-- renting_extras  — catálogo de extras disponíveis (GPS, cadeirinha, etc.)
-- reserva_extras  — extras escolhidos por reserva, com snapshot de preços
-- contratos_renting_extras — idem para contratos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.renting_extras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,

  -- Identificação
  nome        text NOT NULL,    -- ex: "GPS", "Cadeirinha", "Condutor adicional"
  descricao   text,

  -- Preço
  preco_unidade   numeric(10,2) NOT NULL CHECK (preco_unidade >= 0),
  tipo_calculo    text NOT NULL DEFAULT 'dia'
                  CHECK (tipo_calculo IN ('dia', 'fixo')),
                  -- 'dia'  = preço × nº de dias
                  -- 'fixo' = preço único independente da duração

  -- Quantidades
  quantidade_maxima  integer CHECK (quantidade_maxima > 0), -- NULL = sem limite

  -- Estado
  ativo       boolean NOT NULL DEFAULT true,

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renting_extras_org   ON public.renting_extras (org_id);
CREATE INDEX IF NOT EXISTS idx_renting_extras_ativo ON public.renting_extras (org_id, ativo);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_renting_extras_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renting_extras_updated_at ON public.renting_extras;
CREATE TRIGGER trg_renting_extras_updated_at
  BEFORE UPDATE ON public.renting_extras
  FOR EACH ROW EXECUTE FUNCTION public.touch_renting_extras_updated_at();

-- ============================================================
-- RLS — renting_extras
-- ============================================================
ALTER TABLE public.renting_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_renting_extras_select" ON public.renting_extras;
DROP POLICY IF EXISTS "mt_renting_extras_insert" ON public.renting_extras;
DROP POLICY IF EXISTS "mt_renting_extras_update" ON public.renting_extras;
DROP POLICY IF EXISTS "mt_renting_extras_delete" ON public.renting_extras;

CREATE POLICY "mt_renting_extras_select" ON public.renting_extras
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_renting_extras_insert" ON public.renting_extras
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

CREATE POLICY "mt_renting_extras_update" ON public.renting_extras
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

CREATE POLICY "mt_renting_extras_delete" ON public.renting_extras
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- ============================================================
-- Tabela de associação: reserva_extras
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reserva_extras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  reserva_id      uuid NOT NULL REFERENCES public.reservas(id) ON DELETE CASCADE,
  extra_id        uuid NOT NULL REFERENCES public.renting_extras(id) ON DELETE RESTRICT,

  -- Snapshots (imutáveis após criação)
  extra_nome          text NOT NULL,         -- snapshot do nome
  preco_unidade       numeric(10,2) NOT NULL, -- snapshot do preço
  tipo_calculo        text NOT NULL,          -- snapshot do tipo (dia/fixo)

  -- Quantidades e totais
  quantidade          integer NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  total               numeric(10,2) NOT NULL CHECK (total >= 0),

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reserva_extras_reserva_extra_unique UNIQUE (reserva_id, extra_id)
);

CREATE INDEX IF NOT EXISTS idx_reserva_extras_reserva ON public.reserva_extras (reserva_id);
CREATE INDEX IF NOT EXISTS idx_reserva_extras_org     ON public.reserva_extras (org_id);

-- Trigger: preencher org_id a partir da reserva
CREATE OR REPLACE FUNCTION public.set_reserva_extra_org_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.reservas WHERE id = NEW.reserva_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reserva_extras_set_org_id ON public.reserva_extras;
CREATE TRIGGER trg_reserva_extras_set_org_id
  BEFORE INSERT ON public.reserva_extras
  FOR EACH ROW EXECUTE FUNCTION public.set_reserva_extra_org_id();

-- RLS — reserva_extras
ALTER TABLE public.reserva_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_reserva_extras_select" ON public.reserva_extras;
DROP POLICY IF EXISTS "mt_reserva_extras_insert" ON public.reserva_extras;
DROP POLICY IF EXISTS "mt_reserva_extras_update" ON public.reserva_extras;
DROP POLICY IF EXISTS "mt_reserva_extras_delete" ON public.reserva_extras;

CREATE POLICY "mt_reserva_extras_select" ON public.reserva_extras
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

CREATE POLICY "mt_reserva_extras_insert" ON public.reserva_extras
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_reservas_access()
  );

CREATE POLICY "mt_reserva_extras_update" ON public.reserva_extras
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

CREATE POLICY "mt_reserva_extras_delete" ON public.reserva_extras
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

-- ============================================================
-- Tabela de associação: contrato_extras
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contrato_extras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  contrato_id     uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  extra_id        uuid NOT NULL REFERENCES public.renting_extras(id) ON DELETE RESTRICT,

  -- Snapshots
  extra_nome          text NOT NULL,
  preco_unidade       numeric(10,2) NOT NULL,
  tipo_calculo        text NOT NULL,

  -- Quantidades e totais
  quantidade          integer NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  total               numeric(10,2) NOT NULL CHECK (total >= 0),

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contrato_extras_contrato_extra_unique UNIQUE (contrato_id, extra_id)
);

CREATE INDEX IF NOT EXISTS idx_contrato_extras_contrato ON public.contrato_extras (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_extras_org      ON public.contrato_extras (org_id);

-- RLS — contrato_extras
ALTER TABLE public.contrato_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_contrato_extras_select" ON public.contrato_extras;
DROP POLICY IF EXISTS "mt_contrato_extras_insert" ON public.contrato_extras;
DROP POLICY IF EXISTS "mt_contrato_extras_update" ON public.contrato_extras;
DROP POLICY IF EXISTS "mt_contrato_extras_delete" ON public.contrato_extras;

CREATE POLICY "mt_contrato_extras_select" ON public.contrato_extras
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_contrato_extras_insert" ON public.contrato_extras
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() OR org_id IS NULL);

CREATE POLICY "mt_contrato_extras_update" ON public.contrato_extras
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_contrato_extras_delete" ON public.contrato_extras
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id());

COMMENT ON TABLE public.renting_extras IS
  'Catálogo de extras disponíveis para aluguer (GPS, cadeirinha, etc.).';
COMMENT ON COLUMN public.renting_extras.tipo_calculo IS
  'dia = preço × nº de dias; fixo = preço único independente da duração.';
COMMENT ON TABLE public.reserva_extras IS
  'Extras escolhidos por reserva. Preços são snapshots imutáveis.';
COMMENT ON TABLE public.contrato_extras IS
  'Extras escolhidos por contrato. Preços são snapshots imutáveis.';
