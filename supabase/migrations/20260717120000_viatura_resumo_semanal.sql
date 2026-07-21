-- supabase/migrations/20260717120000_viatura_resumo_semanal.sql
-- Histórico semanal (segunda-domingo) de receita/despesa por viatura.
-- Gerado por cron (ver 20260717120001), nunca escrito por utilizador.

CREATE TABLE IF NOT EXISTS public.viatura_resumo_semanal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.get_current_org_id()
    REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  viatura_id uuid NOT NULL REFERENCES public.viaturas(id) ON DELETE CASCADE,
  semana_inicio date NOT NULL,
  semana_fim date NOT NULL,
  receita_aluguer numeric(10,2) NOT NULL DEFAULT 0,
  receita_outros numeric(10,2) NOT NULL DEFAULT 0,
  despesa_combustivel numeric(10,2) NOT NULL DEFAULT 0,
  despesa_portagens numeric(10,2) NOT NULL DEFAULT 0,
  despesa_danos numeric(10,2) NOT NULL DEFAULT 0,
  despesa_outros numeric(10,2) NOT NULL DEFAULT 0,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT viatura_resumo_semanal_periodo_check CHECK (semana_fim >= semana_inicio),
  CONSTRAINT viatura_resumo_semanal_unique UNIQUE (viatura_id, semana_inicio)
);

CREATE INDEX IF NOT EXISTS idx_viatura_resumo_semanal_viatura
  ON public.viatura_resumo_semanal (viatura_id, semana_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_viatura_resumo_semanal_org
  ON public.viatura_resumo_semanal (org_id);

ALTER TABLE public.viatura_resumo_semanal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_org_isolation ON public.viatura_resumo_semanal;
CREATE POLICY rls_org_isolation ON public.viatura_resumo_semanal
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());

-- Mesmo gate de permissão das tabelas irmãs (viatura_reparacoes/viatura_danos/
-- viatura_multas): leitura para admin ou quem tem 'motoristas_gestao'.
DROP POLICY IF EXISTS "Permissão para ver viatura_resumo_semanal" ON public.viatura_resumo_semanal;
CREATE POLICY "Permissão para ver viatura_resumo_semanal" ON public.viatura_resumo_semanal
  FOR SELECT
  USING (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'motoristas_gestao'));

-- Sem policy de INSERT/UPDATE/DELETE para authenticated/anon — só
-- service_role escreve (edge function gerar-resumo-semanal-viaturas).
GRANT SELECT ON public.viatura_resumo_semanal TO authenticated;
GRANT ALL ON public.viatura_resumo_semanal TO service_role;
