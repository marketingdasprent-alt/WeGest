-- ============================================================
-- Feature: KMs na renovação de contratos Rent-a-Car (longa duração)
-- ============================================================
-- Ao renovar um contrato rent-a-car de longa duração, o gestor passa a
-- registar os km:
--   • km_inicio = km da viatura no início do mês que fecha (o mês 1 começa
--     com X; cada mês seguinte começa com o km final do mês anterior).
--   • km_fim    = km atual da viatura na renovação (fim desse mês).
--
-- Efeitos:
--   1. O contrato que fecha grava km_saida (início) e km_entrada (fim).
--   2. A viatura atualiza o odómetro (km_atual = km_fim), nunca para trás.
--   3. O contrato NOVO começa com km_saida = km_fim (continuidade).
--   4. Se os km percorridos no mês (km_fim - km_inicio) excederem o limite
--      mensal do contrato (kms_incluidos), calcula-se o excesso × preço por
--      km extra (km_adicional_valor) e adiciona-se uma LINHA discriminada
--      "Km excedente" aos extras do mês que fecha — entra automaticamente no
--      total desse mês quando é faturado (decisão do dono do produto).
--
-- A linha de km extra refere um extra de catálogo "Km excedente" por org
-- (get-or-create), para respeitar o FK contrato_extras.extra_id (NOT NULL) e
-- aparecer como um extra normal. tipo_calculo='fixo' → total = preço × qty
-- (sem multiplicar por dias), exatamente o valor do excesso.
--
-- A assinatura passa a (uuid, integer, integer) com os km opcionais (default
-- NULL) — sem km, comporta-se como a renovação antiga (retrocompatível). A
-- versão de 1 argumento é removida para não haver ambiguidade no PostgREST.
-- ============================================================

DROP FUNCTION IF EXISTS public.renovar_contrato_renting(uuid);

CREATE OR REPLACE FUNCTION public.renovar_contrato_renting(
  p_contrato_id uuid,
  p_km_inicio   integer DEFAULT NULL,
  p_km_fim      integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old            public.contratos_renting%ROWTYPE;
  v_user_id        uuid := auth.uid();
  v_new_id         uuid;
  v_inicio         timestamptz;
  v_fim            timestamptz;
  v_km_percorridos integer;
  v_km_limite      integer;
  v_km_valor       numeric;
  v_km_excesso     integer;
  v_km_total       numeric;
  v_extra_km_id    uuid;
BEGIN
  SELECT * INTO v_old FROM public.contratos_renting WHERE id = p_contrato_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato foi eliminado.';
  END IF;
  IF v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi renovado/substituído. Renova a versão actual.';
  END IF;
  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;
  IF v_old.regime <> 'rent_a_car' THEN
    RAISE EXCEPTION 'A renovação só se aplica a contratos Rent-a-Car.';
  END IF;
  IF NOT COALESCE(v_old.is_longa_duracao, false) THEN
    RAISE EXCEPTION 'A renovação só se aplica a contratos de longa duração.';
  END IF;
  IF v_old.data_fim IS NULL THEN
    RAISE EXCEPTION 'Contrato sem data de fim — não é possível calcular o novo período.';
  END IF;
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL AND p_km_fim < p_km_inicio THEN
    RAISE EXCEPTION 'O km final (%) não pode ser inferior ao km inicial (%).', p_km_fim, p_km_inicio;
  END IF;

  v_inicio := v_old.data_fim;
  v_fim    := public.proxima_data_renovacao(
                v_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

  -- 1) Marca a versão actual como substituída ANTES de inserir a nova, e
  --    grava os km do mês que fecha (saída = início, entrada = fim).
  UPDATE public.contratos_renting
     SET substituido_em = now(),
         updated_by     = v_user_id,
         km_saida       = COALESCE(p_km_inicio, km_saida),
         km_entrada     = COALESCE(p_km_fim, km_entrada)
   WHERE id = v_old.id;

  -- 2) Atualiza o odómetro da viatura (só para a frente).
  IF p_km_fim IS NOT NULL AND v_old.viatura_id IS NOT NULL THEN
    UPDATE public.viaturas
       SET km_atual = p_km_fim
     WHERE id = v_old.viatura_id
       AND (km_atual IS NULL OR p_km_fim >= km_atual);
  END IF;

  -- 3) Cria o novo contrato (mês seguinte). km_saida = km_fim (continuidade);
  --    km_entrada fica NULL até à próxima renovação.
  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, emissor_id, gestor_id,
    viatura_id, matricula, grupo,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim, estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, tarifa_id, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
    km_saida,
    voucher_codigo, numero_processo, voo_referencia,
    local_entrega, local_recolha, comentarios_entrega, comentarios_recolha,
    observacoes, observacoes_internas,
    versao, contrato_anterior_id, motivo_versao,
    created_by
  )
  VALUES (
    v_old.org_id, v_old.reserva_id, v_old.transferista_id, v_old.cliente_id, v_old.emissor_id, v_old.gestor_id,
    v_old.viatura_id, v_old.matricula, v_old.grupo,
    v_old.estacao_entrega_id, v_inicio, v_old.estacao_recolha_id, v_fim, v_old.estacao_origem_viatura_id,
    v_old.estado_operacional, 'pendente', v_old.origem, v_old.regime,
    v_old.tarifa_diaria, v_old.tarifa_id, v_old.desconto_percentagem, v_old.taxa_iva, v_old.valor_total_manual,
    v_old.is_longa_duracao, v_old.renovacao_opcao, v_old.renovacao_intervalo_dias,
    v_old.franquia_valor, v_old.caucao_valor, v_old.kms_incluidos, v_old.km_adicional_valor,
    p_km_fim,
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id,
    'Renovação — período de ' || to_char(v_inicio, 'YYYY-MM-DD') || ' a ' || to_char(v_fim, 'YYYY-MM-DD'),
    v_user_id
  ) RETURNING id INTO v_new_id;

  -- 4) Copia relações para o novo mês (extras copiados aqui NÃO incluem a
  --    linha de km extra — essa é do mês que fecha e só é criada no passo 5).
  INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas WHERE contrato_id = v_old.id;

  -- 5) Km excedente do mês que fecha → linha discriminada nos extras do mês
  --    que fecha (v_old), para entrar no total quando esse mês for faturado.
  -- Só há km extra a faturar quando existe um limite mensal DEFINIDO
  -- (kms_incluidos NOT NULL). Sem limite = km ilimitados = sem cobrança —
  -- senão cobrar-se-iam TODOS os km percorridos, o que seria uma surpresa.
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL
     AND v_old.kms_incluidos IS NOT NULL THEN
    v_km_percorridos := p_km_fim - p_km_inicio;
    v_km_limite      := v_old.kms_incluidos;
    v_km_valor       := COALESCE(v_old.km_adicional_valor, 0);

    IF v_km_percorridos > v_km_limite AND v_km_valor > 0 THEN
      v_km_excesso := v_km_percorridos - v_km_limite;
      v_km_total   := v_km_excesso * v_km_valor;

      -- get-or-create do extra de catálogo "Km excedente" da org
      SELECT id INTO v_extra_km_id
        FROM public.renting_extras
       WHERE org_id = v_old.org_id AND nome = 'Km excedente'
       LIMIT 1;

      IF v_extra_km_id IS NULL THEN
        INSERT INTO public.renting_extras (org_id, nome, descricao, preco_unidade, tipo_calculo, ativo, created_by)
        VALUES (v_old.org_id, 'Km excedente',
                'Km acima do limite mensal — gerado automaticamente na renovação.',
                0, 'fixo', true, v_user_id)
        RETURNING id INTO v_extra_km_id;
      END IF;

      INSERT INTO public.contrato_extras (
        org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
      )
      VALUES (
        v_old.org_id, v_old.id, v_extra_km_id,
        'Km excedente (' || v_km_excesso || ' km × ' || to_char(v_km_valor, 'FM999990.00') || ' €)',
        v_km_valor, 'fixo', v_km_excesso, v_km_total
      );
    END IF;
  END IF;

  -- Remove entrega/recolha auto-gerados: numa renovação não há handover físico.
  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.renovar_contrato_renting(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_contrato_renting(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.renovar_contrato_renting(uuid, integer, integer) IS
  'Renova um contrato rent-a-car de longa duração para o mês seguinte, '
  'registando os km (saída/entrada) do mês que fecha, atualizando o odómetro '
  'da viatura, encadeando o km inicial do novo mês e — se os km percorridos '
  'excederem o limite mensal — adicionando uma linha "Km excedente" aos extras '
  'do mês que fecha. Km opcionais (retrocompatível). Fix 2026-07-15.';
