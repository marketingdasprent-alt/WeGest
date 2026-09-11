-- O saldo pendente passa a poder ser pedido por período.
--
-- Na lista semanal de Contas todas as colunas são da semana escolhida — menos
-- esta, que somava a conta corrente inteira do motorista. Com duas semanas
-- gravadas, um motorista aparecia com o dobro: 3.312,08 € numa linha cujo
-- líquido era 1.599,63 €. Numa tabela semanal, um acumulado no meio lê-se
-- como se fosse da semana.
--
-- As datas são OPCIONAIS e por omissão NULL, que mantém exactamente o
-- comportamento antigo (saldo global). O separador Financeiro do motorista e
-- o portal continuam a chamar sem datas e a ver o mesmo número de sempre.
--
-- A versão de um só argumento é removida logo a seguir: com esta a aceitar
-- 1 a 3 argumentos, uma chamada só com o array ficava ambígua e o Postgres
-- recusava-a ("function is not unique").

CREATE OR REPLACE FUNCTION public.motoristas_saldo_pendente_lote(
  p_motorista_ids uuid[],
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(motorista_id uuid, saldo numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT mf.motorista_id,
         COALESCE(SUM(CASE mf.tipo WHEN 'credito' THEN mf.valor ELSE -mf.valor END), 0)::numeric(12,2)
  FROM public.motorista_financeiro mf
  WHERE mf.motorista_id = ANY (p_motorista_ids)
    AND mf.status = 'pendente'
    AND (p_data_inicio IS NULL OR mf.data_movimento >= p_data_inicio)
    AND (p_data_fim IS NULL OR mf.data_movimento <= p_data_fim)
  GROUP BY mf.motorista_id;
$$;

REVOKE ALL ON FUNCTION public.motoristas_saldo_pendente_lote(uuid[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.motoristas_saldo_pendente_lote(uuid[], date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.motoristas_saldo_pendente_lote(uuid[]);
