-- ============================================================
-- RPC atómica para check-in/check-out legacy TVDE associar motorista↔viatura
-- ============================================================
-- Bug: ContratoEntregaStep.tsx, RecolhaCheckinStep.tsx e TrocaCheckinStep.tsx
-- fazem INSERT/UPDATE directo em motorista_viaturas como o utilizador
-- autenticado. RLS dessa tabela exige has_permission('motoristas_gestao'),
-- mas quem faz check-in normalmente só tem 'calendario_recolhas' — o
-- write falha silenciosamente (capturado por try/catch genérico), deixando
-- o evento de calendário já criado mas a associação motorista↔viatura por
-- fazer (estado inconsistente a meio da operação).
--
-- Fix: RPC SECURITY DEFINER que aceita quem tem 'calendario_recolhas' OU
-- 'motoristas_gestao' OU é admin — cobre o mesmo universo de quem já
-- consegue abrir o painel de check-in, sem alargar RLS da tabela.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_checkin_abrir_motorista_viatura(
  p_motorista_id uuid,
  p_viatura_id   uuid,
  p_data_inicio  date,
  p_observacoes  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := get_current_org_id();
  v_id uuid;
BEGIN
  IF NOT (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'calendario_recolhas')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para associar motorista a viatura.';
  END IF;

  INSERT INTO public.motorista_viaturas (
    motorista_id, viatura_id, data_inicio, status, org_id, observacoes
  )
  VALUES (
    p_motorista_id, p_viatura_id, p_data_inicio, 'ativo', v_org_id, p_observacoes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_checkin_abrir_motorista_viatura(uuid, uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_checkin_abrir_motorista_viatura(uuid, uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.fn_checkin_abrir_motorista_viatura(uuid, uuid, date, text) IS
  'Associa motorista a viatura em motorista_viaturas (check-in/troca legacy). '
  'Aceita motoristas_gestao OU calendario_recolhas — evita que colaboradores '
  'de check-in sem motoristas_gestao vejam o INSERT falhar silenciosamente.';

CREATE OR REPLACE FUNCTION public.fn_checkin_fechar_motorista_viatura(
  p_motorista_id uuid DEFAULT NULL,
  p_viatura_id   uuid DEFAULT NULL,
  p_data_fim     date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_viatura_id IS NULL THEN
    RAISE EXCEPTION 'p_viatura_id é obrigatório.';
  END IF;

  IF NOT (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'calendario_recolhas')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para desassociar motorista de viatura.';
  END IF;

  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, p_data_fim)
   WHERE viatura_id = p_viatura_id
     AND status = 'ativo'
     AND (p_motorista_id IS NULL OR motorista_id = p_motorista_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_checkin_fechar_motorista_viatura(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_checkin_fechar_motorista_viatura(uuid, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.fn_checkin_fechar_motorista_viatura(uuid, uuid, date) IS
  'Encerra associação motorista↔viatura em motorista_viaturas (check-in/recolha/troca legacy). '
  'Aceita motoristas_gestao OU calendario_recolhas. p_motorista_id opcional (devolução sem motorista identificado fecha por viatura_id).';
