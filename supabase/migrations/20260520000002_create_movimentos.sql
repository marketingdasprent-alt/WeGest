-- ============================================================
-- Módulo Movimentações — movimentos operacionais de viatura
-- ============================================================
-- Regista transferências entre estações, reparações, manutenções,
-- impros (viatura parada) e inspeções. Inclui KM, combustível,
-- colaborador responsável, fotos/anexos e observações.
--
-- Multi-tenant via org_id. Quando um movimento muda de estado o
-- sistema sincroniza automaticamente a viatura (estado / estação
-- atual / KM) através do trigger `movimento_sync_viatura`.
-- ============================================================

-- ------------------------------------------------------------
-- Helper genérico: garante que `set_updated_at` existe antes de
-- qualquer trigger desta migração depender dele. Idempotente, por
-- isso não interfere com a definição original em migrações anteriores.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Helper de acesso (mantém policies legíveis)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_renting_movimentacoes_access()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT is_current_user_admin()
  OR has_permission(auth.uid(), 'renting_movimentacoes');
$$;

-- ============================================================
-- Tabela `movimentos`
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movimentos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo             integer NOT NULL,
  -- org_id é preenchido automaticamente — a app não precisa de o enviar.
  org_id             uuid NOT NULL DEFAULT public.get_current_org_id()
                       REFERENCES public.organizacoes(id) ON DELETE CASCADE,

  tipo               text NOT NULL
                       CHECK (tipo IN ('transferencia','reparacao','manutencao','impro','inspecao')),
  estado             text NOT NULL DEFAULT 'a_decorrer'
                       CHECK (estado IN ('planeado','a_decorrer','concluido','cancelado')),

  -- Viatura
  viatura_id         uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  matricula          text,

  -- Estações (transferência) — FK à tabela existente public.estacoes
  estacao_origem_id  uuid REFERENCES public.estacoes(id) ON DELETE SET NULL,
  estacao_destino_id uuid REFERENCES public.estacoes(id) ON DELETE SET NULL,

  -- Datas
  data_partida       timestamptz,
  data_chegada       timestamptz,

  -- Colaborador interno responsável (utilizador do sistema)
  colaborador_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  colaborador_nome   text,

  -- Quilometragem
  km_inicial         integer CHECK (km_inicial IS NULL OR km_inicial >= 0),
  km_final           integer CHECK (km_final  IS NULL OR km_final  >= 0),

  -- Combustível em oitavos (0 = vazio, 8 = cheio)
  combustivel_inicial smallint CHECK (combustivel_inicial IS NULL OR combustivel_inicial BETWEEN 0 AND 8),
  combustivel_final   smallint CHECK (combustivel_final   IS NULL OR combustivel_final   BETWEEN 0 AND 8),

  -- Assistência (reparação / manutenção / impro / inspeção)
  motivo             text,
  prestador          text,
  custo_estimado     numeric(10,2) CHECK (custo_estimado IS NULL OR custo_estimado >= 0),
  custo_final        numeric(10,2) CHECK (custo_final    IS NULL OR custo_final    >= 0),

  -- Geral
  info               text,
  observacoes        text,
  observacoes_internas text,

  -- Auditoria
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT movimentos_codigo_org_unique UNIQUE (org_id, codigo),
  CONSTRAINT movimentos_km_coerente
    CHECK (km_final IS NULL OR km_inicial IS NULL OR km_final >= km_inicial),
  CONSTRAINT movimentos_chegada_coerente
    CHECK (data_chegada IS NULL OR data_partida IS NULL OR data_chegada >= data_partida)
);

-- Indexes para os filtros + ordenações típicas
CREATE INDEX IF NOT EXISTS idx_movimentos_org_id        ON public.movimentos (org_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_estado        ON public.movimentos (org_id, estado);
CREATE INDEX IF NOT EXISTS idx_movimentos_tipo          ON public.movimentos (org_id, tipo);
CREATE INDEX IF NOT EXISTS idx_movimentos_matricula     ON public.movimentos (org_id, matricula);
CREATE INDEX IF NOT EXISTS idx_movimentos_viatura       ON public.movimentos (org_id, viatura_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_data_partida  ON public.movimentos (org_id, data_partida DESC);
CREATE INDEX IF NOT EXISTS idx_movimentos_codigo        ON public.movimentos (org_id, codigo);

COMMENT ON TABLE public.movimentos IS
  'Movimentos operacionais de viatura: transferências, reparações, manutenções, impros e inspeções.';

-- ============================================================
-- Sequência de código por organização
-- ============================================================
CREATE OR REPLACE FUNCTION public.gen_movimento_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = 0 THEN
    SELECT COALESCE(MAX(codigo), 999) + 1
      INTO NEW.codigo
      FROM public.movimentos
     WHERE org_id = NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movimentos_codigo ON public.movimentos;
CREATE TRIGGER trg_movimentos_codigo
  BEFORE INSERT ON public.movimentos
  FOR EACH ROW EXECUTE FUNCTION public.gen_movimento_codigo();

-- updated_at automático (reutiliza public.set_updated_at já existente)
DROP TRIGGER IF EXISTS trg_movimentos_updated_at ON public.movimentos;
CREATE TRIGGER trg_movimentos_updated_at
  BEFORE UPDATE ON public.movimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Sincronização automática da viatura ao mudar de estado
-- ============================================================
-- a_decorrer : reparação/manutenção/inspeção → viatura 'manutencao'
--              impro                          → viatura 'inativo'
--              transferência                  → sem alteração de estado
-- concluido  : transferência → atualiza estação atual + KM
--              restantes     → viatura volta a 'disponivel' (+ KM)
-- cancelado  : reparação/manutenção/impro/inspeção → 'disponivel'
-- ============================================================
-- SECURITY DEFINER: a sincronização da viatura é uma regra de negócio que
-- tem de aplicar sempre, mesmo que o utilizador não tenha permissão directa
-- de UPDATE em `viaturas` (o acesso ao movimento já foi validado pela RLS).
CREATE OR REPLACE FUNCTION public.movimento_sync_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sem viatura associada não há nada a sincronizar.
  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE só age quando o estado muda de facto.
  IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF NEW.estado = 'a_decorrer' THEN
    IF NEW.tipo = 'impro' THEN
      UPDATE public.viaturas SET status = 'inativo' WHERE id = NEW.viatura_id;
    ELSIF NEW.tipo IN ('reparacao','manutencao','inspecao') THEN
      UPDATE public.viaturas SET status = 'manutencao' WHERE id = NEW.viatura_id;
    END IF;
    -- transferência: a viatura mantém o estado durante o trânsito.

  ELSIF NEW.estado = 'concluido' THEN
    IF NEW.tipo = 'transferencia' THEN
      UPDATE public.viaturas
         SET estacao_id = COALESCE(NEW.estacao_destino_id, estacao_id),
             km_atual   = CASE
               WHEN NEW.km_final IS NOT NULL AND NEW.km_final >= COALESCE(km_atual, 0)
               THEN NEW.km_final ELSE km_atual END
       WHERE id = NEW.viatura_id;
    ELSE
      UPDATE public.viaturas
         SET status   = 'disponivel',
             km_atual = CASE
               WHEN NEW.km_final IS NOT NULL AND NEW.km_final >= COALESCE(km_atual, 0)
               THEN NEW.km_final ELSE km_atual END
       WHERE id = NEW.viatura_id;
    END IF;

  ELSIF NEW.estado = 'cancelado' THEN
    IF NEW.tipo IN ('reparacao','manutencao','impro','inspecao') THEN
      UPDATE public.viaturas SET status = 'disponivel' WHERE id = NEW.viatura_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movimentos_sync_viatura ON public.movimentos;
CREATE TRIGGER trg_movimentos_sync_viatura
  AFTER INSERT OR UPDATE ON public.movimentos
  FOR EACH ROW EXECUTE FUNCTION public.movimento_sync_viatura();

-- ============================================================
-- RLS — multi-tenant
-- ============================================================
ALTER TABLE public.movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_movimentos_select" ON public.movimentos;
DROP POLICY IF EXISTS "mt_movimentos_insert" ON public.movimentos;
DROP POLICY IF EXISTS "mt_movimentos_update" ON public.movimentos;
DROP POLICY IF EXISTS "mt_movimentos_delete" ON public.movimentos;

CREATE POLICY "mt_movimentos_select" ON public.movimentos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_movimentacoes_access());

CREATE POLICY "mt_movimentos_insert" ON public.movimentos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND has_renting_movimentacoes_access());

CREATE POLICY "mt_movimentos_update" ON public.movimentos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_movimentacoes_access())
  WITH CHECK (org_id = get_current_org_id() AND has_renting_movimentacoes_access());

CREATE POLICY "mt_movimentos_delete" ON public.movimentos FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_movimentacoes_access());

-- ============================================================
-- Anexos de movimento (fotos / documentos) — tabela + bucket
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movimento_anexos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  movimento_id  uuid NOT NULL REFERENCES public.movimentos(id) ON DELETE CASCADE,

  nome          varchar(255) NOT NULL,   -- nome legível (renomeável)
  ficheiro_url  text         NOT NULL,   -- caminho no bucket (imutável)
  tamanho_bytes bigint,
  mime_type     text,
  descricao     text,

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimento_anexos_movimento ON public.movimento_anexos (movimento_id);
CREATE INDEX IF NOT EXISTS idx_movimento_anexos_org       ON public.movimento_anexos (org_id);

-- Trigger: preencher org_id a partir do movimento
CREATE OR REPLACE FUNCTION public.set_movimento_anexo_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.movimentos WHERE id = NEW.movimento_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movimento_anexos_set_org_id ON public.movimento_anexos;
CREATE TRIGGER trg_movimento_anexos_set_org_id
  BEFORE INSERT ON public.movimento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.set_movimento_anexo_org_id();

DROP TRIGGER IF EXISTS trg_movimento_anexos_updated_at ON public.movimento_anexos;
CREATE TRIGGER trg_movimento_anexos_updated_at
  BEFORE UPDATE ON public.movimento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.movimento_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimento_anexos_select" ON public.movimento_anexos;
DROP POLICY IF EXISTS "movimento_anexos_insert" ON public.movimento_anexos;
DROP POLICY IF EXISTS "movimento_anexos_update" ON public.movimento_anexos;
DROP POLICY IF EXISTS "movimento_anexos_delete" ON public.movimento_anexos;

CREATE POLICY "movimento_anexos_select" ON public.movimento_anexos
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_movimentacoes_access());

CREATE POLICY "movimento_anexos_insert" ON public.movimento_anexos
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_movimentacoes_access()
  );

CREATE POLICY "movimento_anexos_update" ON public.movimento_anexos
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_movimentacoes_access())
  WITH CHECK (org_id = get_current_org_id() AND has_renting_movimentacoes_access());

CREATE POLICY "movimento_anexos_delete" ON public.movimento_anexos
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_movimentacoes_access());

-- ------------------------------------------------------------
-- Bucket de storage
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'movimento-anexos',
  'movimento-anexos',
  false,
  20971520, -- 20 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
  CREATE POLICY "movimento_anexos_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'movimento-anexos' AND public.has_renting_movimentacoes_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "movimento_anexos_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'movimento-anexos' AND public.has_renting_movimentacoes_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "movimento_anexos_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'movimento-anexos' AND public.has_renting_movimentacoes_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- listar_colaboradores() — utilizadores internos da organização
-- ============================================================
-- A policy `mt_profiles_select` só deixa o utilizador comum ver o
-- próprio perfil. Esta função SECURITY DEFINER expõe apenas
-- (id, nome) dos colaboradores da org atual para popular selects.
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_colaboradores()
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, COALESCE(NULLIF(TRIM(p.nome), ''), 'Sem nome') AS nome
  FROM public.profiles p
  WHERE p.org_id = public.get_current_org_id()
  ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.listar_colaboradores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_colaboradores() TO authenticated;

-- ============================================================
-- calendario_eventos: aceitar `transferencia` como tipo válido.
-- ============================================================
-- Um trigger existente cria uma entrada em `calendario_eventos`
-- por cada movimento ('Gerado automaticamente pelo movimento #N'),
-- usando `tipo='transferencia'`. Sem isto a check constraint
-- rejeita o INSERT e o movimento falha com 23514.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calendario_eventos'
  ) THEN
    ALTER TABLE public.calendario_eventos
      DROP CONSTRAINT IF EXISTS calendario_eventos_tipo_check;

    ALTER TABLE public.calendario_eventos
      ADD CONSTRAINT calendario_eventos_tipo_check
      CHECK (tipo = ANY (ARRAY[
        'entrega',
        'recolha',
        'devolucao',
        'troca',
        'upgrade',
        'lista_espera',
        'transferencia'
      ]));
  END IF;
END $$;
