-- ============================================================
-- M5 — Geração automática das cobranças semanais TVDE
-- ============================================================
-- Para cada contrato TVDE aberto, gera as linhas de
-- `contrato_cobrancas` em falta — uma por semana — destinadas
-- ao CONDUTOR principal vigente, SEM fatura fiscal
-- (o motorista "paga a semana" sem fatura).
--
-- A fatura à empresa é tratada à parte, na cadência dela.
--
-- Idempotente: a constraint UNIQUE de contrato_cobrancas +
-- ON CONFLICT DO NOTHING garantem que correr duas vezes não
-- duplica. Cada linha nasce 'pendente' para revisão.
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
  v_contrato    record;
  v_condutor    record;
  v_tarifa      record;
  v_cliente     record;
  v_proximo_de  date;
  v_proximo_ate date;
  v_limite      date;
  v_ultima      date;
  v_criadas     integer := 0;
  v_rowcount    integer;
BEGIN
  -- Gera até esta data (semanas à frente da data atual)
  v_limite := current_date + (GREATEST(p_semanas_a_frente, 0) * 7);

  FOR v_contrato IN
    SELECT c.* FROM public.contratos_renting c
    WHERE c.regime = 'tvde'
      AND c.deleted_at IS NULL
      AND c.estado_operacional IN ('agendado', 'em_curso')
  LOOP
    -- Última semana já gerada para este contrato
    SELECT max(periodo_ate) INTO v_ultima
    FROM public.contrato_cobrancas
    WHERE contrato_id = v_contrato.id;

    v_proximo_de := COALESCE(v_ultima + 1, v_contrato.data_inicio::date);

    -- Tarifa do contrato (precisa de preco_semana)
    SELECT * INTO v_tarifa
    FROM public.renting_tarifas WHERE id = v_contrato.tarifa_id;

    WHILE v_proximo_de <= v_limite LOOP
      v_proximo_ate := v_proximo_de + 6;   -- semana de 7 dias

      -- Não passar do fim do contrato, quando definido
      EXIT WHEN v_contrato.data_fim IS NOT NULL
            AND v_proximo_de > v_contrato.data_fim::date;

      -- Condutor principal vigente no início da semana
      SELECT cc.* INTO v_condutor
      FROM public.contrato_condutores cc
      WHERE cc.contrato_id = v_contrato.id
        AND cc.is_principal = true
        AND cc.vigencia @> v_proximo_de::timestamptz
      LIMIT 1;

      -- Só cria se há condutor vigente e tarifa com preço semanal
      IF FOUND AND v_tarifa.preco_semana IS NOT NULL THEN
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
          v_tarifa.preco_semana, COALESCE(v_contrato.taxa_iva, 23),
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
  'destinadas ao condutor vigente (sem fatura fiscal). Idempotente. '
  'Devolve o número de cobranças criadas.';

GRANT EXECUTE ON FUNCTION public.gerar_cobrancas_tvde_semanais(integer) TO service_role;

-- ============================================================
-- Agendamento (pg_cron) — descomentar quando o pg_cron estiver
-- ativo no projeto Supabase. Corre todas as 2as-feiras às 06:00.
-- ============================================================
-- SELECT cron.schedule(
--   'gerar-cobrancas-tvde-semanais',
--   '0 6 * * 1',
--   $$ SELECT public.gerar_cobrancas_tvde_semanais(1); $$
-- );
