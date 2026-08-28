-- ============================================================
-- Fix: gerar_cobrancas_tvde_semanais() não gerava NENHUMA cobrança
-- ============================================================
-- Desde a migration 20260708140000 (tarifas TVDE com preço por modelo),
-- uma tarifa tvde deixou de ter preco_semana preenchido na própria linha
-- de renting_tarifas — o preço passou a estar em
-- renting_tarifa_precos_modelo, por (tarifa_id, modelo_id).
--
-- Esta função só olhava para v_tarifa.preco_semana (sempre NULL para
-- tarifas tvde) e por isso a condição `IF FOUND AND v_tarifa.preco_semana
-- IS NOT NULL` nunca era verdadeira — NENHUM contrato TVDE gerava
-- cobrança semanal desde então (confirmado: 121 contratos TVDE ativos,
-- 0 cobranças).
--
-- Fix: resolve o preço via renting_tarifa_precos_modelo (tarifa_id +
-- modelo_id da viatura do contrato) quando a tarifa não tem preço direto.
-- Não altera o comportamento para tarifas rent-a-car (continuam a usar
-- preco_semana diretamente).
-- ============================================================

CREATE OR REPLACE FUNCTION public.gerar_cobrancas_tvde_semanais(
  p_semanas_a_frente integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato      record;
  v_condutor      record;
  v_tarifa        record;
  v_cliente       record;
  v_preco_semana  numeric;
  v_proximo_de    date;
  v_proximo_ate   date;
  v_limite        date;
  v_ultima        date;
  v_criadas       integer := 0;
  v_rowcount      integer;
BEGIN
  v_limite := current_date + (GREATEST(p_semanas_a_frente, 0) * 7);

  FOR v_contrato IN
    SELECT c.* FROM public.contratos_renting c
    WHERE c.regime = 'tvde'
      AND c.deleted_at IS NULL
      AND c.estado_operacional IN ('agendado', 'em_curso')
  LOOP
    SELECT max(periodo_ate) INTO v_ultima
    FROM public.contrato_cobrancas
    WHERE contrato_id = v_contrato.id;

    v_proximo_de := COALESCE(v_ultima + 1, v_contrato.data_inicio::date);

    -- Tarifa do contrato. Se não tiver preço direto (caso das tarifas tvde,
    -- que são por modelo), resolve via renting_tarifa_precos_modelo usando
    -- o modelo da viatura do contrato.
    SELECT * INTO v_tarifa
    FROM public.renting_tarifas WHERE id = v_contrato.tarifa_id;

    v_preco_semana := v_tarifa.preco_semana;
    IF v_preco_semana IS NULL AND v_contrato.viatura_id IS NOT NULL THEN
      SELECT rtpm.preco_semana INTO v_preco_semana
      FROM public.renting_tarifa_precos_modelo rtpm
      JOIN public.viaturas vi ON vi.modelo_id = rtpm.modelo_id
      WHERE rtpm.tarifa_id = v_tarifa.id
        AND vi.id = v_contrato.viatura_id;
    END IF;

    WHILE v_proximo_de <= v_limite LOOP
      v_proximo_ate := v_proximo_de + 6;

      EXIT WHEN v_contrato.data_fim IS NOT NULL
            AND v_proximo_de > v_contrato.data_fim::date;

      SELECT cc.* INTO v_condutor
      FROM public.contrato_condutores cc
      WHERE cc.contrato_id = v_contrato.id
        AND cc.is_principal = true
        AND cc.vigencia @> v_proximo_de::timestamptz
      LIMIT 1;

      IF FOUND AND v_preco_semana IS NOT NULL THEN
        SELECT * INTO v_cliente FROM public.clientes WHERE id = v_condutor.cliente_id;

        INSERT INTO public.contrato_cobrancas (
          org_id, contrato_id, periodo_de, periodo_ate, descricao,
          destinatario_id, destinatario_papel, destinatario_nome, contrato_condutor_id,
          tarifa_id, tarifa_nome,
          valor_sem_iva, taxa_iva, emite_fatura_fiscal, estado
        )
        VALUES (
          v_contrato.org_id, v_contrato.id, v_proximo_de, v_proximo_ate,
          'Semana ' || to_char(v_proximo_de, 'DD/MM') ||
                ' a ' || to_char(v_proximo_ate, 'DD/MM/YYYY'),
          v_condutor.cliente_id, 'condutor', v_cliente.nome, v_condutor.id,
          v_tarifa.id, v_tarifa.nome,
          v_preco_semana, COALESCE(v_contrato.taxa_iva, 23),
          false, 'pendente'
        )
        ON CONFLICT (contrato_id, destinatario_id, periodo_de, periodo_ate)
        DO NOTHING;

        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount > 0 THEN
          v_criadas := v_criadas + 1;
        END IF;
      END IF;

      v_proximo_de := v_proximo_ate + 1;
    END LOOP;
  END LOOP;

  RETURN v_criadas;
END;
$$;

COMMENT ON FUNCTION public.gerar_cobrancas_tvde_semanais(integer) IS
  'Gera as cobranças semanais em falta dos contratos TVDE abertos, '
  'destinadas ao condutor vigente (sem fatura fiscal). Resolve o preço via '
  'renting_tarifa_precos_modelo quando a tarifa não tem preco_semana direto '
  '(tarifas tvde, por modelo). Idempotente. Devolve o número de cobranças criadas.';
