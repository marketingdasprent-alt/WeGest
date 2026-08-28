-- ============================================================
-- Tabela `reservas` (módulo Renting)
-- ============================================================
-- Guarda reservas de viatura por cliente, com período, estado
-- e estações de entrega/recolha. Multi-tenant via org_id.
--
-- Notas:
--   • cliente_id é uuid sem FK constraint porque a tabela
--     `clientes` ainda está a ser criada noutro branch. Quando
--     existir, adicionar a FK com:
--       ALTER TABLE public.reservas ADD CONSTRAINT reservas_cliente_fkey
--       FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);
--   • codigo é uma sequência por organização (gerado por trigger).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reservas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            integer NOT NULL,
  org_id            uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,

  -- Viatura
  matricula         text,
  viatura_id        uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  grupo             text,

  -- Estações (FK à tabela existente public.estacoes)
  estacao_entrega_id  uuid REFERENCES public.estacoes(id) ON DELETE SET NULL,
  estacao_recolha_id  uuid REFERENCES public.estacoes(id) ON DELETE SET NULL,

  -- Período
  data_inicio       timestamptz NOT NULL,
  data_fim          timestamptz NOT NULL,

  -- Cliente / condutor
  cliente_id        uuid,
  cliente_nome      text,
  condutor_id       uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  condutor_nome     text,

  -- Estado + valor
  estado            text NOT NULL DEFAULT 'pendente'
                    CHECK (estado IN ('pendente','confirmada','em_curso','concluida','cancelada','expirada')),
  valor_total       numeric(10,2),
  observacoes       text,

  -- Auditoria
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservas_periodo_valido CHECK (data_fim > data_inicio),
  CONSTRAINT reservas_codigo_org_unique UNIQUE (org_id, codigo)
);

-- Indexes para os filtros + ordenações típicas
CREATE INDEX IF NOT EXISTS idx_reservas_org_id        ON public.reservas (org_id);
CREATE INDEX IF NOT EXISTS idx_reservas_estado        ON public.reservas (org_id, estado);
CREATE INDEX IF NOT EXISTS idx_reservas_data_inicio   ON public.reservas (org_id, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_reservas_matricula        ON public.reservas (org_id, matricula);
CREATE INDEX IF NOT EXISTS idx_reservas_cliente_id       ON public.reservas (org_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_reservas_codigo           ON public.reservas (org_id, codigo);
CREATE INDEX IF NOT EXISTS idx_reservas_estacao_entrega  ON public.reservas (org_id, estacao_entrega_id);
CREATE INDEX IF NOT EXISTS idx_reservas_estacao_recolha  ON public.reservas (org_id, estacao_recolha_id);

-- ============================================================
-- Sequência de código por organização
-- ============================================================
CREATE OR REPLACE FUNCTION public.gen_reserva_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = 0 THEN
    SELECT COALESCE(MAX(codigo), 10000) + 1
      INTO NEW.codigo
      FROM public.reservas
     WHERE org_id = NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservas_codigo ON public.reservas;
CREATE TRIGGER trg_reservas_codigo
  BEFORE INSERT ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.gen_reserva_codigo();

-- ============================================================
-- updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_reservas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservas_touch_updated_at ON public.reservas;
CREATE TRIGGER trg_reservas_touch_updated_at
  BEFORE UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.touch_reservas_updated_at();

-- ============================================================
-- RLS — multi-tenant
-- ============================================================
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_reservas_select" ON public.reservas;
DROP POLICY IF EXISTS "mt_reservas_insert" ON public.reservas;
DROP POLICY IF EXISTS "mt_reservas_update" ON public.reservas;
DROP POLICY IF EXISTS "mt_reservas_delete" ON public.reservas;

CREATE POLICY "mt_reservas_select" ON public.reservas FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
  );

CREATE POLICY "mt_reservas_insert" ON public.reservas FOR INSERT TO authenticated
  WITH CHECK (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
  );

CREATE POLICY "mt_reservas_update" ON public.reservas FOR UPDATE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
  );

CREATE POLICY "mt_reservas_delete" ON public.reservas FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id() AND is_current_user_admin()
  );
