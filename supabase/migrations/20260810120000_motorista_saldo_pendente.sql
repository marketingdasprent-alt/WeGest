-- ============================================================
-- Saldo pendente do motorista — função única, reutilizada em todo o lado
-- ============================================================
-- motorista_financeiro não tem noção de saldo: só `valor` (fixo) + `status`
-- (pendente/pago/cancelado). "pendente" já é, em toda a tabela, a convenção
-- estabelecida de "por liquidar" (ver 20260730160000_motorista_acordo_saldo_e_
-- descoberta.sql — um pagamento de parcela de acordo teve de entrar como
-- 'pendente', não 'pago', para se compensar no mesmo balde do débito que
-- está a liquidar). Esta função só formaliza o que já era o cálculo inline
-- (e correcto) do cartão "Saldo Atual" do próprio motorista
-- (MotoristaDashboard.tsx), para deixar de estar escondido só ali.
--
-- Mesmo padrão já usado no resto do código para "saldo":
-- conta_corrente_saldo (20260520000004_create_conta_corrente.sql) — STABLE
-- SECURITY INVOKER, sinal documentado em COMMENT ON FUNCTION.
-- Nota: motorista_financeiro NÃO tem coluna deleted_at em produção (a
-- migração 20260710100000_soft_delete_motorista_financeiro.sql que a
-- introduziria nunca chegou a ser aplicada — confirmado directamente no
-- schema antes desta migração). Sem filtro por deleted_at aqui; se essa
-- coluna vier a ser aplicada no futuro, esta função tem de ser actualizada
-- a par da RLS.
CREATE OR REPLACE FUNCTION public.motorista_saldo_pendente(
  p_motorista_id uuid,
  p_ate_data date DEFAULT NULL -- NULL = até hoje (sem limite superior de data)
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(CASE tipo WHEN 'credito' THEN valor ELSE -valor END), 0)::numeric(12,2)
  FROM public.motorista_financeiro
  WHERE motorista_id = p_motorista_id
    AND status = 'pendente'
    AND (p_ate_data IS NULL OR data_movimento <= p_ate_data);
$$;

COMMENT ON FUNCTION public.motorista_saldo_pendente(uuid, date) IS
  'Saldo por liquidar do motorista (Σcrédito − Σdébito, só status=pendente). '
  'Positivo = a favor do motorista (falta receber); negativo = motorista deve. '
  'p_ate_data filtra movimentos até essa data (usado para "saldo transportado" '
  'de semanas anteriores no resumo semanal); NULL = saldo actual completo.';

-- Versão em lote — evita N chamadas RPC (uma por motorista) na vista semanal
-- de Contas/Resumo, que já mostra dezenas de motoristas de uma vez.
CREATE OR REPLACE FUNCTION public.motoristas_saldo_pendente_lote(
  p_motorista_ids uuid[]
)
RETURNS TABLE(motorista_id uuid, saldo numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT mf.motorista_id, COALESCE(SUM(CASE mf.tipo WHEN 'credito' THEN mf.valor ELSE -mf.valor END), 0)::numeric(12,2)
  FROM public.motorista_financeiro mf
  WHERE mf.motorista_id = ANY (p_motorista_ids)
    AND mf.status = 'pendente'
  GROUP BY mf.motorista_id;
$$;

COMMENT ON FUNCTION public.motoristas_saldo_pendente_lote(uuid[]) IS
  'Mesmo cálculo de motorista_saldo_pendente (sem p_ate_data), para vários '
  'motoristas de uma vez — usada na vista semanal de Contas/Resumo. '
  'Motoristas sem nenhum movimento pendente não aparecem no resultado '
  '(saldo implícito 0) — o chamador trata a ausência como 0.';
