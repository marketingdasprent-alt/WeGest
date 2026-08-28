-- ── E O SEGUNDO PROBLEMA, POR BAIXO DO PRIMEIRO ──────────────────────────
-- Com o período arrumado, o #577 passou a falhar noutro sítio: 23P01,
-- contratos_no_overbooking. A RPC clonava o contrato COM A VIATURA ANTIGA e
-- deixava ao frontend a tarefa de a trocar num segundo pedido. Mas o clone
-- nasce 'agendado', que é precisamente um dos estados que a exclusion
-- constraint vigia — ou seja, o sucessor voltava a ocupar a viatura que a
-- troca está a LIBERTAR. No #577 essa viatura (BJ-17-DD) já tinha sido
-- realugada ao contrato #819, e a colisão era inevitável.
--
-- Uma troca de viatura é a única alteração que chega sequer a versionar um
-- contrato (ver detectarAlteracoesMateriais). Clonar a viatura que está a
-- sair está errado por construção. A RPC passa a receber a viatura NOVA e o
-- sucessor nasce já com ela — deixa de existir o estado intermédio.
--
-- p_viatura_id é opcional: sem ela o comportamento é o de sempre (clona a
-- viatura actual), para as chamadas que só versionam sem trocar de viatura.
-- Como um quarto parâmetro com DEFAULT tornaria a chamada de três argumentos
-- ambígua com a assinatura antiga, esta é substituída em vez de coexistir.

DROP FUNCTION IF EXISTS public.criar_versao_contrato_renting(
  uuid, text, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.criar_versao_contrato_renting(
  p_contrato_id uuid,
  p_motivo text,
  p_data_troca timestamp with time zone,
  p_viatura_id uuid DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_old        contratos_renting%ROWTYPE;
  v_new_id     uuid;
  v_user_id    uuid := auth.uid();
  v_data       timestamptz;
  v_data_fim   timestamptz;
  v_cols       text;
  v_vals       text;
  v_matricula  text;
  v_mat_nova   text;
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

  IF v_old.estado_financeiro IN ('facturado', 'pago') THEN
    RAISE EXCEPTION 'Não podes versionar um contrato %. Trata da facturação primeiro.',
      v_old.estado_financeiro;
  END IF;

  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  v_data := COALESCE(p_data_troca, now());
  IF v_data < v_old.data_inicio THEN
    RAISE EXCEPTION 'A data da troca (%) é anterior ao início do contrato (%).',
      v_data, v_old.data_inicio;
  END IF;

  -- Fim do sucessor. Herda o do contrato antigo, excepto quando esse fim já
  -- ficou para trás da própria troca — aí seria um intervalo invertido.
  v_data_fim := v_old.data_fim;
  IF v_data_fim IS NOT NULL AND v_data_fim <= v_data THEN
    IF COALESCE(v_old.is_longa_duracao, false) AND v_old.renovacao_opcao IS NOT NULL THEN
      v_data_fim := public.proxima_data_renovacao(
                      v_data, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);
    ELSE
      RAISE EXCEPTION
        'Este contrato terminou a % e a troca é a %. Renova o contrato (ou corrige a data de fim) antes de trocar a viatura.',
        to_char(v_old.data_fim, 'DD/MM/YYYY'), to_char(v_data, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;

    -- proxima_data_renovacao devolve sempre um instante à frente do que recebe,
    -- em qualquer das três opções. Se alguma vez deixar de devolver, é melhor
    -- parar aqui com uma mensagem legível do que deixar o INSERT rebentar com
    -- o erro cru do tstzrange.
    IF v_data_fim IS NULL OR v_data_fim <= v_data THEN
      RAISE EXCEPTION
        'Não foi possível calcular o novo período deste contrato. Renova-o (ou corrige a data de fim) antes de trocar a viatura.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Viatura do sucessor. A validação de organização é obrigatória: a função é
  -- SECURITY DEFINER, logo a RLS não a protege — sem isto, um id de outra org
  -- passado à mão entrava no contrato.
  IF p_viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_mat_nova
      FROM public.viaturas
     WHERE id = p_viatura_id AND org_id = v_old.org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Viatura % não existe nesta organização.', p_viatura_id;
    END IF;
  END IF;

  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'fechado'::contrato_estado_operacional_enum,
         data_fim           = v_data,
         updated_by         = v_user_id
   WHERE id = v_old.id;

  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position),
         string_agg(
           CASE c.column_name
             WHEN 'versao'               THEN '$2'
             WHEN 'contrato_anterior_id' THEN '$1'
             WHEN 'motivo_versao'        THEN '$3'
             WHEN 'substituido_em'       THEN 'NULL'
             WHEN 'deleted_at'           THEN 'NULL'
             WHEN 'data_inicio'          THEN '$4'
             WHEN 'data_fim'             THEN '$6'
             -- A viatura nova entra já aqui. Sem isto o sucessor nascia com a
             -- viatura que a troca liberta e chocava com quem já a tinha.
             WHEN 'viatura_id'           THEN 'COALESCE($7, viatura_id)'
             WHEN 'matricula'            THEN 'COALESCE($8, matricula)'
             WHEN 'estado_operacional'   THEN '''agendado''::contrato_estado_operacional_enum'
             WHEN 'estado_financeiro'    THEN '''pendente''::contrato_estado_financeiro_enum'
             WHEN 'facturado_em'         THEN 'NULL'
             WHEN 'tipo_fecho'           THEN 'NULL'
             WHEN 'km_saida'             THEN 'NULL'
             WHEN 'km_entrada'           THEN 'NULL'
             WHEN 'combustivel_saida'    THEN 'NULL'
             WHEN 'combustivel_entrada'  THEN 'NULL'
             WHEN 'eletricidade_saida'   THEN 'NULL'
             WHEN 'eletricidade_entrada' THEN 'NULL'
             WHEN 'dua_devolvida_em'     THEN 'NULL'
             WHEN 'entrega_via_any_rent' THEN 'false'
             WHEN 'created_by'           THEN '$5'
             WHEN 'updated_by'           THEN '$5'
             WHEN 'created_at'           THEN 'now()'
             WHEN 'updated_at'           THEN 'now()'
             ELSE quote_ident(c.column_name)
           END, ', ' ORDER BY c.ordinal_position)
    INTO v_cols, v_vals
    FROM information_schema.columns c
   WHERE c.table_schema  = 'public'
     AND c.table_name    = 'contratos_renting'
     AND c.is_generated  = 'NEVER'
     AND c.column_name  <> 'id';

  EXECUTE format(
    'INSERT INTO public.contratos_renting (%s) SELECT %s FROM public.contratos_renting WHERE id = $1 RETURNING id',
    v_cols, v_vals
  )
  INTO v_new_id
  USING v_old.id, v_old.versao + 1, p_motivo, v_data, v_user_id, v_data_fim,
        p_viatura_id, v_mat_nova;

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

  UPDATE public.motoristas_ativos ma
     SET status_ativo = true
   WHERE ma.status_ativo = false
     AND (
       EXISTS (
         SELECT 1 FROM public.contrato_condutores cc
          WHERE cc.contrato_id = v_new_id AND cc.motorista_id = ma.id
       )
       OR EXISTS (
         SELECT 1 FROM public.contratos_renting cr
          WHERE cr.id = v_new_id AND cr.cliente_id = ma.cliente_id
       )
     );

  SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = v_old.viatura_id;

  INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  VALUES (
    v_old.id, v_old.org_id, 'troca_viatura', v_user_id,
    format('Substituído pelo contrato %s em %s. Viatura à saída: %s. Motivo: %s',
           v_new_id, to_char(v_data, 'DD/MM/YYYY HH24:MI'),
           COALESCE(v_matricula, v_old.matricula, '—'),
           COALESCE(NULLIF(trim(p_motivo), ''), '—'))
  );

  INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  VALUES (
    v_new_id, v_old.org_id, 'troca_viatura', v_user_id,
    format('Continua o contrato %s (versão %s), a partir de %s. Viatura anterior: %s. Motivo: %s',
           v_old.id, v_old.versao, to_char(v_data, 'DD/MM/YYYY HH24:MI'),
           COALESCE(v_matricula, v_old.matricula, '—'),
           COALESCE(NULLIF(trim(p_motivo), ''), '—'))
  );

  RETURN v_new_id;
END;
$_$;

REVOKE ALL ON FUNCTION public.criar_versao_contrato_renting(
  uuid, text, timestamp with time zone, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_versao_contrato_renting(
  uuid, text, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_versao_contrato_renting(
  uuid, text, timestamp with time zone, uuid) TO service_role;

COMMENT ON FUNCTION public.criar_versao_contrato_renting(uuid, text, timestamp with time zone, uuid) IS
  'Cria uma nova versão de um contrato_renting copiando a linha actual + relações (condutores, coberturas, extras, taxas) e marcando a anterior como substituída. A nova versão herda o mesmo código. O sucessor começa na data da troca e nasce já com p_viatura_id (a viatura nova da troca) — clonar a viatura antiga fazia o sucessor reocupá-la e chocar com contratos_no_overbooking. Quando a data_fim herdada já ficou para trás da data da troca, é recalculada por proxima_data_renovacao() nos contratos de longa duração com regra de renovação, e recusada com mensagem accionável nos restantes. Fix 2026-08-28: antes o sucessor nascia com o período invertido (erro cru do tstzrange) e com a viatura errada.';
