-- ============================================================================
-- Renovação de contratos de renting (Rent-a-Car, longa duração)
-- ============================================================================
-- Renovar = fechar o mês actual e abrir o mês seguinte (a "mensalidade"):
--   * o contrato actual passa a histórico (substituido_em = now()) — congelado;
--   * é criado um novo contrato, encadeado (contrato_anterior_id), com o código
--     mais recente (IDENTITY), período AVANÇADO para o mês seguinte e estado
--     financeiro 'pendente' (por faturar);
--   * copia condutores/coberturas/extras/taxas, tal como a criação de versão.
--
-- Ao contrário da criação de versão (upgrade/downgrade, mesmas datas), a renovação
-- AVANÇA o período (data_inicio = fim do actual; data_fim = próxima renovação) e
-- NÃO bloqueia contratos facturados (o mês que termina foi/será faturado).
--
-- Só se aplica a rent_a_car + is_longa_duracao. Não altera o estado_operacional do
-- contrato antigo, de propósito: mudá-lo dispararia cascatas (inativar motorista,
-- cancelar reserva, apagar eventos) — erradas numa renovação, em que a viatura
-- continua com o cliente. O "fechado" é tratado na apresentação (histórico).
-- ============================================================================

-- Próxima data de renovação (fim do período) a partir da data de início e da
-- opção de longa duração. Espelha a lógica do frontend (ReservaTabGeral):
--   mesmo_dia_cada_mes → + 1 mês (mesmo dia)
--   primeiro_dia_mes   → 1.º dia do mês seguinte
--   intervalo_dias / — → + N dias (default 30)
CREATE OR REPLACE FUNCTION public.proxima_data_renovacao(
  p_inicio    timestamptz,
  p_opcao     text,
  p_intervalo integer
) RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_opcao = 'mesmo_dia_cada_mes' THEN p_inicio + interval '1 month'
    WHEN p_opcao = 'primeiro_dia_mes'   THEN date_trunc('month', p_inicio) + interval '1 month'
    ELSE p_inicio + (COALESCE(NULLIF(p_intervalo, 0), 30) || ' days')::interval
  END;
$$;

COMMENT ON FUNCTION public.proxima_data_renovacao(timestamptz, text, integer) IS
  'Próxima data de renovação (fim do período mensal) de um contrato de longa duração.';

CREATE OR REPLACE FUNCTION public.renovar_contrato_renting(p_contrato_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old     public.contratos_renting%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_new_id  uuid;
  v_inicio  timestamptz;
  v_fim     timestamptz;
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

  -- Novo período: começa no fim do actual (data de renovação) e vai até à
  -- próxima renovação, segundo a opção de longa duração.
  v_inicio := v_old.data_fim;
  v_fim    := public.proxima_data_renovacao(
                v_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

  -- 1) Marca a versão actual como substituída ANTES de inserir a nova (liberta o
  --    slot do índice único parcial uq_contratos_renting_reserva_id_active).
  --    NÃO mexe no estado_operacional para não disparar cascatas indesejadas.
  UPDATE public.contratos_renting
     SET substituido_em = now(),
         updated_by     = v_user_id
   WHERE id = v_old.id;

  -- 2) Cria o novo contrato (mês seguinte): por faturar, código novo, encadeado.
  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, emissor_id, gestor_id,
    viatura_id, matricula, grupo,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim, estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, tarifa_id, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
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
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id,
    'Renovação — período de ' || to_char(v_inicio, 'YYYY-MM-DD') || ' a ' || to_char(v_fim, 'YYYY-MM-DD'),
    v_user_id
  ) RETURNING id INTO v_new_id;

  -- 3) Copia condutores
  INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores WHERE contrato_id = v_old.id;

  -- 4) Copia coberturas (snapshot)
  INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

  -- 5) Copia extras (snapshot)
  INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras WHERE contrato_id = v_old.id;

  -- 6) Copia taxas (snapshot)
  INSERT INTO public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas WHERE contrato_id = v_old.id;

  -- 7) Remove os eventos de entrega/recolha auto-gerados (cascata_open) para o
  --    novo contrato: numa renovação a viatura continua com o cliente, não há
  --    entrega nem recolha física. A recolha real acontece ao fechar o contrato.
  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.renovar_contrato_renting(uuid) IS
  'Renova um contrato rent-a-car de longa duração: fecha o actual (histórico) e cria o mês seguinte por faturar, com código novo.';

REVOKE ALL ON FUNCTION public.renovar_contrato_renting(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_contrato_renting(uuid) TO authenticated;
