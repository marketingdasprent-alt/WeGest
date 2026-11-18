-- Gorjeta Bolt da semana para a ficha do motorista.
--
-- motorista_bolt_liquido_semana só devolve o total. A ficha precisa também da
-- gorjeta porque o corte sem recibo verde não incide sobre ela: sem este valor
-- a ficha mostrava 394,27 € e o Resumo Financeiro 394,38 € (Walter Dias Souza,
-- 09-15/11/2026, 2,00 € de gorjeta Bolt). Mesmas permissões da função do total.

CREATE OR REPLACE FUNCTION public.motorista_bolt_gorjeta_semana(
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
    SELECT COALESCE(SUM(b.gorjetas), 0)::numeric
      FROM bolt_resumos_semanais b
     WHERE b.motorista_id = p_motorista_id
       AND b.periodo_inicio <= p_fim
       AND COALESCE(b.periodo_fim, b.periodo_inicio) >= p_inicio
  );
END;
$function$;

COMMENT ON FUNCTION public.motorista_bolt_gorjeta_semana(uuid, date, date) IS
  'Gorjeta Bolt do motorista no período, para quem pode ver a ficha mesmo sem financeiro_recibos. Só devolve o total, não as linhas.';

REVOKE ALL ON FUNCTION public.motorista_bolt_gorjeta_semana(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.motorista_bolt_gorjeta_semana(uuid, date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
