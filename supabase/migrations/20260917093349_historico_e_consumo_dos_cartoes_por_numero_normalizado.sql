-- ============================================================
-- Histórico e consumo dos cartões de frota comparam o número normalizado
-- ============================================================
-- O QUE ESTAVA MAL
--
-- `get_cartao_historico_consumo` e `get_cartoes_consumo` comparavam o número
-- do cartão à letra: `t.card_number = p_numero`. Só que os três lados nunca
-- escreveram o número da mesma forma:
--
--   · cartoes_frota.numero        → 2 a 5 dígitos ("0018", "27224")
--   · repsol_transacoes.card_number → 16 dígitos ("9724998565240018")
--   · edp_transacoes.card_number    → "PTEDPC5000000000028906"
--   · bp_transacoes.raw_data->>'Nº cartão' → sem zeros à esquerda ("55")
--
-- Em prod, a 2026-09-17, ZERO cartões batiam à letra em qualquer das três
-- redes. Consequência visível: o botão "Histórico" dizia sempre "Sem
-- transações registadas", a coluna "Consumo (mês)" estava toda a "—" e o KPI
-- "Consumo do mês" marcava 0,00 €.
--
-- A migração de 2026-08-25 (atribuição por datas) já tinha criado
-- `normalizar_numero_cartao` (últimos 4 dígitos, com zeros à esquerda) e
-- passado atribuições, recálculo e ficha do cartão a usá-la. Estas duas RPCs
-- ficaram para trás com a comparação antiga.
--
-- O QUE MUDA
--
--   · As duas funções passam a comparar/agrupar por
--     `normalizar_numero_cartao(...)` dos dois lados.
--   · `get_cartoes_consumo` devolve o número JÁ normalizado, para o frontend
--     poder fazer a chave `tipo|numero` sem adivinhar formatos. O frontend
--     normaliza `cartoes_frota.numero` do lado dele com a mesma regra.
--
-- Verificado em prod antes de aplicar: nenhum par de cartões da mesma
-- organização e rede colide depois de normalizado (incl. cancelados).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cartao_historico_consumo(p_tipo text, p_numero text)
RETURNS TABLE(
  transaction_date timestamp with time zone,
  amount numeric,
  station_name text,
  fuel_type text,
  quantity numeric,
  motorista_nome text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.transaction_date, t.amount, t.station_name, t.fuel_type, t.quantity,
         m.nome
  FROM public.bp_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'bp'
    AND public.normalizar_numero_cartao(t.raw_data->>'Nº cartão')
        = public.normalizar_numero_cartao(p_numero)
    AND t.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  UNION ALL
  SELECT t.transaction_date, t.amount, t.station_name, t.fuel_type, t.quantity,
         m.nome
  FROM public.repsol_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'repsol'
    AND public.normalizar_numero_cartao(t.card_number)
        = public.normalizar_numero_cartao(p_numero)
    AND t.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  UNION ALL
  SELECT t.transaction_date, t.amount, t.station_name, NULL::text, t.quantity,
         m.nome
  FROM public.edp_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'edp'
    AND public.normalizar_numero_cartao(t.card_number)
        = public.normalizar_numero_cartao(p_numero)
    AND t.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  ORDER BY transaction_date DESC
  LIMIT 200
$function$;

COMMENT ON FUNCTION public.get_cartao_historico_consumo(text, text) IS
  'Movimentos de um cartão de frota (BP/Repsol/EDP). O número compara-se normalizado (normalizar_numero_cartao) porque cada rede grava o cartão num formato diferente.';

CREATE OR REPLACE FUNCTION public.get_cartoes_consumo(p_desde timestamp with time zone, p_ate timestamp with time zone)
RETURNS TABLE(tipo text, numero text, total numeric, litros numeric, n integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'bp'::text, public.normalizar_numero_cartao(t.raw_data->>'Nº cartão'),
         sum(t.amount), sum(t.quantity), count(*)::int
  FROM public.bp_transacoes t
  WHERE t.org_id = public.get_current_org_id()
    AND t.transaction_date >= p_desde AND t.transaction_date < p_ate
    AND public.normalizar_numero_cartao(t.raw_data->>'Nº cartão') IS NOT NULL
  GROUP BY 2
  UNION ALL
  SELECT 'repsol'::text, public.normalizar_numero_cartao(t.card_number),
         sum(t.amount), sum(t.quantity), count(*)::int
  FROM public.repsol_transacoes t
  WHERE t.org_id = public.get_current_org_id()
    AND t.transaction_date >= p_desde AND t.transaction_date < p_ate
    AND public.normalizar_numero_cartao(t.card_number) IS NOT NULL
  GROUP BY 2
  UNION ALL
  SELECT 'edp'::text, public.normalizar_numero_cartao(t.card_number),
         sum(t.amount), sum(t.quantity), count(*)::int
  FROM public.edp_transacoes t
  WHERE t.org_id = public.get_current_org_id()
    AND t.transaction_date >= p_desde AND t.transaction_date < p_ate
    AND public.normalizar_numero_cartao(t.card_number) IS NOT NULL
  GROUP BY 2
$function$;

COMMENT ON FUNCTION public.get_cartoes_consumo(timestamptz, timestamptz) IS
  'Consumo por cartão num intervalo. Devolve `numero` já normalizado (últimos 4 dígitos) para o frontend cruzar com cartoes_frota.numero pela mesma regra.';

NOTIFY pgrst, 'reload schema';
