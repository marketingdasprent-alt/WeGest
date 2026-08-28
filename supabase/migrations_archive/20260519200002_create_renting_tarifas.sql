-- ============================================================
-- Tabela `renting_tarifas` (tarifas de aluguer por grupo)
-- ============================================================
-- Cada tarifa está associada a um grupo de viaturas e define
-- os preços por período. Suporta sazonalidade via valido_de/ate.
--
-- Snapshots nas tabelas dependentes:
--   • reservas.tarifa_id + tarifa_nome + tarifa_preco_dia
--   • contratos_renting.tarifa_id + tarifa_nome
--     (tarifa_diaria já existe e mantém o valor snapshot)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.renting_tarifas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  grupo_id    uuid NOT NULL REFERENCES public.renting_grupos(id) ON DELETE CASCADE,

  -- Identificação
  nome        text NOT NULL,    -- ex: "Tarifa Verão 2025", "Tarifa Standard"

  -- Preços por período (todos em €)
  preco_dia           numeric(10,2) NOT NULL CHECK (preco_dia >= 0),
  preco_fim_semana    numeric(10,2)          CHECK (preco_fim_semana >= 0),  -- preço/dia ao fim de semana
  preco_semana        numeric(10,2)          CHECK (preco_semana >= 0),      -- semana completa (7 dias)
  preco_mes           numeric(10,2)          CHECK (preco_mes >= 0),         -- mês completo (30 dias)

  -- Quilómetros
  kms_incluidos       integer                CHECK (kms_incluidos >= 0),     -- NULL = ilimitado
  km_adicional_valor  numeric(10,4)          CHECK (km_adicional_valor >= 0),

  -- Sazonalidade (NULL = sempre válida)
  valido_de   date,
  valido_ate  date,

  -- Estado
  ativa       boolean NOT NULL DEFAULT true,

  -- Auditoria
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT renting_tarifas_periodo_valido
    CHECK (valido_de IS NULL OR valido_ate IS NULL OR valido_ate >= valido_de)
);

CREATE INDEX IF NOT EXISTS idx_renting_tarifas_org      ON public.renting_tarifas (org_id);
CREATE INDEX IF NOT EXISTS idx_renting_tarifas_grupo    ON public.renting_tarifas (grupo_id);
CREATE INDEX IF NOT EXISTS idx_renting_tarifas_ativa    ON public.renting_tarifas (org_id, ativa);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_renting_tarifas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renting_tarifas_updated_at ON public.renting_tarifas;
CREATE TRIGGER trg_renting_tarifas_updated_at
  BEFORE UPDATE ON public.renting_tarifas
  FOR EACH ROW EXECUTE FUNCTION public.touch_renting_tarifas_updated_at();

-- ============================================================
-- RLS — multi-tenant
-- ============================================================
ALTER TABLE public.renting_tarifas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_renting_tarifas_select" ON public.renting_tarifas;
DROP POLICY IF EXISTS "mt_renting_tarifas_insert" ON public.renting_tarifas;
DROP POLICY IF EXISTS "mt_renting_tarifas_update" ON public.renting_tarifas;
DROP POLICY IF EXISTS "mt_renting_tarifas_delete" ON public.renting_tarifas;

CREATE POLICY "mt_renting_tarifas_select" ON public.renting_tarifas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_renting_tarifas_insert" ON public.renting_tarifas
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

CREATE POLICY "mt_renting_tarifas_update" ON public.renting_tarifas
  FOR UPDATE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

CREATE POLICY "mt_renting_tarifas_delete" ON public.renting_tarifas
  FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

-- ============================================================
-- Ligar reservas e contratos_renting à tarifa
-- ============================================================

-- Reservas: qual tarifa foi usada + snapshots
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS tarifa_id         uuid REFERENCES public.renting_tarifas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tarifa_nome       text,          -- snapshot do nome
  ADD COLUMN IF NOT EXISTS tarifa_preco_dia  numeric(10,2); -- snapshot do preço/dia

CREATE INDEX IF NOT EXISTS idx_reservas_tarifa_id ON public.reservas (tarifa_id);

-- Contratos renting: tarifa (FK) + snapshot do nome
-- (tarifa_diaria já existe e guarda o valor snapshot — mantemos)
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS tarifa_id   uuid REFERENCES public.renting_tarifas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tarifa_nome text; -- snapshot do nome da tarifa

CREATE INDEX IF NOT EXISTS idx_contratos_renting_tarifa_id ON public.contratos_renting (tarifa_id);

-- ============================================================
-- Comentários
-- ============================================================
COMMENT ON TABLE public.renting_tarifas IS
  'Tarifas de aluguer por grupo de viatura. Suporta sazonalidade via valido_de/valido_ate.';
COMMENT ON COLUMN public.renting_tarifas.preco_dia IS
  'Preço base por dia (€). Obrigatório.';
COMMENT ON COLUMN public.renting_tarifas.preco_fim_semana IS
  'Preço por dia aplicado ao fim de semana. NULL = usa preco_dia.';
COMMENT ON COLUMN public.renting_tarifas.preco_semana IS
  'Preço por semana completa (7 dias). NULL = 7 × preco_dia.';
COMMENT ON COLUMN public.renting_tarifas.preco_mes IS
  'Preço por mês completo (30 dias). NULL = 30 × preco_dia.';
COMMENT ON COLUMN public.renting_tarifas.kms_incluidos IS
  'Km incluídos no aluguer. NULL = ilimitado.';
COMMENT ON COLUMN public.renting_tarifas.valido_de IS
  'Início do período de validade (sazonalidade). NULL = sem limite de início.';
COMMENT ON COLUMN public.renting_tarifas.valido_ate IS
  'Fim do período de validade (sazonalidade). NULL = sem limite de fim.';
COMMENT ON COLUMN public.reservas.tarifa_id IS
  'Tarifa aplicada na reserva. FK para renting_tarifas.';
COMMENT ON COLUMN public.reservas.tarifa_nome IS
  'Snapshot do nome da tarifa no momento da reserva.';
COMMENT ON COLUMN public.reservas.tarifa_preco_dia IS
  'Snapshot do preço/dia da tarifa no momento da reserva.';
COMMENT ON COLUMN public.contratos_renting.tarifa_id IS
  'Tarifa aplicada no contrato. FK para renting_tarifas.';
COMMENT ON COLUMN public.contratos_renting.tarifa_nome IS
  'Snapshot do nome da tarifa no momento do contrato — imutável para efeitos fiscais.';
