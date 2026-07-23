-- ============================================================
-- Edição de contrato: fechar a versão antiga (como a renovação)
-- ============================================================
-- Ao criar uma nova versão por EDIÇÃO (criar_versao_contrato_renting), a
-- versão antiga ficava marcada `substituido_em` mas com o estado operacional
-- ATIVO (agendado/em_curso). Como o trigger de imutabilidade
-- (fn_contratos_renting_versao_imutavel) congela versões substituídas, ela
-- ficava presa nesse estado "aberto" — e a página dela ainda mostrava
-- "Fechar contrato…" (botão que até dava erro de imutabilidade se clicado).
--
-- A RENOVAÇÃO já fecha a versão antiga (estado_operacional = 'cancelado') na
-- MESMA operação em que a marca substituída — nesse instante OLD.substituido_em
-- ainda é NULL, por isso o trigger de imutabilidade deixa passar. A edição
-- esquecia-se de o fazer. Este fix alinha a edição com a renovação.
--
-- Seguro: o trigger que inativa o motorista salta versões substituídas
-- (NEW.substituido_em IS NOT NULL → RETURN NEW), por isso fechar a versão
-- antiga NÃO inativa o condutor (que continua no contrato sucessor). A
-- disponibilidade da viatura é recalculada pelo trigger normal.
-- ============================================================

-- ── 1) Origem: a edição passa a fechar a versão antiga ───────────────────────
CREATE OR REPLACE FUNCTION public.criar_versao_contrato_renting(p_contrato_id uuid, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old             contratos_renting%ROWTYPE;
  v_new_id          uuid;
  v_user_id         uuid := auth.uid();
BEGIN
  SELECT * INTO v_old
    FROM public.contratos_renting
   WHERE id = p_contrato_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;

  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Não podes versionar um contrato eliminado.';
  END IF;

  IF v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi substituído. Versiona a versão actual.';
  END IF;

  IF v_old.estado_financeiro = 'facturado' THEN
    RAISE EXCEPTION 'Não podes versionar um contrato facturado. Anula a factura primeiro.';
  END IF;

  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  -- Fecha a versão antiga NA MESMA operação em que a marca substituída
  -- (OLD.substituido_em ainda é NULL aqui → o trigger de imutabilidade deixa).
  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'cancelado'::contrato_estado_operacional_enum,
         updated_by         = v_user_id
   WHERE id = v_old.id;

  INSERT INTO public.contratos_renting (
    org_id, codigo, reserva_id, transferista_id, cliente_id, viatura_id, matricula, grupo,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim,
    estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
    voucher_codigo, numero_processo, voo_referencia,
    local_entrega, local_recolha, comentarios_entrega, comentarios_recolha,
    observacoes, observacoes_internas,
    versao, contrato_anterior_id, motivo_versao,
    created_by
  )
  VALUES (
    v_old.org_id, v_old.codigo, v_old.reserva_id, v_old.transferista_id, v_old.cliente_id,
    v_old.viatura_id, v_old.matricula, v_old.grupo,
    v_old.estacao_entrega_id, v_old.data_inicio, v_old.estacao_recolha_id, v_old.data_fim,
    v_old.estacao_origem_viatura_id,
    v_old.estado_operacional, 'pendente', v_old.origem, v_old.regime,
    v_old.tarifa_diaria, v_old.desconto_percentagem, v_old.taxa_iva, v_old.valor_total_manual,
    v_old.is_longa_duracao, v_old.renovacao_opcao, v_old.renovacao_intervalo_dias,
    v_old.franquia_valor, v_old.caucao_valor, v_old.kms_incluidos, v_old.km_adicional_valor,
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id, p_motivo,
    v_user_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.contrato_condutores (
    org_id, contrato_id, cliente_id, motorista_id, is_principal
  )
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores
   WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_coberturas (
    org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
  )
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas
   WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_extras (
    org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
  )
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras
   WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_taxas (
    org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
  )
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas
   WHERE contrato_id = v_old.id;

  RETURN v_new_id;
END;
$function$;

-- Nota: o backfill das versões antigas que ficaram "abertas" está na migração
-- seguinte (…_backfill_fecha_versoes_substituidas), à parte por precisar de
-- desligar temporariamente o trigger de imutabilidade.
