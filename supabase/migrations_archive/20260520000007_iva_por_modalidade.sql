-- ============================================================
-- IVA por modalidade (rent-a-car / TVDE) + definições da org
-- ============================================================
-- Mercado tem duas taxas de IVA: 23% rent-a-car, 6% TVDE.
-- O contrato passa a ter uma `modalidade`; a taxa de IVA é
-- derivada da modalidade + da config da organização.
--
-- 1) Tabela org_definicoes — config por org (começa com as duas
--    taxas de IVA; pensada para crescer com outras definições).
-- 2) Enum contrato_modalidade_enum + coluna `modalidade` em
--    contratos_renting e reservas.
-- ============================================================

-- ── Enum modalidade ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.contrato_modalidade_enum AS ENUM ('rent_a_car', 'tvde');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabela de definições por organização ─────────────────────
CREATE TABLE IF NOT EXISTS public.org_definicoes (
  org_id          uuid PRIMARY KEY REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  iva_rent_a_car  numeric(5, 2) NOT NULL DEFAULT 23,
  iva_tvde        numeric(5, 2) NOT NULL DEFAULT 6,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_org_def_iva_rac  CHECK (iva_rent_a_car >= 0 AND iva_rent_a_car <= 100),
  CONSTRAINT chk_org_def_iva_tvde CHECK (iva_tvde >= 0 AND iva_tvde <= 100)
);

COMMENT ON TABLE public.org_definicoes IS
  'Definições por organização (taxas de IVA, e futuramente outras). 1 linha por org.';

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_org_definicoes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_definicoes_touch ON public.org_definicoes;
CREATE TRIGGER trg_org_definicoes_touch
  BEFORE UPDATE ON public.org_definicoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_org_definicoes_updated_at();

-- Backfill: uma linha de definições por org já existente
INSERT INTO public.org_definicoes (org_id)
SELECT id FROM public.organizacoes
ON CONFLICT (org_id) DO NOTHING;

-- Trigger: cada org nova nasce com a sua linha de definições
CREATE OR REPLACE FUNCTION public.create_org_definicoes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_definicoes (org_id)
  VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizacoes_create_definicoes ON public.organizacoes;
CREATE TRIGGER trg_organizacoes_create_definicoes
  AFTER INSERT ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.create_org_definicoes();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.org_definicoes ENABLE ROW LEVEL SECURITY;

-- Qualquer utilizador da org lê as definições (o form de
-- contrato precisa das taxas para calcular o IVA).
DROP POLICY IF EXISTS "org_definicoes_select" ON public.org_definicoes;
CREATE POLICY "org_definicoes_select" ON public.org_definicoes
  FOR SELECT TO authenticated
  USING (org_id = public.get_current_org_id());

-- Só o admin da org edita as taxas.
DROP POLICY IF EXISTS "org_definicoes_update" ON public.org_definicoes;
CREATE POLICY "org_definicoes_update" ON public.org_definicoes
  FOR UPDATE TO authenticated
  USING (org_id = public.get_current_org_id() AND public.is_current_user_admin())
  WITH CHECK (org_id = public.get_current_org_id() AND public.is_current_user_admin());

-- Isolamento multi-tenant (a migration 20260520000006 é one-shot
-- e não abrange tabelas criadas depois — daí repetir aqui).
DROP POLICY IF EXISTS rls_org_isolation ON public.org_definicoes;
CREATE POLICY rls_org_isolation ON public.org_definicoes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());

-- ── Coluna modalidade em contratos e reservas ────────────────
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS modalidade public.contrato_modalidade_enum
  NOT NULL DEFAULT 'rent_a_car';

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS modalidade public.contrato_modalidade_enum
  NOT NULL DEFAULT 'rent_a_car';

COMMENT ON COLUMN public.contratos_renting.modalidade IS
  'rent_a_car ou tvde — determina a taxa de IVA aplicada (ver org_definicoes).';
