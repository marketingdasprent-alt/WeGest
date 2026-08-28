-- ============================================================
-- M7 — Fase 2: lógica de preço e troca de condutor
-- ============================================================
-- Três funções:
--   1. calcular_valor_aluguer  — preço pelo regime (dia/mês vs semana)
--   2. trocar_condutor         — troca atómica do condutor principal
--   3. gerar_cobranca_renta_car— cria a cobrança única de um rent-a-car
-- ============================================================

-- ------------------------------------------------------------
-- 1. calcular_valor_aluguer — preço a partir da tarifa, pelo regime
-- ------------------------------------------------------------
-- rent_a_car: meses cheios × preco_mes + dias restantes × preco_dia
--             (se preco_mes for NULL → tudo a preco_dia)
-- tvde:       semanas (arredondadas p/ cima) × preco_semana
-- Devolve NULL se a tarifa ou o preço necessário não existirem.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_valor_aluguer(
  p_tarifa_id uuid,
  p_regime    public.contrato_regime_enum,
  p_dias      integer
)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tarifa  record;
  v_meses   integer;
  v_resto   integer;
  v_semanas integer;
BEGIN
  IF p_dias IS NULL OR p_dias <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_tarifa FROM public.renting_tarifas WHERE id = p_tarifa_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- TVDE → semanal
  IF p_regime = 'tvde' THEN
    IF v_tarifa.preco_semana IS NULL THEN
      RETURN NULL;
    END IF;
    v_semanas := ceil(p_dias / 7.0);
    RETURN round(v_semanas * v_tarifa.preco_semana, 2);
  END IF;

  -- rent_a_car → mensal + diário
  IF v_tarifa.preco_dia IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_tarifa.preco_mes IS NOT NULL THEN
    v_meses := p_dias / 30;     -- divisão inteira
    v_resto := p_dias % 30;
    RETURN round(v_meses * v_tarifa.preco_mes + v_resto * v_tarifa.preco_dia, 2);
  END IF;

  RETURN round(p_dias * v_tarifa.preco_dia, 2);
END;
$$;

COMMENT ON FUNCTION public.calcular_valor_aluguer(uuid, public.contrato_regime_enum, integer) IS
  'Valor do aluguer (sem IVA) a partir da tarifa e do regime. '
  'rent_a_car = meses×preco_mes + dias×preco_dia; tvde = semanas×preco_semana.';

GRANT EXECUTE ON FUNCTION public.calcular_valor_aluguer(uuid, public.contrato_regime_enum, integer) TO authenticated;

-- ------------------------------------------------------------
-- 2. trocar_condutor — troca atómica do condutor principal
-- ------------------------------------------------------------
-- Fecha a vigência do condutor atual em p_data_troca e abre um
-- novo condutor principal a partir dessa data. O contrato não é
-- tocado. Atómico (corre numa transação).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trocar_condutor(
  p_contrato_id     uuid,
  p_novo_cliente_id uuid,
  p_data_troca      timestamptz DEFAULT now(),
  p_motivo          text DEFAULT 'Troca de condutor'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_atual   record;
  v_novo_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contratos_renting WHERE id = p_contrato_id) THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;

  -- Condutor principal vigente
  SELECT * INTO v_atual
  FROM public.contrato_condutores
  WHERE contrato_id = p_contrato_id
    AND is_principal = true
    AND data_fim IS NULL
  LIMIT 1;

  IF FOUND THEN
    IF v_atual.cliente_id = p_novo_cliente_id THEN
      RAISE EXCEPTION 'O novo condutor é igual ao condutor atual.';
    END IF;
    -- Fecha a vigência do condutor atual (primeiro, para não sobrepor)
    UPDATE public.contrato_condutores
       SET data_fim = p_data_troca, motivo_fim = p_motivo
     WHERE id = v_atual.id;
  END IF;

  -- Abre o novo condutor principal (org_id preenchido por trigger)
  INSERT INTO public.contrato_condutores
    (contrato_id, cliente_id, is_principal, data_inicio)
  VALUES
    (p_contrato_id, p_novo_cliente_id, true, p_data_troca)
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

COMMENT ON FUNCTION public.trocar_condutor(uuid, uuid, timestamptz, text) IS
  'Troca atómica do condutor principal de um contrato — fecha a vigência do '
  'atual e abre a do novo, sem cancelar o contrato.';

GRANT EXECUTE ON FUNCTION public.trocar_condutor(uuid, uuid, timestamptz, text) TO authenticated;

-- ------------------------------------------------------------
-- 3. gerar_cobranca_renta_car — cobrança única de um rent-a-car
-- ------------------------------------------------------------
-- Cria a linha de contrato_cobrancas do aluguer todo, ao cliente,
-- com o valor calculado pela tarifa. (TVDE usa o job semanal.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_cobranca_renta_car(p_contrato_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contrato    record;
  v_cliente     record;
  v_tarifa      record;
  v_dias        integer;
  v_valor       numeric;
  v_cobranca_id uuid;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_renting WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;
  IF v_contrato.regime <> 'rent_a_car' THEN
    RAISE EXCEPTION 'Função só para contratos rent_a_car — TVDE usa gerar_cobrancas_tvde_semanais().';
  END IF;
  IF v_contrato.data_fim IS NULL THEN
    RAISE EXCEPTION 'Contrato rent_a_car sem data de fim.';
  END IF;
  IF v_contrato.tarifa_id IS NULL THEN
    RAISE EXCEPTION 'Contrato sem tarifa definida.';
  END IF;

  v_dias  := (v_contrato.data_fim::date - v_contrato.data_inicio::date);
  v_valor := public.calcular_valor_aluguer(v_contrato.tarifa_id, 'rent_a_car', v_dias);
  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'Não foi possível calcular o valor — verifique os preços da tarifa.';
  END IF;

  SELECT * INTO v_cliente FROM public.clientes        WHERE id = v_contrato.cliente_id;
  SELECT * INTO v_tarifa  FROM public.renting_tarifas WHERE id = v_contrato.tarifa_id;

  INSERT INTO public.contrato_cobrancas (
    contrato_id, periodo_de, periodo_ate, descricao,
    destinatario_id, destinatario_papel, destinatario_nome,
    tarifa_id, tarifa_nome,
    valor_sem_iva, taxa_iva, emite_fatura_fiscal, estado
  )
  VALUES (
    v_contrato.id, v_contrato.data_inicio::date, v_contrato.data_fim::date,
    'Aluguer ' || to_char(v_contrato.data_inicio::date, 'DD/MM/YYYY') ||
          ' a ' || to_char(v_contrato.data_fim::date,   'DD/MM/YYYY'),
    v_contrato.cliente_id, 'cliente', v_cliente.nome,
    v_contrato.tarifa_id, v_tarifa.nome,
    v_valor, COALESCE(v_contrato.taxa_iva, 23), true, 'pendente'
  )
  ON CONFLICT (contrato_id, destinatario_id, periodo_de, periodo_ate) DO NOTHING
  RETURNING id INTO v_cobranca_id;

  IF v_cobranca_id IS NULL THEN
    RAISE EXCEPTION 'Já existe uma cobrança para este contrato e período.';
  END IF;

  RETURN v_cobranca_id;
END;
$$;

COMMENT ON FUNCTION public.gerar_cobranca_renta_car(uuid) IS
  'Gera a cobrança única (todo o período) de um contrato rent_a_car, ao cliente.';

GRANT EXECUTE ON FUNCTION public.gerar_cobranca_renta_car(uuid) TO authenticated;
