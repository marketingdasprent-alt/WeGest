-- ============================================================
-- Alerta: gerar_cobrancas_tvde_semanais() gerou 0 cobranças
-- ============================================================
-- Item 1 do "Sprint desta semana" da auditoria de produto: foi assim que o
-- bug de preço por-modelo passou 6 dias sem ninguém notar — a função corria
-- toda semana, encontrava preço nulo, não gerava nada, sem erro nenhum.
-- Agora: por organização, se houver contratos TVDE elegíveis (agendado/
-- em_curso) mas nenhuma cobrança foi criada NESTA execução, cria uma
-- notificação urgente. Segue o padrão já usado (public.notificacoes) por
-- outros fluxos deste projecto (motorista_pendente, pedido_troca_kms, etc).
-- ============================================================

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IN (
    'motorista_pendente', 'escalonamento', 'viatura_disponivel',
    'pedido_troca_kms', 'cobranca_tvde_zero'
  ));

CREATE OR REPLACE FUNCTION public.gerar_cobrancas_tvde_semanais(p_semanas_a_frente integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato       record;
  v_condutor       record;
  v_tarifa         record;
  v_cliente        record;
  v_preco_semana   numeric;
  v_proximo_de     date;
  v_proximo_ate    date;
  v_limite         date;
  v_ultima         date;
  v_criadas        integer := 0;
  v_rowcount       integer;
  v_orgs_criadas   uuid[] := '{}';
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
          IF NOT (v_contrato.org_id = ANY (v_orgs_criadas)) THEN
            v_orgs_criadas := array_append(v_orgs_criadas, v_contrato.org_id);
          END IF;
        END IF;
      END IF;

      v_proximo_de := v_proximo_ate + 1;
    END LOOP;
  END LOOP;

  -- Alerta: organizações com contratos TVDE elegíveis mas 0 cobranças
  -- criadas NESTA execução (mesmo que outras orgs tenham corrido bem).
  INSERT INTO public.notificacoes (org_id, tipo, titulo, mensagem, severidade)
  SELECT DISTINCT
    c.org_id,
    'cobranca_tvde_zero',
    'Facturação TVDE semanal gerou 0 cobranças',
    'gerar_cobrancas_tvde_semanais() correu sem criar nenhuma cobrança nova para esta organização, apesar de haver contratos TVDE elegíveis (agendado/em_curso). Verificar preço da tarifa (directo ou por-modelo), condutor principal vigente e data_fim dos contratos.',
    'urgente'
  FROM public.contratos_renting c
  WHERE c.regime = 'tvde'
    AND c.deleted_at IS NULL
    AND c.estado_operacional IN ('agendado', 'em_curso')
    AND NOT (c.org_id = ANY (v_orgs_criadas));

  RETURN v_criadas;
END;
$function$;
