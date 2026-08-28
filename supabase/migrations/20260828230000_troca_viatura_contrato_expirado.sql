-- Troca de viatura num contrato cuja data_fim já passou.
--
-- O QUE ESTAVA MAL
-- criar_versao_contrato_renting monta o sucessor com data_inicio = data da
-- troca e data_fim = a data_fim do contrato antigo, tal e qual. Quando o
-- contrato já tinha terminado — o caso normal num TVDE de longa duração que
-- ninguém renovou, mas cujo motorista continua com a viatura na rua — o
-- sucessor nascia com o fim ANTES do início. A coluna gerada
--   periodo = tstzrange(data_inicio, data_fim, '[)')
-- recusa esse intervalo e o Postgres atira 22000 "range lower bound must be
-- less than or equal to range upper bound". A RPC inteira faz rollback e o
-- sucessor nunca chega a existir.
--
-- O estrago não fica por aí: quem fecha o contrato (useFecharContrato) corre
-- numa chamada anterior e já commitou. O contrato ficava fechado, sem
-- sucessor, com o motorista ainda de posse da viatura — e cada nova tentativa
-- somava outro evento de recolha. No contrato #577 foram cinco.
--
-- A REGRA NOVA
-- O sucessor nunca herda um fim anterior ao seu início. Quando isso
-- aconteceria:
--
--   · Contrato de longa duração COM regra de renovação — o próximo fim é
--     calculado por proxima_data_renovacao(), a mesma função que
--     renovar_contrato_renting usa. Não se inventa data nenhuma: aplica-se a
--     regra que já está escrita no próprio contrato.
--
--   · Contrato sem essa regra (rent-a-car de período fixo, já expirado) —
--     recusa com mensagem accionável. Esticar o período aqui seria inventar
--     facturação que ninguém acordou; quem decide as datas é o gestor.
--
-- Contratos ainda dentro do prazo não mudam de comportamento: herdam a
-- data_fim como sempre herdaram.
--
-- Com o período arrumado veio ao de cima um segundo problema, que estava
-- escondido por baixo deste — ver a migração seguinte
-- (20260828230500_troca_viatura_sucessor_com_viatura_nova).

CREATE OR REPLACE FUNCTION public.criar_versao_contrato_renting(
  p_contrato_id uuid,
  p_motivo text,
  p_data_troca timestamp with time zone
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
  USING v_old.id, v_old.versao + 1, p_motivo, v_data, v_user_id, v_data_fim;

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
