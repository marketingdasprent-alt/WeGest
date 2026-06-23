-- ============================================================
-- M3 — Tabela `contrato_cobrancas` (linhas de faturação por período)
-- ============================================================
-- Cada linha = UM período a cobrar de um contrato.
-- É a peça que arruma os fluxos de dinheiro do Renting/TVDE:
--   • rent_a_car → 1 linha (o aluguer todo)
--   • tvde       → 1 linha por semana (geradas pelo job — M5)
--
-- Decisões de negócio (ver desenho Renting/TVDE):
--   • O destinatário é escolhido A CADA PERÍODO — pode ser o
--     cliente/titular OU um condutor. Ambos são clientes.
--   • `emite_fatura_fiscal`: true  → gera fatura fiscal (Primavera)
--                            false → cobrança interna (motorista
--                                    "paga a semana" sem fatura)
--   • Cada linha é um débito na conta-corrente do destinatário.
--   • Valores congelam após emissão (imutabilidade SAF-T).
-- ============================================================

-- Estado da cobrança
DO $$ BEGIN
  CREATE TYPE public.cobranca_estado_enum AS ENUM (
    'pendente',   -- criada, ainda não emitida
    'emitida',    -- fatura/recibo emitido (valores congelados)
    'paga',       -- liquidada
    'anulada'     -- cancelada
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.contrato_cobrancas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizacoes(id)      ON DELETE CASCADE,
  contrato_id        uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,

  -- Período a cobrar
  periodo_de         date NOT NULL,
  periodo_ate        date NOT NULL,
  descricao          text,            -- ex: "Semana 12–18 mai 2026"

  -- Destinatário — escolhido por período (cliente OU condutor)
  destinatario_id      uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  destinatario_papel   text NOT NULL CHECK (destinatario_papel IN ('cliente', 'condutor')),
  destinatario_nome    text NOT NULL,  -- snapshot imutável
  contrato_condutor_id uuid REFERENCES public.contrato_condutores(id) ON DELETE SET NULL,
                       -- preenchido quando papel = 'condutor' (liga à vigência)

  -- Tarifa de origem (snapshot)
  tarifa_id          uuid REFERENCES public.renting_tarifas(id) ON DELETE SET NULL,
  tarifa_nome        text,

  -- Valores — congelados após emissão
  valor_sem_iva      numeric(10,2) NOT NULL CHECK (valor_sem_iva >= 0),
  taxa_iva           numeric(5,2)  NOT NULL DEFAULT 23 CHECK (taxa_iva >= 0 AND taxa_iva <= 100),
  valor_iva          numeric(10,2) GENERATED ALWAYS AS (
                       round(valor_sem_iva * taxa_iva / 100, 2)
                     ) STORED,
  valor_total        numeric(10,2) GENERATED ALWAYS AS (
                       valor_sem_iva + round(valor_sem_iva * taxa_iva / 100, 2)
                     ) STORED,

  -- Faturação
  emite_fatura_fiscal    boolean NOT NULL DEFAULT true,
  estado                 public.cobranca_estado_enum NOT NULL DEFAULT 'pendente',
  emitida_em             timestamptz,
  documento_externo_ref  text,        -- nº da fatura/recibo no Primavera
  pago_em                timestamptz,

  -- Auditoria
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_contrato_cobrancas_periodo CHECK (periodo_ate >= periodo_de),
  CONSTRAINT contrato_cobrancas_periodo_unico
    UNIQUE (contrato_id, destinatario_id, periodo_de, periodo_ate)
);

CREATE INDEX IF NOT EXISTS idx_contrato_cobrancas_contrato     ON public.contrato_cobrancas (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_cobrancas_destinatario ON public.contrato_cobrancas (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_contrato_cobrancas_org_estado   ON public.contrato_cobrancas (org_id, estado);
CREATE INDEX IF NOT EXISTS idx_contrato_cobrancas_pendentes
  ON public.contrato_cobrancas (org_id, periodo_de) WHERE estado = 'pendente';

-- ------------------------------------------------------------
-- Trigger: preencher org_id a partir do contrato
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_contrato_cobranca_org_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.contratos_renting WHERE id = NEW.contrato_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_cobrancas_set_org_id ON public.contrato_cobrancas;
CREATE TRIGGER trg_contrato_cobrancas_set_org_id
  BEFORE INSERT ON public.contrato_cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.set_contrato_cobranca_org_id();

-- ------------------------------------------------------------
-- Trigger: updated_at + imutabilidade após emissão (SAF-T)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_contrato_cobranca_protege()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();

  -- Após emitida/paga, valores e período não mudam — só estado e dados de liquidação
  IF OLD.estado IN ('emitida', 'paga') THEN
    IF NEW.valor_sem_iva    IS DISTINCT FROM OLD.valor_sem_iva
    OR NEW.taxa_iva         IS DISTINCT FROM OLD.taxa_iva
    OR NEW.periodo_de       IS DISTINCT FROM OLD.periodo_de
    OR NEW.periodo_ate      IS DISTINCT FROM OLD.periodo_ate
    OR NEW.destinatario_id  IS DISTINCT FROM OLD.destinatario_id THEN
      RAISE EXCEPTION
        'Cobrança já emitida — valores, período e destinatário são imutáveis (SAF-T).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_cobrancas_protege ON public.contrato_cobrancas;
CREATE TRIGGER trg_contrato_cobrancas_protege
  BEFORE UPDATE ON public.contrato_cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_cobranca_protege();

-- ------------------------------------------------------------
-- RLS — multi-tenant + acesso a contratos renting
-- ------------------------------------------------------------
ALTER TABLE public.contrato_cobrancas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_contrato_cobrancas_select" ON public.contrato_cobrancas;
DROP POLICY IF EXISTS "mt_contrato_cobrancas_insert" ON public.contrato_cobrancas;
DROP POLICY IF EXISTS "mt_contrato_cobrancas_update" ON public.contrato_cobrancas;
DROP POLICY IF EXISTS "mt_contrato_cobrancas_delete" ON public.contrato_cobrancas;

CREATE POLICY "mt_contrato_cobrancas_select" ON public.contrato_cobrancas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

CREATE POLICY "mt_contrato_cobrancas_insert" ON public.contrato_cobrancas
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_contratos_access()
  );

CREATE POLICY "mt_contrato_cobrancas_update" ON public.contrato_cobrancas
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

-- Delete só de cobranças ainda pendentes (emitidas não se apagam)
CREATE POLICY "mt_contrato_cobrancas_delete" ON public.contrato_cobrancas
  FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND has_renting_contratos_access()
    AND estado = 'pendente'
  );

COMMENT ON TABLE public.contrato_cobrancas IS
  'Linhas de faturação por período de um contrato. Destinatário (cliente ou '
  'condutor) escolhido por período. Cada linha = débito na conta-corrente do destinatário.';
COMMENT ON COLUMN public.contrato_cobrancas.emite_fatura_fiscal IS
  'true = gera fatura fiscal (Primavera). false = cobrança interna sem fatura '
  '(ex: motorista TVDE que paga a semana mas não recebe fatura).';
COMMENT ON COLUMN public.contrato_cobrancas.destinatario_papel IS
  'cliente = titular do contrato; condutor = um dos condutores. Ambos são registos de clientes.';
