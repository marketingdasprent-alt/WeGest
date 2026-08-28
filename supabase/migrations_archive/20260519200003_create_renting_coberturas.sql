-- ============================================================
-- Tabela `renting_coberturas` (seguros/coberturas de aluguer)
-- ============================================================
-- Catálogo de coberturas disponíveis por organização.
-- A cobertura escolhida é registada na reserva/contrato
-- com snapshot do preço e franquia para imutabilidade fiscal.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.renting_coberturas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,

  -- Identificação
  nome        text NOT NULL,    -- ex: "Básica", "Completa", "Premium"
  descricao   text,

  -- Preço e franquia
  preco_dia       numeric(10,2) NOT NULL CHECK (preco_dia >= 0),
  franquia_valor  numeric(10,2)          CHECK (franquia_valor >= 0), -- NULL = sem franquia

  -- Estado
  ativa       boolean NOT NULL DEFAULT true,

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renting_coberturas_org   ON public.renting_coberturas (org_id);
CREATE INDEX IF NOT EXISTS idx_renting_coberturas_ativa ON public.renting_coberturas (org_id, ativa);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_renting_coberturas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renting_coberturas_updated_at ON public.renting_coberturas;
CREATE TRIGGER trg_renting_coberturas_updated_at
  BEFORE UPDATE ON public.renting_coberturas
  FOR EACH ROW EXECUTE FUNCTION public.touch_renting_coberturas_updated_at();

-- ============================================================
-- RLS — multi-tenant
-- ============================================================
ALTER TABLE public.renting_coberturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_renting_coberturas_select" ON public.renting_coberturas;
DROP POLICY IF EXISTS "mt_renting_coberturas_insert" ON public.renting_coberturas;
DROP POLICY IF EXISTS "mt_renting_coberturas_update" ON public.renting_coberturas;
DROP POLICY IF EXISTS "mt_renting_coberturas_delete" ON public.renting_coberturas;

CREATE POLICY "mt_renting_coberturas_select" ON public.renting_coberturas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_renting_coberturas_insert" ON public.renting_coberturas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

CREATE POLICY "mt_renting_coberturas_update" ON public.renting_coberturas
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

CREATE POLICY "mt_renting_coberturas_delete" ON public.renting_coberturas
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- ============================================================
-- Adicionar cobertura a reservas e contratos (com snapshots)
-- ============================================================
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS cobertura_id          uuid REFERENCES public.renting_coberturas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cobertura_nome        text,           -- snapshot do nome
  ADD COLUMN IF NOT EXISTS cobertura_preco_dia   numeric(10,2),  -- snapshot do preço/dia
  ADD COLUMN IF NOT EXISTS cobertura_franquia    numeric(10,2);  -- snapshot da franquia

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS cobertura_id          uuid REFERENCES public.renting_coberturas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cobertura_nome        text,           -- snapshot do nome
  ADD COLUMN IF NOT EXISTS cobertura_preco_dia   numeric(10,2),  -- snapshot do preço/dia
  ADD COLUMN IF NOT EXISTS cobertura_franquia    numeric(10,2);  -- snapshot da franquia

COMMENT ON TABLE public.renting_coberturas IS
  'Coberturas/seguros disponíveis no catálogo de renting. Uma por reserva/contrato.';
COMMENT ON COLUMN public.renting_coberturas.franquia_valor IS
  'Valor da franquia (€). NULL = sem franquia incluída.';
