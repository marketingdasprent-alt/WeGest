-- Km excedente no fecho do contrato.
--
-- A renovação já cobrava os km acima de kms_incluidos do ciclo que fecha; o
-- fecho gravava o km de entrada e não fazia contas — o último período de cada
-- contrato saía sem km extra. Mesma regra da renovação: limite inteiro, sem
-- proporção aos dias, km_saida da versão actual até km_entrada.
--
-- Fica no servidor porque o extra precisa de linha em renting_extras, e criá-la
-- exige viaturas_grupos — permissão que quem fecha contratos não tem de ter.

CREATE OR REPLACE FUNCTION public.lancar_km_excedente_fecho(
  p_contrato_id uuid,
  p_cobrar boolean DEFAULT true
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_c           public.contratos_renting%ROWTYPE;
  v_percorridos integer;
  v_excesso     integer;
  v_valor_km    numeric;
  v_total       numeric;
  v_extra_id    uuid;
BEGIN
  SELECT * INTO v_c FROM public.contratos_renting WHERE id = p_contrato_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;
  -- IS DISTINCT FROM: sem org activa get_current_org_id() é NULL e "<>" deixava passar.
  IF v_c.org_id IS DISTINCT FROM get_current_org_id() OR NOT has_renting_contratos_access() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_c.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato foi eliminado.';
  END IF;

  -- Uma retentativa do fecho (o fecho são vários pedidos, não uma transacção)
  -- substitui a linha anterior em vez de a duplicar.
  DELETE FROM public.contrato_extras
   WHERE contrato_id = v_c.id
     AND extra_nome LIKE 'Km excedente no fecho%';

  v_percorridos := v_c.km_entrada - v_c.km_saida;
  v_valor_km    := COALESCE(v_c.km_adicional_valor, 0);

  IF NOT p_cobrar
     OR v_percorridos IS NULL
     OR v_c.kms_incluidos IS NULL
     OR v_valor_km <= 0
     OR v_percorridos <= v_c.kms_incluidos THEN
    RETURN jsonb_build_object('km_percorridos', v_percorridos, 'km_excedente', 0, 'valor', 0);
  END IF;

  v_excesso := v_percorridos - v_c.kms_incluidos;
  v_total   := round(v_excesso * v_valor_km, 2);

  SELECT id INTO v_extra_id
    FROM public.renting_extras
   WHERE org_id = v_c.org_id AND nome = 'Km excedente'
   LIMIT 1;

  -- Inactivo ao nascer: os extras activos aparecem no catálogo da API pública.
  IF v_extra_id IS NULL THEN
    INSERT INTO public.renting_extras (org_id, nome, descricao, preco_unidade, tipo_calculo, ativo, created_by)
    VALUES (v_c.org_id, 'Km excedente',
            'Km acima do limite incluído — gerado automaticamente.',
            0, 'fixo', false, auth.uid())
    RETURNING id INTO v_extra_id;
  END IF;

  -- Quantidade 1 com o total no preço: preco_unidade tem 2 casas e o €/km pode
  -- ter 4 (0,1250 × 833 daria 108,29 em vez de 104,13 na vista dos totais).
  INSERT INTO public.contrato_extras (
    org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total, created_by
  )
  VALUES (
    v_c.org_id, v_c.id, v_extra_id,
    'Km excedente no fecho (' || v_excesso || ' km × '
      || rtrim(rtrim(to_char(v_valor_km, 'FM999990.0000'), '0'), '.') || ' €)',
    v_total, 'fixo', 1, v_total, auth.uid()
  );

  RETURN jsonb_build_object('km_percorridos', v_percorridos, 'km_excedente', v_excesso, 'valor', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.lancar_km_excedente_fecho(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lancar_km_excedente_fecho(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
