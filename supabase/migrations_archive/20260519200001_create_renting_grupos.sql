-- ============================================================
-- Tabela `renting_grupos` (grupos de viaturas para Renting)
-- ============================================================
-- Um grupo representa uma categoria de viatura (ex: "Grupo A",
-- "SUV", "Luxo"). O cliente reserva um grupo, não uma viatura
-- específica. A viatura concreta é atribuída no check-in.
--
-- Relações:
--   • viaturas.grupo_id  → qual grupo pertence a viatura
--   • reservas.grupo_id  → qual grupo foi reservado
--   • contratos_renting.grupo_id → qual grupo está no contrato
-- ============================================================

CREATE TABLE IF NOT EXISTS public.renting_grupos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,

  -- Identificação
  nome        text NOT NULL,
  codigo      text NOT NULL,           -- ex: "A", "B", "SUV", "LUX"
  descricao   text,
  imagem_url  text,

  -- Estado
  ativo       boolean NOT NULL DEFAULT true,

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT renting_grupos_codigo_org_unique UNIQUE (org_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_renting_grupos_org   ON public.renting_grupos (org_id);
CREATE INDEX IF NOT EXISTS idx_renting_grupos_ativo ON public.renting_grupos (org_id, ativo);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_renting_grupos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renting_grupos_updated_at ON public.renting_grupos;
CREATE TRIGGER trg_renting_grupos_updated_at
  BEFORE UPDATE ON public.renting_grupos
  FOR EACH ROW EXECUTE FUNCTION public.touch_renting_grupos_updated_at();

-- ============================================================
-- RLS — multi-tenant
-- ============================================================
ALTER TABLE public.renting_grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_renting_grupos_select" ON public.renting_grupos;
DROP POLICY IF EXISTS "mt_renting_grupos_insert" ON public.renting_grupos;
DROP POLICY IF EXISTS "mt_renting_grupos_update" ON public.renting_grupos;
DROP POLICY IF EXISTS "mt_renting_grupos_delete" ON public.renting_grupos;

CREATE POLICY "mt_renting_grupos_select" ON public.renting_grupos
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_renting_grupos_insert" ON public.renting_grupos
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

CREATE POLICY "mt_renting_grupos_update" ON public.renting_grupos
  FOR UPDATE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

CREATE POLICY "mt_renting_grupos_delete" ON public.renting_grupos
  FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

-- ============================================================
-- Ligar viaturas, reservas e contratos_renting ao grupo
-- ============================================================

-- Viaturas: qual grupo pertence esta viatura
ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.renting_grupos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viaturas_grupo_id ON public.viaturas (grupo_id);

-- Reservas: grupo reservado (FK) + snapshot do nome
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS grupo_id   uuid REFERENCES public.renting_grupos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grupo_nome text; -- snapshot imutável do nome do grupo

CREATE INDEX IF NOT EXISTS idx_reservas_grupo_id ON public.reservas (grupo_id);

-- Contratos renting: grupo (FK) + snapshot do nome
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS grupo_id   uuid REFERENCES public.renting_grupos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grupo_nome text; -- snapshot imutável do nome do grupo

CREATE INDEX IF NOT EXISTS idx_contratos_renting_grupo_id ON public.contratos_renting (grupo_id);

-- ============================================================
-- Comentários
-- ============================================================
COMMENT ON TABLE public.renting_grupos IS
  'Grupos de viaturas para Renting. O cliente reserva um grupo; a viatura concreta é atribuída no check-in.';
COMMENT ON COLUMN public.renting_grupos.codigo IS
  'Código curto do grupo (ex: A, B, SUV, LUX). Único por organização.';
COMMENT ON COLUMN public.reservas.grupo_id IS
  'Grupo de viatura reservado. FK para renting_grupos.';
COMMENT ON COLUMN public.reservas.grupo_nome IS
  'Snapshot do nome do grupo no momento da reserva — não muda se o grupo for renomeado.';
COMMENT ON COLUMN public.contratos_renting.grupo_id IS
  'Grupo de viatura do contrato. FK para renting_grupos.';
COMMENT ON COLUMN public.contratos_renting.grupo_nome IS
  'Snapshot do nome do grupo no momento do contrato — imutável para efeitos fiscais.';
