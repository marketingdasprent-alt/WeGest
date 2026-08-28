-- ============================================================
-- Tabela `contrato_condutores`
-- ============================================================
-- Liga um contrato_renting a um ou mais condutores autorizados.
-- Espelha a estrutura de `reserva_condutores`.
--
-- Regras:
--   • Todos os condutores SÃO clientes (FK obrigatória).
--   • Um cliente não pode aparecer 2x no mesmo contrato.
--   • Apenas um condutor principal por contrato.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contrato_condutores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  contrato_id   uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id)           ON DELETE RESTRICT,
  is_principal  boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contrato_condutores_contrato_cliente_unique UNIQUE (contrato_id, cliente_id)
);

-- Apenas um condutor principal por contrato
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_condutores_principal_unico
  ON public.contrato_condutores (contrato_id)
  WHERE is_principal = true;

CREATE INDEX IF NOT EXISTS idx_contrato_condutores_contrato ON public.contrato_condutores (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_condutores_cliente  ON public.contrato_condutores (cliente_id);
CREATE INDEX IF NOT EXISTS idx_contrato_condutores_org      ON public.contrato_condutores (org_id);


-- ============================================================
-- Trigger: preencher org_id automaticamente a partir do contrato
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_contrato_condutor_org_id()
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

DROP TRIGGER IF EXISTS trg_contrato_condutores_set_org_id ON public.contrato_condutores;
CREATE TRIGGER trg_contrato_condutores_set_org_id
  BEFORE INSERT ON public.contrato_condutores
  FOR EACH ROW EXECUTE FUNCTION public.set_contrato_condutor_org_id();


-- ============================================================
-- RLS — multi-tenant
-- ============================================================
ALTER TABLE public.contrato_condutores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_contrato_condutores_select" ON public.contrato_condutores;
DROP POLICY IF EXISTS "mt_contrato_condutores_insert" ON public.contrato_condutores;
DROP POLICY IF EXISTS "mt_contrato_condutores_update" ON public.contrato_condutores;
DROP POLICY IF EXISTS "mt_contrato_condutores_delete" ON public.contrato_condutores;

CREATE POLICY "mt_contrato_condutores_select" ON public.contrato_condutores
  FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_contratos'))
  );

CREATE POLICY "mt_contrato_condutores_insert" ON public.contrato_condutores
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_contratos'))
  );

CREATE POLICY "mt_contrato_condutores_update" ON public.contrato_condutores
  FOR UPDATE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_contratos'))
  );

CREATE POLICY "mt_contrato_condutores_delete" ON public.contrato_condutores
  FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_contratos'))
  );

COMMENT ON TABLE public.contrato_condutores IS
  'Condutores autorizados por contrato. Todos os condutores são clientes (FK obrigatória).';
