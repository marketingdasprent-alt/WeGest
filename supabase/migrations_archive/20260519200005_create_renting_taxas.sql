-- ============================================================
-- Tabelas `renting_taxas` + `reserva_taxas` + `contrato_taxas`
-- ============================================================
-- renting_taxas   — catálogo de taxas (IVA, taxa aeroporto, etc.)
-- reserva_taxas   — taxas aplicadas a uma reserva (com snapshots)
-- contrato_taxas  — taxas aplicadas a um contrato (com snapshots)
--
-- Nota: contratos_renting já tem taxa_iva (numeric) como campo
-- legado. O novo sistema usa contrato_taxas para detalhe completo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.renting_taxas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,

  -- Identificação
  nome        text NOT NULL,    -- ex: "IVA 23%", "Taxa Aeroporto", "Ecotaxa"
  descricao   text,

  -- Valor
  percentagem     numeric(5,2)  CHECK (percentagem >= 0 AND percentagem <= 100),
  valor_fixo      numeric(10,2) CHECK (valor_fixo >= 0),
  -- Exactamente um dos dois deve estar preenchido
  CONSTRAINT renting_taxas_valor_xor CHECK (
    (percentagem IS NOT NULL AND valor_fixo IS NULL)
    OR
    (percentagem IS NULL AND valor_fixo IS NOT NULL)
  ),

  -- Comportamento
  aplicar_automaticamente  boolean NOT NULL DEFAULT false,
  -- Se true, é adicionada automaticamente a novas reservas/contratos

  -- Estado
  ativa       boolean NOT NULL DEFAULT true,

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renting_taxas_org   ON public.renting_taxas (org_id);
CREATE INDEX IF NOT EXISTS idx_renting_taxas_ativa ON public.renting_taxas (org_id, ativa);
CREATE INDEX IF NOT EXISTS idx_renting_taxas_auto  ON public.renting_taxas (org_id, aplicar_automaticamente) WHERE aplicar_automaticamente = true;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_renting_taxas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renting_taxas_updated_at ON public.renting_taxas;
CREATE TRIGGER trg_renting_taxas_updated_at
  BEFORE UPDATE ON public.renting_taxas
  FOR EACH ROW EXECUTE FUNCTION public.touch_renting_taxas_updated_at();

-- ============================================================
-- RLS — renting_taxas
-- ============================================================
ALTER TABLE public.renting_taxas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_renting_taxas_select" ON public.renting_taxas;
DROP POLICY IF EXISTS "mt_renting_taxas_insert" ON public.renting_taxas;
DROP POLICY IF EXISTS "mt_renting_taxas_update" ON public.renting_taxas;
DROP POLICY IF EXISTS "mt_renting_taxas_delete" ON public.renting_taxas;

CREATE POLICY "mt_renting_taxas_select" ON public.renting_taxas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_renting_taxas_insert" ON public.renting_taxas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

CREATE POLICY "mt_renting_taxas_update" ON public.renting_taxas
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

CREATE POLICY "mt_renting_taxas_delete" ON public.renting_taxas
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- ============================================================
-- Tabela de associação: reserva_taxas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reserva_taxas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  reserva_id      uuid NOT NULL REFERENCES public.reservas(id) ON DELETE CASCADE,
  taxa_id         uuid NOT NULL REFERENCES public.renting_taxas(id) ON DELETE RESTRICT,

  -- Snapshots (imutáveis após criação)
  taxa_nome           text NOT NULL,
  percentagem         numeric(5,2),
  valor_fixo          numeric(10,2),

  -- Base de cálculo e valor final
  base_calculo        numeric(10,2),  -- valor sobre o qual a % foi aplicada
  valor_calculado     numeric(10,2) NOT NULL CHECK (valor_calculado >= 0),

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reserva_taxas_reserva_taxa_unique UNIQUE (reserva_id, taxa_id)
);

CREATE INDEX IF NOT EXISTS idx_reserva_taxas_reserva ON public.reserva_taxas (reserva_id);
CREATE INDEX IF NOT EXISTS idx_reserva_taxas_org     ON public.reserva_taxas (org_id);

-- Trigger: preencher org_id a partir da reserva
CREATE OR REPLACE FUNCTION public.set_reserva_taxa_org_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.reservas WHERE id = NEW.reserva_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reserva_taxas_set_org_id ON public.reserva_taxas;
CREATE TRIGGER trg_reserva_taxas_set_org_id
  BEFORE INSERT ON public.reserva_taxas
  FOR EACH ROW EXECUTE FUNCTION public.set_reserva_taxa_org_id();

-- RLS — reserva_taxas
ALTER TABLE public.reserva_taxas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_reserva_taxas_select" ON public.reserva_taxas;
DROP POLICY IF EXISTS "mt_reserva_taxas_insert" ON public.reserva_taxas;
DROP POLICY IF EXISTS "mt_reserva_taxas_update" ON public.reserva_taxas;
DROP POLICY IF EXISTS "mt_reserva_taxas_delete" ON public.reserva_taxas;

CREATE POLICY "mt_reserva_taxas_select" ON public.reserva_taxas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

CREATE POLICY "mt_reserva_taxas_insert" ON public.reserva_taxas
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_reservas_access()
  );

CREATE POLICY "mt_reserva_taxas_update" ON public.reserva_taxas
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

CREATE POLICY "mt_reserva_taxas_delete" ON public.reserva_taxas
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

-- ============================================================
-- Tabela de associação: contrato_taxas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contrato_taxas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  contrato_id     uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  taxa_id         uuid NOT NULL REFERENCES public.renting_taxas(id) ON DELETE RESTRICT,

  -- Snapshots
  taxa_nome           text NOT NULL,
  percentagem         numeric(5,2),
  valor_fixo          numeric(10,2),
  base_calculo        numeric(10,2),
  valor_calculado     numeric(10,2) NOT NULL CHECK (valor_calculado >= 0),

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contrato_taxas_contrato_taxa_unique UNIQUE (contrato_id, taxa_id)
);

CREATE INDEX IF NOT EXISTS idx_contrato_taxas_contrato ON public.contrato_taxas (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_taxas_org      ON public.contrato_taxas (org_id);

-- RLS — contrato_taxas
ALTER TABLE public.contrato_taxas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_contrato_taxas_select" ON public.contrato_taxas;
DROP POLICY IF EXISTS "mt_contrato_taxas_insert" ON public.contrato_taxas;
DROP POLICY IF EXISTS "mt_contrato_taxas_update" ON public.contrato_taxas;
DROP POLICY IF EXISTS "mt_contrato_taxas_delete" ON public.contrato_taxas;

CREATE POLICY "mt_contrato_taxas_select" ON public.contrato_taxas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_contrato_taxas_insert" ON public.contrato_taxas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() OR org_id IS NULL);

CREATE POLICY "mt_contrato_taxas_update" ON public.contrato_taxas
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_contrato_taxas_delete" ON public.contrato_taxas
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id());

COMMENT ON TABLE public.renting_taxas IS
  'Catálogo de taxas aplicáveis em alugueres (IVA, taxa aeroporto, ecotaxa, etc.).';
COMMENT ON COLUMN public.renting_taxas.percentagem IS
  'Percentagem da taxa (0-100). Mutuamente exclusivo com valor_fixo.';
COMMENT ON COLUMN public.renting_taxas.valor_fixo IS
  'Valor fixo em €. Mutuamente exclusivo com percentagem.';
COMMENT ON COLUMN public.renting_taxas.aplicar_automaticamente IS
  'Se true, é adicionada automaticamente a novas reservas e contratos.';
COMMENT ON TABLE public.reserva_taxas IS
  'Taxas aplicadas por reserva. Valores são snapshots imutáveis.';
COMMENT ON TABLE public.contrato_taxas IS
  'Taxas aplicadas por contrato. Valores são snapshots imutáveis.';
