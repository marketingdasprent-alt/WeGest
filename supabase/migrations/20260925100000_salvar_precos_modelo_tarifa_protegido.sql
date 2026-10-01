-- Gravar os preços de uma tarifa deixa de apagar, sem aviso, um preço em uso.
--
-- A função apaga e reinsere todos os preços da tarifa. A 2026-09-21 a Premium
-- Ride gravou a tarifa "TVDE" sem o preço do Astra e o contrato #16 ficou sem
-- preço; só se deu por isso três dias depois, ao renovar. Agora, tirar o preço
-- de um modelo que um contrato aberto usa é recusado com a lista dos
-- contratos, e só passa com p_confirmar_remocao = true.
--
-- Era também SECURITY DEFINER sem verificar nada: qualquer utilizador
-- autenticado apagava os preços de uma tarifa de outra org sabendo o id, e o
-- org_id das linhas vinha do browser. Continua DEFINER — a verificação tem de
-- ver os contratos todos da org, mesmo com privacidade por gestor —, por isso
-- repete aqui o que o RLS da tabela exige.
--
-- A assinatura muda (parâmetro novo), por isso a antiga cai: ficarem as duas
-- tornava ambígua a chamada com dois argumentos. Cria-se a nova primeiro e só
-- depois cai a antiga — se a criação falhar, a gravação de tarifas continua.

CREATE FUNCTION public.salvar_precos_modelo_tarifa(
  p_tarifa_id uuid,
  p_linhas jsonb,
  p_confirmar_remocao boolean DEFAULT false
) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org    uuid := public.get_current_org_id();
  v_em_uso text;
BEGIN
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.renting_tarifas WHERE id = p_tarifa_id AND org_id = v_org
  ) THEN
    RAISE EXCEPTION 'Tarifa não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_edit(auth.uid(), 'viaturas_grupos') THEN
    RAISE EXCEPTION 'Sem permissão para alterar tarifas.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) AS r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.viatura_modelos m
      WHERE m.id = (r->>'modelo_id')::uuid AND m.org_id = v_org
    )
  ) THEN
    RAISE EXCEPTION 'Modelo inválido na lista de preços.' USING ERRCODE = '22023';
  END IF;

  -- "Em uso" é o preço que o contrato lê para o seu regime: semanal no TVDE,
  -- mensal no rent-a-car de longa duração, diário no resto. Só conta o que
  -- existia e deixa de existir — uma falta antiga não trava a gravação.
  WITH novas AS (
    SELECT (r->>'modelo_id')::uuid      AS modelo_id,
           (r->>'preco_semana')::numeric AS preco_semana,
           (r->>'preco_dia')::numeric    AS preco_dia,
           (r->>'preco_mes')::numeric    AS preco_mes
    FROM jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) AS r
  ),
  afectados AS (
    SELECT DISTINCT m.nome AS modelo, c.codigo, coalesce(c.matricula, v.matricula) AS matricula
    FROM public.contratos_renting c
    JOIN public.viaturas v ON v.id = c.viatura_id
    JOIN public.viatura_modelos m ON m.id = v.modelo_id
    JOIN public.renting_tarifa_precos_modelo a
      ON a.tarifa_id = p_tarifa_id AND a.modelo_id = v.modelo_id
    LEFT JOIN novas n ON n.modelo_id = v.modelo_id
    WHERE c.org_id = v_org
      AND c.tarifa_id = p_tarifa_id
      AND c.deleted_at IS NULL
      AND c.substituido_em IS NULL
      AND c.estado_operacional NOT IN ('cancelado', 'fechado')
      AND CASE
        WHEN c.regime = 'tvde' THEN a.preco_semana IS NOT NULL AND n.preco_semana IS NULL
        WHEN c.regime = 'rent_a_car' AND c.is_longa_duracao THEN a.preco_mes IS NOT NULL AND n.preco_mes IS NULL
        WHEN c.regime = 'rent_a_car' THEN a.preco_dia IS NOT NULL AND n.preco_dia IS NULL
        ELSE false
      END
  )
  SELECT string_agg(
           format('%s — contrato #%s (%s)', modelo, codigo, coalesce(matricula, 'sem matrícula')),
           '; ' ORDER BY modelo, codigo)
    INTO v_em_uso
  FROM afectados;

  -- O HINT é o sinal para o formulário pedir confirmação; a mensagem serve
  -- tal como está a quem chamar sem saber disto.
  IF v_em_uso IS NOT NULL AND NOT coalesce(p_confirmar_remocao, false) THEN
    RAISE EXCEPTION 'Preço em uso em contratos abertos: %. Se gravares, esses contratos ficam sem preço.', v_em_uso
      USING ERRCODE = 'P0001', HINT = 'confirmar_remocao_precos';
  END IF;

  DELETE FROM public.renting_tarifa_precos_modelo WHERE tarifa_id = p_tarifa_id;

  INSERT INTO public.renting_tarifa_precos_modelo (
    org_id, tarifa_id, modelo_id,
    preco_semana, km_mensal, km_adicional_valor, franquia_valor, caucao_valor,
    preco_dia, preco_mes, km_mensal_iva, km_adicional_valor_iva, franquia_valor_iva, caucao_valor_iva
  )
  SELECT
    v_org,
    p_tarifa_id,
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
  FROM jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) AS r;
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_precos_modelo_tarifa(uuid, jsonb);

ALTER FUNCTION public.salvar_precos_modelo_tarifa(uuid, jsonb, boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.salvar_precos_modelo_tarifa(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_precos_modelo_tarifa(uuid, jsonb, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
