-- ============================================================
-- salvar_precos_modelo_tarifa — delete+insert atómico
-- ============================================================
-- Minor pendente da auditoria: RentingTarifaForm.tsx fazia
-- `delete().eq('tarifa_id', ...)` seguido de `insert(linhas)` como duas
-- chamadas Supabase separadas — se o insert falhasse (rede, constraint),
-- o delete já tinha comitado e a tarifa ficava sem nenhum preço por-modelo.
-- Esta RPC faz as duas coisas dentro de uma única transacção de função
-- Postgres — ou grava tudo, ou nada muda.
-- ============================================================

CREATE OR REPLACE FUNCTION public.salvar_precos_modelo_tarifa(p_tarifa_id uuid, p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.renting_tarifa_precos_modelo WHERE tarifa_id = p_tarifa_id;

  INSERT INTO public.renting_tarifa_precos_modelo (
    org_id, tarifa_id, modelo_id,
    preco_semana, km_mensal, km_adicional_valor, franquia_valor, caucao_valor,
    preco_dia, preco_mes, km_mensal_iva, km_adicional_valor_iva, franquia_valor_iva, caucao_valor_iva
  )
  SELECT
    (r->>'org_id')::uuid,
    (r->>'tarifa_id')::uuid,
    (r->>'modelo_id')::uuid,
    (r->>'preco_semana')::numeric,
    (r->>'km_mensal')::integer,
    (r->>'km_adicional_valor')::numeric,
    (r->>'franquia_valor')::numeric,
    (r->>'caucao_valor')::numeric,
    (r->>'preco_dia')::numeric,
    (r->>'preco_mes')::numeric,
    (r->>'km_mensal_iva')::integer,
    (r->>'km_adicional_valor_iva')::numeric,
    (r->>'franquia_valor_iva')::numeric,
    (r->>'caucao_valor_iva')::numeric
  FROM jsonb_array_elements(p_linhas) AS r;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.salvar_precos_modelo_tarifa(uuid, jsonb) TO authenticated;
