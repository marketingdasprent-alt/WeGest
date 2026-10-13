-- O saldo pendente deixa de contar duas vezes o que o resumo já somou.
--
-- Os créditos e débitos lançados à mão numa semana (acertos, ajudas de custo,
-- seguros, slot, "outros"...) entram no líquido dessa semana, e o líquido é
-- gravado como movimento pendente (sincronizar_movimento_resumo). Os
-- movimentos originais ficavam também pendentes e o saldo somava as duas
-- coisas: o Pedro Souto tinha 985,37 € de líquido e 1 038,94 € de saldo (o
-- acerto de 53,57 € duas vezes). Na semana de 05/10, 36 motoristas assim.
--
-- Um movimento já está no resumo quando cai numa semana com líquido gravado,
-- foi lançado antes dessa gravação e, se a semana já foi paga, antes do
-- pagamento (o que entra depois de pago fica por liquidar à parte). Ficam
-- sempre de fora o próprio líquido e a devolução de caução, que o resumo não
-- soma. Mesmas regras que classificarMovimento / useContasResumoSemana.

CREATE OR REPLACE FUNCTION public.movimentos_ja_no_resumo(p_motorista_ids uuid[])
RETURNS TABLE(movimento_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT f.id
    FROM public.motorista_financeiro f
    JOIN public.motorista_liquido_semanal l
      ON l.motorista_id = f.motorista_id
     AND f.data_movimento BETWEEN l.semana_inicio AND l.semana_fim
    LEFT JOIN public.motorista_financeiro r ON r.liquido_semanal_id = l.id
   WHERE f.motorista_id = ANY (p_motorista_ids)
     AND f.status = 'pendente'
     AND f.liquido_semanal_id IS NULL
     AND lower(coalesce(f.categoria, '')) <> 'resumos'
     AND NOT (f.tipo = 'credito' AND lower(coalesce(f.categoria, '')) = 'caucao')
     AND f.created_at <= l.gravado_em
     AND (r.id IS NULL OR r.status = 'pendente' OR f.created_at::date <= r.data_pagamento);
$$;

COMMENT ON FUNCTION public.movimentos_ja_no_resumo(uuid[]) IS
  'Movimentos pendentes que o líquido semanal gravado já soma. O saldo pendente e o separador Financeiro não os contam outra vez.';

REVOKE EXECUTE ON FUNCTION public.movimentos_ja_no_resumo(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentos_ja_no_resumo(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.motorista_saldo_pendente(p_motorista_id uuid, p_ate_data date DEFAULT NULL::date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(CASE tipo WHEN 'credito' THEN valor ELSE -valor END), 0)::numeric(12,2)
  FROM public.motorista_financeiro
  WHERE motorista_id = p_motorista_id
    AND status = 'pendente'
    AND (p_ate_data IS NULL OR data_movimento <= p_ate_data)
    AND id NOT IN (SELECT movimento_id FROM public.movimentos_ja_no_resumo(ARRAY[p_motorista_id]));
$$;

CREATE OR REPLACE FUNCTION public.motoristas_saldo_pendente_lote(p_motorista_ids uuid[], p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
RETURNS TABLE(motorista_id uuid, saldo numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT mf.motorista_id,
         COALESCE(SUM(CASE mf.tipo WHEN 'credito' THEN mf.valor ELSE -mf.valor END), 0)::numeric(12,2)
  FROM public.motorista_financeiro mf
  WHERE mf.motorista_id = ANY (p_motorista_ids)
    AND mf.status = 'pendente'
    AND (p_data_inicio IS NULL OR mf.data_movimento >= p_data_inicio)
    AND (p_data_fim IS NULL OR mf.data_movimento <= p_data_fim)
    AND mf.id NOT IN (SELECT movimento_id FROM public.movimentos_ja_no_resumo(p_motorista_ids))
  GROUP BY mf.motorista_id;
$$;

NOTIFY pgrst, 'reload schema';
