-- Corrige 20261103100000: a função conferia o motorista na tabela `motoristas`,
-- mas as fichas vivem em `motoristas_ativos`. Resultado: recusava toda a gente,
-- admin incluído, e o resumo do motorista aparecia a zeros (03/11/2026).

CREATE OR REPLACE FUNCTION public.motorista_bolt_liquido_semana(
  p_motorista_id uuid, p_inicio date, p_fim date
) RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR (
      EXISTS (SELECT 1 FROM motoristas_ativos m
               WHERE m.id = p_motorista_id AND m.org_id = get_current_org_id())
      AND (
        has_permission(auth.uid(), 'motoristas_ver')
        OR has_permission(auth.uid(), 'motoristas_gestao')
        OR can_view_financeiro()
      )
    )
  ) THEN
    RAISE EXCEPTION 'sem permissao para ver a Bolt deste motorista'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(b.liquido_a_pagar), 0)::numeric
      FROM bolt_resumos_semanais b
     WHERE b.motorista_id = p_motorista_id
       AND b.periodo_inicio <= p_fim
       AND COALESCE(b.periodo_fim, b.periodo_inicio) >= p_inicio
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
