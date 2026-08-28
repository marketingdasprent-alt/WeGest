-- ============================================================
-- Tabela `reserva_condutores`
-- ============================================================
-- Liga uma reserva a um ou mais condutores autorizados.
-- Regra de negócio:
--   • Todos os condutores SÃO clientes (FK obrigatória para clientes).
--   • Um cliente pode ou não ser condutor numa reserva.
--   • Um cliente não pode aparecer duas vezes na mesma reserva.
--   • Apenas um condutor principal por reserva.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reserva_condutores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  reserva_id    uuid NOT NULL REFERENCES public.reservas(id)     ON DELETE CASCADE,
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id)     ON DELETE RESTRICT,
  is_principal  boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reserva_condutores_reserva_cliente_unique UNIQUE (reserva_id, cliente_id)
);

-- Apenas um condutor principal por reserva
CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_condutores_principal_unico
  ON public.reserva_condutores (reserva_id)
  WHERE is_principal = true;

CREATE INDEX IF NOT EXISTS idx_reserva_condutores_reserva ON public.reserva_condutores (reserva_id);
CREATE INDEX IF NOT EXISTS idx_reserva_condutores_cliente ON public.reserva_condutores (cliente_id);
CREATE INDEX IF NOT EXISTS idx_reserva_condutores_org     ON public.reserva_condutores (org_id);

-- ============================================================
-- Trigger: preencher org_id automaticamente a partir da reserva
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_reserva_condutor_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.reservas WHERE id = NEW.reserva_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reserva_condutores_set_org_id ON public.reserva_condutores;
CREATE TRIGGER trg_reserva_condutores_set_org_id
  BEFORE INSERT ON public.reserva_condutores
  FOR EACH ROW EXECUTE FUNCTION public.set_reserva_condutor_org_id();

-- ============================================================
-- RLS — multi-tenant
-- ============================================================
ALTER TABLE public.reserva_condutores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_reserva_condutores_select" ON public.reserva_condutores;
DROP POLICY IF EXISTS "mt_reserva_condutores_insert" ON public.reserva_condutores;
DROP POLICY IF EXISTS "mt_reserva_condutores_update" ON public.reserva_condutores;
DROP POLICY IF EXISTS "mt_reserva_condutores_delete" ON public.reserva_condutores;

CREATE POLICY "mt_reserva_condutores_select" ON public.reserva_condutores
  FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
  );

CREATE POLICY "mt_reserva_condutores_insert" ON public.reserva_condutores
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
  );

CREATE POLICY "mt_reserva_condutores_update" ON public.reserva_condutores
  FOR UPDATE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
  );

CREATE POLICY "mt_reserva_condutores_delete" ON public.reserva_condutores
  FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
  );

COMMENT ON TABLE public.reserva_condutores IS
  'Condutores autorizados por reserva. Todos os condutores são clientes (FK obrigatória).';
