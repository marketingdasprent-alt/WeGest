-- ============================================================
-- Renovação: exige contrato EM CURSO e abre o período novo em curso
-- ============================================================
-- SINTOMA: contratos renovados (ex.: 667, 669) ficavam "Agendado" em vez de
-- "Em Curso".
--
-- CAUSA: renovar_contrato_renting COPIAVA o estado do antecessor para a versão
-- nova (v_old.estado_operacional). Se o antecessor estivesse 'agendado' — por
-- nunca ter sido entregue, ou por a abertura ter sido revertida — a versão nova
-- nascia 'agendado'. Confirmado no histórico do contrato 666: foi aberto
-- (agendado → em_curso), a abertura foi revertida minutos depois, e a renovação
-- registou "agendado → cancelado", propagando 'agendado' para o 667.
--
-- FIX (duas metades, complementares):
--   (B) GUARDA: só se renova um contrato 'em_curso'. Renovar pressupõe que a
--       viatura está com o cliente; um contrato apenas agendado tem de ser
--       aberto primeiro. Sem esta guarda, o estado errado propagava-se.
--   (A) O período novo nasce EXPLICITAMENTE 'em_curso', em vez de herdar. Com a
--       guarda seria equivalente, mas explícito é auto-documentado e imune a
--       futuras mudanças na guarda.
--
-- O frontend (lib/renovacaoContrato.ts → contratoRenovavel) aplica a mesma
-- regra, para o botão "Renovar" não aparecer em contratos por abrir.
-- ============================================================

CREATE OR REPLACE FUNCTION public.renovar_contrato_renting(
  p_contrato_id uuid,
  p_km_inicio integer DEFAULT NULL::integer,
  p_km_fim integer DEFAULT NULL::integer
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
  IF NOT COALESCE(v_old.is_longa_duracao, false) THEN
    RAISE EXCEPTION 'A renovação só se aplica a contratos de longa duração.';
  END IF;

  -- (B) Só se renova um contrato em curso.
  IF v_old.estado_operacional <> 'em_curso' THEN
    RAISE EXCEPTION
      'Só é possível renovar um contrato em curso (estado actual: %). Confirma a entrega/abertura do contrato antes de renovar.',
      v_old.estado_operacional;
  END IF;

  -- TVDE pode não ter data de fim (contrato em aberto) — a 1.ª renovação
  -- arranca o ciclo a partir de agora. Fora de TVDE continua obrigatória.
  IF v_old.data_fim IS NULL AND v_old.regime <> 'tvde' THEN
    RAISE EXCEPTION 'Contrato sem data de fim — não é possível calcular o novo período.';
  END IF;
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL AND p_km_fim < p_km_inicio THEN
    RAISE EXCEPTION 'O km final (%) não pode ser inferior ao km inicial (%).', p_km_fim, p_km_inicio;
  END IF;

  v_inicio := COALESCE(v_old.data_fim, now());
  v_fim    := public.proxima_data_renovacao(
                v_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

  -- O mês que terminou passa a HISTÓRICO e FECHADO: só o estado e os km —
  -- não é uma devolução física, não há estação/fotos/combustível a registar.
  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'cancelado'::contrato_estado_operacional_enum,
         updated_by         = v_user_id,
         km_saida           = COALESCE(p_km_inicio, km_saida),
         km_entrada         = COALESCE(p_km_fim, km_entrada)
   WHERE id = v_old.id;

  IF p_km_fim IS NOT NULL AND v_old.viatura_id IS NOT NULL THEN
    UPDATE public.viaturas
       SET km_atual = p_km_fim
     WHERE id = v_old.viatura_id
       AND (km_atual IS NULL OR p_km_fim >= km_atual);
  END IF;

  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, emissor_id, gestor_id,
    viatura_id, matricula, grupo,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim, estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, tarifa_id, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
    km_saida,
    dua_original_com_motorista, dua_observacoes,
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
    -- (A) o período novo abre EM CURSO: a viatura continua com o cliente.
    'em_curso'::contrato_estado_operacional_enum,
    'pendente', v_old.origem, v_old.regime,
    v_old.tarifa_diaria, v_old.tarifa_id, v_old.desconto_percentagem, v_old.taxa_iva, v_old.valor_total_manual,
    v_old.is_longa_duracao, v_old.renovacao_opcao, v_old.renovacao_intervalo_dias,
    v_old.franquia_valor, v_old.caucao_valor, v_old.kms_incluidos, v_old.km_adicional_valor,
    p_km_fim,
    v_old.dua_original_com_motorista, v_old.dua_observacoes,
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id,
    'Renovação — período de ' || to_char(v_inicio, 'YYYY-MM-DD') || ' a ' || to_char(v_fim, 'YYYY-MM-DD'),
    v_user_id
  ) RETURNING id INTO v_new_id;

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

  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL
     AND v_old.kms_incluidos IS NOT NULL THEN
    v_km_percorridos := p_km_fim - p_km_inicio;
    v_km_limite      := v_old.kms_incluidos;
    v_km_valor       := COALESCE(v_old.km_adicional_valor, 0);

    IF v_km_percorridos > v_km_limite AND v_km_valor > 0 THEN
      v_km_excesso := v_km_percorridos - v_km_limite;
      v_km_total   := v_km_excesso * v_km_valor;

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

  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  RETURN v_new_id;
END;
$function$;

-- ── Correcção dos contratos já afectados ────────────────────────────────────
-- 667 e 669 (rent-a-car, período 2026-07-05 → 2026-08-04, já facturados):
-- nasceram 'agendado' por causa do bug acima. A viatura está com o cliente,
-- por isso o estado correcto é 'em_curso'. São versões actuais (substituido_em
-- IS NULL), logo mutáveis — o trigger de imutabilidade não se aplica.
--
-- NOTA: ficam de fora, de propósito, os contratos 649 e 654 (TVDE, períodos de
-- 2026-05 e 2023, ainda 'pendente'). Também nasceram de renovação em 'agendado',
-- mas são antigos e podem estar abandonados — carecem de decisão do gestor.
UPDATE public.contratos_renting
   SET estado_operacional = 'em_curso'::contrato_estado_operacional_enum
 WHERE codigo IN (667, 669)
   AND substituido_em IS NULL
   AND deleted_at IS NULL
   AND estado_operacional = 'agendado'
   AND motivo_versao LIKE 'Renovação%';
