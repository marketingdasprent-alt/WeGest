-- ============================================================
-- Motorista vê os PRÓPRIOS movimentos financeiros e os danos da sua viatura
-- ============================================================
-- O portal do motorista tem os cartões "Movimentos" (motorista_financeiro:
-- ganhos Uber/Bolt, aluguer, portagens) e "Danos" (viatura_danos), mas o
-- motorista NUNCA os via: a RLS destas tabelas só concede leitura a staff
-- (can_view_financeiro() / permissões de gestão). Não havia política
-- "self-motorista" como já existe (e funciona) em motorista_recibos.
--
-- Estas duas políticas SELECT permissivas espelham o padrão dos recibos:
-- o motorista lê só as linhas que lhe pertencem. A guarda restritiva de
-- isolamento por org (rls_org_isolation) continua a aplicar-se por cima
-- (AND), e o acesso de staff mantém-se intacto (políticas aditivas).
-- ============================================================

-- Movimentos financeiros: só os do próprio motorista (via user → motoristas_ativos)
DROP POLICY IF EXISTS "Motorista ve os seus movimentos" ON public.motorista_financeiro;
CREATE POLICY "Motorista ve os seus movimentos"
  ON public.motorista_financeiro
  FOR SELECT
  TO authenticated
  USING (
    motorista_id IN (
      SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid())
    )
  );

-- Danos: os das viaturas actualmente atribuídas ao motorista (via
-- motorista_viaturas). Vê o histórico de danos do carro que conduz.
DROP POLICY IF EXISTS "Motorista ve os danos da sua viatura" ON public.viatura_danos;
CREATE POLICY "Motorista ve os danos da sua viatura"
  ON public.viatura_danos
  FOR SELECT
  TO authenticated
  USING (
    viatura_id IN (
      SELECT mv.viatura_id
      FROM public.motorista_viaturas mv
      JOIN public.motoristas_ativos ma ON ma.id = mv.motorista_id
      WHERE ma.user_id = (SELECT auth.uid())
        AND mv.status = 'ativo'
        AND mv.data_fim IS NULL
    )
  );
