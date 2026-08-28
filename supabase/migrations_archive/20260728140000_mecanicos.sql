-- ============================================================
-- Catálogo de Mecânicos (sem conta/login) + ligação ao ticket de assistência
-- ============================================================
-- Os mecânicos podem não ter email e nunca entram no WeGest — por isso são um
-- catálogo próprio (nome + contacto), à parte dos utilizadores/colaboradores.
-- O ticket passa a ter `mecanico_id` (mecânico responsável físico da reparação),
-- separado de `atribuido_a` (utilizador interno que controla o acesso ao ticket).
-- Migração idempotente/aditiva.
-- ============================================================

-- 1) Tabela do catálogo
CREATE TABLE IF NOT EXISTS public.mecanicos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT get_current_org_id(),
  nome        text NOT NULL,
  telefone    text,
  observacoes text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mecanicos_org   ON public.mecanicos (org_id);
CREATE INDEX IF NOT EXISTS idx_mecanicos_ativo ON public.mecanicos (org_id, ativo);

CREATE OR REPLACE FUNCTION public.touch_mecanicos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_mecanicos_updated_at ON public.mecanicos;
CREATE TRIGGER trg_mecanicos_updated_at
  BEFORE UPDATE ON public.mecanicos
  FOR EACH ROW EXECUTE FUNCTION public.touch_mecanicos_updated_at();

-- RLS: isolamento por organização (leitura a todos os autenticados da org;
-- a gestão é adicionalmente protegida pela permissão no cliente).
ALTER TABLE public.mecanicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_mecanicos_all" ON public.mecanicos;
CREATE POLICY "mt_mecanicos_all" ON public.mecanicos
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

COMMENT ON TABLE public.mecanicos IS 'Catálogo de mecânicos (sem conta/login) para atribuir como responsável de reparações.';

-- 2) Ligação ao ticket (mecânico responsável físico)
ALTER TABLE public.assistencia_tickets
  ADD COLUMN IF NOT EXISTS mecanico_id uuid REFERENCES public.mecanicos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assistencia_tickets_mecanico ON public.assistencia_tickets (mecanico_id);

-- 3) Permissão para gerir o catálogo (módulo Assistência)
INSERT INTO public.recursos (nome, descricao, categoria)
SELECT 'assistencia_mecanicos', 'Gerir catálogo de mecânicos', 'Assistência'
WHERE NOT EXISTS (SELECT 1 FROM public.recursos WHERE nome = 'assistencia_mecanicos');
