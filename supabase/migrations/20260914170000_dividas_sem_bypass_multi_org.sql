-- As Dívidas voltam a ser de cada empresa: sai o bypass multi-org do admin
-- da Década Ousada.
--
-- O QUE APARECIA
-- Um admin da Década Ousada via na aba de Dívidas linhas de outra organização
-- (a conta da frota da PREMIUM RIDE, ver 20260914160000). A linha existe na
-- org dela — mas não devia ser visível a partir da Década.
--
-- PORQUÊ
-- A isolação por organização deste projecto é estrita: das 179 políticas
-- `rls_org_isolation`, 174 são `org_id = get_current_org_id()`, sem mais.
-- Só três atravessam organizações, e são as dos tickets de TI — o suporte à
-- plataforma tem mesmo de ver os pedidos de todas as empresas
-- (20260903093446_suporte_ti_decada_ve_todas_as_orgs.sql explica).
-- `dividas_motorista` (02/09) e `motorista_liquido_semanal` (03/09) copiaram
-- esse `OR is_decada_ousada_admin()` sem terem razão para o ter: uma dívida de
-- um motorista é da empresa dele e de mais ninguém. As RPCs de liquidar
-- (`divida_marcar_paga`, `divida_marcar_nao_paga`) tinham a mesma cláusula,
-- o que ia mais longe do que ver: deixava marcar como paga a dívida de um
-- motorista de outra empresa.
--
-- A app não depende disto — nenhum ecrã pede "todas as organizações" nas
-- Dívidas. Quem tem acesso a várias empresas troca de organização e vê as de
-- cada uma, como em todo o resto.

-- ---------------------------------------------------------------------------
-- Políticas: isolação estrita, e a permissão de gestão sem o bypass (já era
-- redundante — um admin da Década é admin na própria org — mas fica igual às
-- outras 174 para não voltar a ser copiado como se fosse o padrão).
-- ---------------------------------------------------------------------------
ALTER POLICY rls_org_isolation ON public.dividas_motorista
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

ALTER POLICY dividas_motorista_gestao ON public.dividas_motorista
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'financeiro_recibos')
  );

ALTER POLICY rls_org_isolation ON public.motorista_liquido_semanal
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

ALTER POLICY motorista_liquido_semanal_gestao ON public.motorista_liquido_semanal
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'administrativo_resumos')
  );

-- ---------------------------------------------------------------------------
-- RPCs: a mesma função, só sem a cláusula multi-org. O corpo é o da
-- 20260909094449 (marcar paga) e da 20260903150722 (marcar não paga).
-- ---------------------------------------------------------------------------

-- A versão de um argumento (20260903150722) foi apagada na 20260909094449;
-- repete-se por segurança — se por algum motivo ainda existir, tem o bypass.
DROP FUNCTION IF EXISTS public.divida_marcar_paga(uuid);

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
          OR public.has_permission(auth.uid(), 'financeiro_recibos')) THEN
    RAISE EXCEPTION 'Sem permissão para gerir dívidas.' USING ERRCODE = '42501';
  END IF;

  -- SECURITY DEFINER não passa pela RLS: a organização valida-se aqui, à mão,
  -- e é só a activa — a dívida de um motorista é da empresa dele.
  SELECT m.org_id, m.nome INTO v_org, v_nome
    FROM public.motoristas_ativos m
   WHERE m.id = p_motorista_id
     AND m.org_id = public.get_current_org_id();
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

REVOKE ALL ON FUNCTION public.divida_marcar_paga(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.divida_marcar_paga(uuid, date, date) TO authenticated;

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
          OR public.has_permission(auth.uid(), 'financeiro_recibos')) THEN
    RAISE EXCEPTION 'Sem permissão para gerir dívidas.' USING ERRCODE = '42501';
  END IF;

  SELECT d.org_id INTO v_org
    FROM public.dividas_motorista d
   WHERE d.id = p_divida_id
     AND d.org_id = public.get_current_org_id();
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

REVOKE ALL ON FUNCTION public.divida_marcar_nao_paga(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.divida_marcar_nao_paga(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
