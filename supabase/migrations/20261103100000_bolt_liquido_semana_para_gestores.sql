-- A Bolt da semana lida pelo separador Resumos da ficha do motorista.
--
-- bolt_resumos_semanais só deixa ler quem tem financeiro_recibos (can_view_financeiro),
-- ao contrário da Uber, que é legível por toda a organização. Um gestor sem essa
-- permissão via a Bolt a 0,00 € (03/11/2026: 689,27 € para a Ines, 185,90 € para o
-- Juliano, mesmo motorista e semana) e, ao abrir "Ver Resumo", gravava esse líquido
-- errado. Esta função dá-lhe o mesmo número, só o total, a quem pode ver a ficha.

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
      EXISTS (SELECT 1 FROM motoristas m
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

COMMENT ON FUNCTION public.motorista_bolt_liquido_semana(uuid, date, date) IS
  'Total Bolt (liquido_a_pagar) do motorista no período, para quem pode ver a ficha mesmo sem financeiro_recibos. Só devolve o total, não as linhas.';

REVOKE ALL ON FUNCTION public.motorista_bolt_liquido_semana(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.motorista_bolt_liquido_semana(uuid, date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
