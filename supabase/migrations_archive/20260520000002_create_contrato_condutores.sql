-- ============================================================
-- M2 — contrato_condutores COM VIGÊNCIA
-- ============================================================
-- NOTA: em produção esta tabela já existe na versão simples
-- (id, org_id, contrato_id, cliente_id, is_principal, created_at),
-- criada por outro branch. Esta migration é IDEMPOTENTE e NÃO
-- DESTRUTIVA: cria a tabela se faltar (BD limpa) e ACRESCENTA as
-- colunas/constraints de vigência se já existir — essencial para
-- trocar de condutor sem cancelar o contrato.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Cria a tabela base se ainda não existir (BD limpa)
CREATE TABLE IF NOT EXISTS public.contrato_condutores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id)        ON DELETE CASCADE,
  contrato_id   uuid NOT NULL REFERENCES public.contratos_renting(id)   ON DELETE CASCADE,
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id)            ON DELETE RESTRICT,
  is_principal  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Garante as colunas de vigência (caso a tabela já existisse na versão simples)
ALTER TABLE public.contrato_condutores
  ADD COLUMN IF NOT EXISTS data_inicio timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS data_fim    timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_fim  text,
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- 3. Coluna gerada `vigencia` (ALTER separado — depende de data_inicio/data_fim já existirem)
ALTER TABLE public.contrato_condutores
  ADD COLUMN IF NOT EXISTS vigencia tstzrange
    GENERATED ALWAYS AS (tstzrange(data_inicio, data_fim, '[)')) STORED;

-- 4. CHECK de vigência
ALTER TABLE public.contrato_condutores
  DROP CONSTRAINT IF EXISTS chk_contrato_condutores_vigencia;
ALTER TABLE public.contrato_condutores
  ADD CONSTRAINT chk_contrato_condutores_vigencia
  CHECK (data_fim IS NULL OR data_fim > data_inicio);

-- 5. EXCLUDE: mesmo condutor não pode ter vigências sobrepostas no mesmo contrato
ALTER TABLE public.contrato_condutores
  DROP CONSTRAINT IF EXISTS contrato_condutores_sem_sobreposicao;
ALTER TABLE public.contrato_condutores
  ADD CONSTRAINT contrato_condutores_sem_sobreposicao
  EXCLUDE USING gist (contrato_id WITH =, cliente_id WITH =, vigencia WITH &&);

-- 6. EXCLUDE: apenas um condutor principal em cada momento
ALTER TABLE public.contrato_condutores
  DROP CONSTRAINT IF EXISTS contrato_condutores_um_principal;
ALTER TABLE public.contrato_condutores
  ADD CONSTRAINT contrato_condutores_um_principal
  EXCLUDE USING gist (contrato_id WITH =, vigencia WITH &&)
  WHERE (is_principal = true);

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_contrato_condutores_contrato ON public.contrato_condutores (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_condutores_cliente  ON public.contrato_condutores (cliente_id);
CREATE INDEX IF NOT EXISTS idx_contrato_condutores_org      ON public.contrato_condutores (org_id);
CREATE INDEX IF NOT EXISTS idx_contrato_condutores_vigentes
  ON public.contrato_condutores (contrato_id) WHERE data_fim IS NULL;

-- 8. Trigger: preencher org_id a partir do contrato
CREATE OR REPLACE FUNCTION public.set_contrato_condutor_org_id()
RETURNS trigger LANGUAGE plpgsql AS $$
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

-- 9. Trigger: updated_at
CREATE OR REPLACE FUNCTION public.touch_contrato_condutores_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_condutores_updated_at ON public.contrato_condutores;
CREATE TRIGGER trg_contrato_condutores_updated_at
  BEFORE UPDATE ON public.contrato_condutores
  FOR EACH ROW EXECUTE FUNCTION public.touch_contrato_condutores_updated_at();

-- 10. RLS — multi-tenant + acesso a contratos renting
ALTER TABLE public.contrato_condutores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_contrato_condutores_select" ON public.contrato_condutores;
DROP POLICY IF EXISTS "mt_contrato_condutores_insert" ON public.contrato_condutores;
DROP POLICY IF EXISTS "mt_contrato_condutores_update" ON public.contrato_condutores;
DROP POLICY IF EXISTS "mt_contrato_condutores_delete" ON public.contrato_condutores;

CREATE POLICY "mt_contrato_condutores_select" ON public.contrato_condutores
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

CREATE POLICY "mt_contrato_condutores_insert" ON public.contrato_condutores
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_contratos_access()
  );

CREATE POLICY "mt_contrato_condutores_update" ON public.contrato_condutores
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

CREATE POLICY "mt_contrato_condutores_delete" ON public.contrato_condutores
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

COMMENT ON TABLE public.contrato_condutores IS
  'Condutores autorizados por contrato, com vigência. Permite trocar condutor '
  'sem cancelar o contrato e imputar danos a quem conduzia na data do facto.';
COMMENT ON COLUMN public.contrato_condutores.data_fim IS
  'Fim da vigência do condutor. NULL = ainda vigente. Preenchido ao trocar de condutor.';
COMMENT ON COLUMN public.contrato_condutores.vigencia IS
  'Coluna GENERATED — NÃO escrever manualmente. Base dos EXCLUDE de sobreposição.';
