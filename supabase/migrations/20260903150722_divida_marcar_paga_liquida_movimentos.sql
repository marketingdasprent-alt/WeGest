-- Marcar uma dívida como paga liquida mesmo os movimentos que a formam: eles
-- passam a 'pago' e o saldo vai a zero. Sem isto, "paga" era só uma etiqueta e
-- o motorista continuava a dever no sistema depois de ter pago.
--
-- Guarda-se em cada movimento a dívida que o liquidou (divida_id), e é isso
-- que torna o gesto reversível ao movimento exacto: voltar a "não paga"
-- devolve a pendente só os que aquela dívida levou, e mais nenhum.

CREATE OR REPLACE FUNCTION public.divida_marcar_paga(p_motorista_id uuid)
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
  WHERE f.motorista_id = p_motorista_id AND f.status = 'pendente';

  IF v_saldo IS NULL OR v_saldo >= 0 THEN
    RAISE EXCEPTION 'Este motorista não tem dívida em aberto (saldo %).', coalesce(v_saldo, 0)
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
     AND status = 'pendente';

  RETURN v_divida_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.divida_marcar_nao_paga(p_divida_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF NOT (public.is_current_user_admin()
          OR public.has_permission(auth.uid(), 'financeiro_recibos')
          OR public.is_decada_ousada_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para gerir dívidas.' USING ERRCODE = '42501';
  END IF;

  SELECT d.org_id INTO v_org
    FROM public.dividas_motorista d
   WHERE d.id = p_divida_id
     AND (d.org_id = public.get_current_org_id() OR public.is_decada_ousada_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dívida não encontrada nesta organização.' USING ERRCODE = 'P0002';
  END IF;

  -- Só os movimentos que ESTA dívida liquidou voltam atrás.
  UPDATE public.motorista_financeiro
     SET status         = 'pendente',
         data_pagamento = NULL,
         divida_id      = NULL
   WHERE divida_id = p_divida_id;

  -- A liquidação não se apaga — fica como anulada, para o histórico dizer que
  -- alguém marcou como paga e depois desfez.
  UPDATE public.dividas_motorista
     SET estado = 'cancelada', pago_em = NULL
   WHERE id = p_divida_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.divida_marcar_paga(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.divida_marcar_nao_paga(uuid) TO authenticated;
