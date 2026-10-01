-- Duas coisas, ambas da aba de Dívidas passar a ser semanal.
--
-- 1) MARCAR PAGA GANHA PERÍODO
--
-- A aba passou a mostrar quem teve líquido negativo NAQUELA semana, e os
-- valores não acumulam de uma semana para a outra. Sem período, a função
-- somava e liquidava TODOS os movimentos pendentes do motorista — carregar em
-- "Marcar paga" numa semana dava baixa também das outras, incluindo de semanas
-- que nem estavam à vista.
--
-- As datas são opcionais: a NULL o comportamento é exactamente o de antes,
-- para não quebrar quem chame sem elas. A versão de um só argumento tem de
-- sair, senão uma chamada com apenas o motorista fica ambígua ("function is
-- not unique").
--
-- O período gravado em dividas_motorista continua a ser o dos movimentos
-- efectivamente liquidados (min/max das datas), não o pedido.
--
-- 2) TRÊS FUNÇÕES FECHADAS AO ANÓNIMO
--
-- Mesma família da migração 20260908090047: o EXECUTE não vinha de um grant ao
-- anon, vinha do default do PostgreSQL, que concede a PUBLIC. São funções que
-- mexem em dinheiro (dar uma dívida por paga, desfazer isso, reescrever o
-- movimento do resumo) mais a função de trigger do auto-mapeamento, que nasceu
-- exposta na 20260908150631 por lhe faltar o REVOKE. O teste 30 de
-- rls_anon_exposure apanha-as todas.

CREATE OR REPLACE FUNCTION public.divida_marcar_paga(
  p_motorista_id uuid,
  p_data_inicio  date DEFAULT NULL,
  p_data_fim     date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_divida_id uuid;
  v_org       uuid;
  v_nome      text;
  v_saldo     numeric;
  v_danos     numeric;
  v_caucao    numeric;
  v_inicio    date;
  v_fim       date;
BEGIN
  IF NOT (public.is_current_user_admin()
          OR public.has_permission(auth.uid(), 'financeiro_recibos')
          OR public.is_decada_ousada_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para gerir dívidas.' USING ERRCODE = '42501';
  END IF;

  SELECT m.org_id, m.nome INTO v_org, v_nome
    FROM public.motoristas_ativos m
   WHERE m.id = p_motorista_id
     AND (m.org_id = public.get_current_org_id() OR public.is_decada_ousada_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Motorista não encontrado nesta organização.' USING ERRCODE = 'P0002';
  END IF;

  -- Trava os movimentos antes de os somar: entre a soma e a liquidação não
  -- pode entrar um movimento novo que fique de fora da dívida sem ninguém dar
  -- por isso. Agregados não aceitam FOR UPDATE, daí o lock em separado.
  PERFORM 1 FROM public.motorista_financeiro
    WHERE motorista_id = p_motorista_id AND status = 'pendente'
      AND (p_data_inicio IS NULL OR data_movimento >= p_data_inicio)
      AND (p_data_fim    IS NULL OR data_movimento <= p_data_fim)
    FOR UPDATE;

  SELECT
    round(sum(CASE f.tipo WHEN 'credito' THEN f.valor ELSE -f.valor END), 2),
    greatest(round(sum(
      CASE WHEN f.categoria = 'reparacao' AND f.tipo = 'debito'  THEN  f.valor
           WHEN f.categoria = 'reparacao' AND f.tipo = 'credito' THEN -f.valor
           ELSE 0 END), 2), 0),
    round(sum(
      CASE WHEN f.categoria = 'caucao' AND f.tipo = 'credito' THEN  f.valor
           WHEN f.categoria = 'caucao' AND f.tipo = 'debito'  THEN -f.valor
           ELSE 0 END), 2),
    min(f.data_movimento),
    max(f.data_movimento)
  INTO v_saldo, v_danos, v_caucao, v_inicio, v_fim
  FROM public.motorista_financeiro f
  WHERE f.motorista_id = p_motorista_id AND f.status = 'pendente'
    AND (p_data_inicio IS NULL OR f.data_movimento >= p_data_inicio)
    AND (p_data_fim    IS NULL OR f.data_movimento <= p_data_fim);

  IF v_saldo IS NULL OR v_saldo >= 0 THEN
    RAISE EXCEPTION 'Este motorista não tem dívida em aberto neste período (saldo %).', coalesce(v_saldo, 0)
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dividas_motorista
    (org_id, motorista_id, motorista_nome, periodo_inicio, periodo_fim,
     valor_periodo, valor_danos, valor_caucao, valor_total,
     estado, pago_em, criado_por)
  VALUES
    (v_org, p_motorista_id, v_nome, v_inicio, v_fim,
     v_saldo, v_danos, v_caucao, abs(v_saldo),
     'paga', now(), auth.uid())
  RETURNING id INTO v_divida_id;

  UPDATE public.motorista_financeiro
     SET status         = 'pago',
         data_pagamento = current_date,
         divida_id      = v_divida_id
   WHERE motorista_id = p_motorista_id
     AND status = 'pendente'
     AND (p_data_inicio IS NULL OR data_movimento >= p_data_inicio)
     AND (p_data_fim    IS NULL OR data_movimento <= p_data_fim);

  RETURN v_divida_id;
END;
$$;

DROP FUNCTION IF EXISTS public.divida_marcar_paga(uuid);

REVOKE ALL ON FUNCTION public.divida_marcar_paga(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.divida_marcar_paga(uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.divida_marcar_nao_paga(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.divida_marcar_nao_paga(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sincronizar_movimento_resumo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_resolver_motorista_plataforma() FROM PUBLIC;
