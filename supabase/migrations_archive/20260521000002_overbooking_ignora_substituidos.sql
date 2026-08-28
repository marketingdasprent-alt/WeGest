-- ============================================================
-- Fix 1: EXCLUDE de overbooking ignora versões substituídas
-- Fix 2: RPC criar_versao reordena (marca antiga primeiro)
-- ============================================================
-- Bug: ao criar v2 com mesma viatura+período da v1, o EXCLUDE
-- `contratos_no_overbooking` dispara 23P01 porque:
--   (a) o filtro WHERE não excluía versões substituídas
--   (b) a RPC inseria a v2 ANTES de marcar v1 como substituída
--
-- Esta migration resolve ambas:
--   1. Recria o EXCLUDE com `substituido_em IS NULL` no filtro
--   2. Recria a RPC com a ordem certa: UPDATE v1 → INSERT v2
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) EXCLUDE actualizado
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.contratos_renting
  DROP CONSTRAINT IF EXISTS contratos_no_overbooking;

ALTER TABLE public.contratos_renting
  ADD CONSTRAINT contratos_no_overbooking
  EXCLUDE USING gist (
    org_id     WITH =,
    viatura_id WITH =,
    periodo    WITH &&
  ) WHERE (
    deleted_at IS NULL
    AND substituido_em IS NULL
    AND estado_operacional IN ('agendado', 'em_curso')
  );

COMMENT ON CONSTRAINT contratos_no_overbooking ON public.contratos_renting IS
  'Anti-overbooking: viatura não pode estar em 2 contratos activos sobrepostos. '
  'Ignora soft-deleted e versões substituídas (são histórico).';

-- ────────────────────────────────────────────────────────────
-- 2) RPC com ordem correcta
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_versao_contrato_renting(
  p_contrato_id uuid,
  p_motivo      text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- 1) Marca a antiga como substituída PRIMEIRO. Sai do espaço de
  --    unicidade do EXCLUDE anti-overbooking, libertando viatura+período
  --    para a nova versão.
  UPDATE public.contratos_renting
     SET substituido_em = now(),
         updated_by     = v_user_id
   WHERE id = v_old.id;

  -- 2) Cria a nova linha (clone, sem snapshots de total nem facturado_em)
  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, viatura_id, matricula, grupo,
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
    v_old.org_id, v_old.reserva_id, v_old.transferista_id, v_old.cliente_id,
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

  -- 3) Copia condutores
  INSERT INTO public.contrato_condutores (
    org_id, contrato_id, cliente_id, motorista_id, is_principal
  )
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores
   WHERE contrato_id = v_old.id;

  -- 4) Copia coberturas
  INSERT INTO public.contrato_coberturas (
    org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
  )
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas
   WHERE contrato_id = v_old.id;

  -- 5) Copia extras
  INSERT INTO public.contrato_extras (
    org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
  )
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras
   WHERE contrato_id = v_old.id;

  -- 6) Copia taxas
  INSERT INTO public.contrato_taxas (
    org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
  )
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas
   WHERE contrato_id = v_old.id;

  RETURN v_new_id;
END;
$$;
