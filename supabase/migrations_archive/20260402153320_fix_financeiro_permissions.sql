-- Alinhar permissões do módulo Financeiro para visualizar dados das plataformas
-- Tabelas afetadas: bolt_viagens, uber_transactions, bolt_resumos_semanais, uber_atividade_motoristas, transações de combustível (bp, repsol, edp)

-- 1. Permissões para Bolt Viagens
DROP POLICY IF EXISTS "Financeiro pode ver todas as viagens Bolt" ON public.bolt_viagens;
CREATE POLICY "Financeiro pode ver todas as viagens Bolt"
ON public.bolt_viagens FOR SELECT
USING (
  public.is_current_user_admin() OR 
  public.has_permission(auth.uid(), 'motoristas_gestao') OR
  public.has_permission(auth.uid(), 'financeiro_recibos')
);

-- 2. Permissões para Uber Transactions
DROP POLICY IF EXISTS "Financeiro pode ver transações Uber" ON public.uber_transactions;
CREATE POLICY "Financeiro pode ver transações Uber"
ON public.uber_transactions FOR SELECT
USING (
  public.is_current_user_admin() OR 
  public.has_permission(auth.uid(), 'motoristas_gestao') OR
  public.has_permission(auth.uid(), 'financeiro_recibos')
);

-- 3. Permissões para Bolt Resumos Semanais (CSV)
DROP POLICY IF EXISTS "Financeiro pode ver resumos Bolt" ON public.bolt_resumos_semanais;
CREATE POLICY "Financeiro pode ver resumos Bolt"
ON public.bolt_resumos_semanais FOR SELECT
USING (
  public.is_current_user_admin() OR 
  public.has_permission(auth.uid(), 'motoristas_gestao') OR
  public.has_permission(auth.uid(), 'financeiro_recibos')
);

-- 4. Permissões para BP Transações
DROP POLICY IF EXISTS "Financeiro pode ver bp_transacoes" ON public.bp_transacoes;
CREATE POLICY "Financeiro pode ver bp_transacoes"
ON public.bp_transacoes FOR SELECT
USING (
  public.is_current_user_admin() OR 
  public.has_permission(auth.uid(), 'financeiro_recibos')
);

-- 5. Permissões para Repsol Transações
DROP POLICY IF EXISTS "Financeiro pode ver repsol_transacoes" ON public.repsol_transacoes;
CREATE POLICY "Financeiro pode ver repsol_transacoes"
ON public.repsol_transacoes FOR SELECT
USING (
  public.is_current_user_admin() OR 
  public.has_permission(auth.uid(), 'financeiro_recibos')
);

-- 6. Permissões para EDP Transações
DROP POLICY IF EXISTS "Financeiro pode ver edp_transacoes" ON public.edp_transacoes;
CREATE POLICY "Financeiro pode ver edp_transacoes"
ON public.edp_transacoes FOR SELECT
USING (
  public.is_current_user_admin() OR 
  public.has_permission(auth.uid(), 'financeiro_recibos')
);

-- 7. Permissões para Uber Atividade
-- Se a tabela uber_atividade_motoristas existir e tiver RLS
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'uber_atividade_motoristas') THEN
        DROP POLICY IF EXISTS "Financeiro pode ver atividade Uber" ON public.uber_atividade_motoristas;
        CREATE POLICY "Financeiro pode ver atividade Uber"
        ON public.uber_atividade_motoristas FOR SELECT
        USING (
          public.is_current_user_admin() OR 
          public.has_permission(auth.uid(), 'financeiro_recibos')
        );
    END IF;
END
$$;

-- 8. Garantir que motoristas_ativos continua visível (já deve estar, mas reforçamos)
DROP POLICY IF EXISTS "Financeiro pode ver motoristas_ativos_v2" ON public.motoristas_ativos;
CREATE POLICY "Financeiro pode ver motoristas_ativos_v2" 
ON public.motoristas_ativos FOR SELECT
USING (
  public.is_current_user_admin() OR 
  public.has_permission(auth.uid(), 'financeiro_recibos')
);
