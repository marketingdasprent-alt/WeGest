-- ============================================================
-- Junção contrato_coberturas (m:n) — várias coberturas por contrato
-- ============================================================
-- O catálogo renting_coberturas (criado pelo módulo de configuração)
-- previa 1 cobertura por contrato. Este modelo passa a permitir várias,
-- espelhando o padrão de contrato_extras / contrato_taxas.
--
-- As colunas contratos_renting.cobertura_id / cobertura_nome /
-- cobertura_preco_dia / cobertura_franquia ficam sem uso (a app passa
-- a usar esta junção). Mantidas para não mexer no esquema do colega.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contrato_coberturas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  contrato_id   uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  cobertura_id  uuid NOT NULL REFERENCES public.renting_coberturas(id) ON DELETE RESTRICT,

  -- Snapshots (congelados no momento — imutabilidade fiscal)
  cobertura_nome  text NOT NULL,
  preco_dia       numeric(10, 2) NOT NULL CHECK (preco_dia >= 0),
  franquia_valor  numeric(10, 2) CHECK (franquia_valor >= 0),

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contrato_coberturas_unica UNIQUE (contrato_id, cobertura_id)
);

CREATE INDEX IF NOT EXISTS idx_contrato_coberturas_contrato
  ON public.contrato_coberturas (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_coberturas_cobertura
  ON public.contrato_coberturas (cobertura_id);
CREATE INDEX IF NOT EXISTS idx_contrato_coberturas_org
  ON public.contrato_coberturas (org_id);


-- ============================================================
-- Trigger: preencher org_id a partir do contrato
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_contrato_cobertura_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.contratos_renting WHERE id = NEW.contrato_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_coberturas_set_org_id ON public.contrato_coberturas;
CREATE TRIGGER trg_contrato_coberturas_set_org_id
  BEFORE INSERT ON public.contrato_coberturas
  FOR EACH ROW EXECUTE FUNCTION public.set_contrato_cobertura_org_id();


-- ============================================================
-- RLS — multi-tenant (mesmo padrão de contrato_extras)
-- ============================================================
ALTER TABLE public.contrato_coberturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_contrato_coberturas_select" ON public.contrato_coberturas;
DROP POLICY IF EXISTS "mt_contrato_coberturas_insert" ON public.contrato_coberturas;
DROP POLICY IF EXISTS "mt_contrato_coberturas_update" ON public.contrato_coberturas;
DROP POLICY IF EXISTS "mt_contrato_coberturas_delete" ON public.contrato_coberturas;

CREATE POLICY "mt_contrato_coberturas_select" ON public.contrato_coberturas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_contrato_coberturas_insert" ON public.contrato_coberturas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() OR org_id IS NULL);

CREATE POLICY "mt_contrato_coberturas_update" ON public.contrato_coberturas
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_contrato_coberturas_delete" ON public.contrato_coberturas
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id());

COMMENT ON TABLE public.contrato_coberturas IS
  'Coberturas associadas a um contrato (m:n). Snapshots de nome/preço/franquia congelados.';
