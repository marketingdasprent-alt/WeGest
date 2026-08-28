-- supabase/migrations/20260720120000_motorista_resumo_semanal.sql
-- Histórico semanal por segmento de contrato (motorista × contrato × semana).
-- Um motorista pode ter mais que uma linha na mesma semana (troca de viatura
-- a meio da semana via versionamento de contrato) — o total semanal do
-- motorista é SUM(custo_aluguer + ...) agrupado por motorista_id+semana_inicio,
-- calculado em query-time, não armazenado.

CREATE TABLE IF NOT EXISTS public.motorista_resumo_semanal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.get_current_org_id()
    REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  motorista_id uuid NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  viatura_id uuid NOT NULL REFERENCES public.viaturas(id) ON DELETE CASCADE,
  semana_inicio date NOT NULL,
  semana_fim date NOT NULL,
  custo_aluguer numeric(10,2) NOT NULL DEFAULT 0,
  receita_bolt numeric(10,2) NOT NULL DEFAULT 0,
  receita_uber numeric(10,2) NOT NULL DEFAULT 0,
  receita_outras numeric(10,2) NOT NULL DEFAULT 0,
  despesa_caucao numeric(10,2) NOT NULL DEFAULT 0,
  despesa_seguros numeric(10,2) NOT NULL DEFAULT 0,
  despesa_outros numeric(10,2) NOT NULL DEFAULT 0,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT motorista_resumo_semanal_periodo_check CHECK (semana_fim >= semana_inicio),
  CONSTRAINT motorista_resumo_semanal_unique UNIQUE (motorista_id, contrato_id, semana_inicio)
);

CREATE INDEX IF NOT EXISTS idx_motorista_resumo_semanal_motorista
  ON public.motorista_resumo_semanal (motorista_id, semana_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_motorista_resumo_semanal_org
  ON public.motorista_resumo_semanal (org_id);

ALTER TABLE public.motorista_resumo_semanal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_org_isolation ON public.motorista_resumo_semanal;
CREATE POLICY rls_org_isolation ON public.motorista_resumo_semanal
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());

-- Mesmo gate de permissão de viatura_resumo_semanal: leitura para admin ou
-- quem tem 'motoristas_gestao'.
DROP POLICY IF EXISTS "Permissão para ver motorista_resumo_semanal" ON public.motorista_resumo_semanal;
CREATE POLICY "Permissão para ver motorista_resumo_semanal" ON public.motorista_resumo_semanal
  FOR SELECT
  USING (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'motoristas_gestao'));

-- Sem policy de INSERT/UPDATE/DELETE para authenticated/anon — só
-- service_role escreve (edge function fechar-semana-financeiro).
GRANT SELECT ON public.motorista_resumo_semanal TO authenticated;
GRANT ALL ON public.motorista_resumo_semanal TO service_role;
