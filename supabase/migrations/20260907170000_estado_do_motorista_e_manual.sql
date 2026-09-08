-- Activar/inactivar um motorista passa a ser decisão de quem gere, e só dela.
--
-- Havia seis sítios a escrever motoristas_ativos.status_ativo por sua conta:
-- três a inactivar (a trigger trg_contrato_renting_inativar_motorista, a
-- trigger ...liga_motorista_close e o próprio hook de fecho no frontend) e
-- três a activar (...liga_motorista_open, fn_contrato_condutor_liga_motorista
-- e criar_versao_contrato_renting). Nenhum sabia dos outros.
--
-- O que isso custava, medido em 60 dias nesta base: 145 desactivações, 135
-- delas (93%) a menos de cinco minutos de alguém mexer num contrato — ou
-- seja, quase nenhuma foi decisão de ninguém. 22 foram desfeitas à mão em
-- menos de 24h (uma ao fim de 12 segundos), e 4 motoristas foram inactivados
-- tendo ainda contrato agendado ou em curso: trg_contrato_renting_inativar_
-- motorista inactivava TODOS os condutores do contrato sem verificar nada.
--
-- Pior: a única salvaguarda que existia — `manterMotoristaActivo`, a flag do
-- modo troca em FecharContratoDialog — nunca funcionou. As triggers correm
-- dentro da transacção do UPDATE ao contrato, muito antes de o frontend
-- chegar ao seu próprio UPDATE, e não conhecem flag nenhuma.
--
-- Fica automático tudo o que é facto operacional: o vínculo à viatura
-- (motorista_viaturas) continua a abrir e a fechar sozinho com o contrato.
-- Só o estado do motorista deixa de o ser — quem o muda é o botão da ficha
-- (MotoristaDetalhe). A lista de condutores de um contrato já só oferece
-- motoristas activos, por isso reactivar sozinho também nunca foi preciso.

-- 1) A inactivação sem salvaguarda nenhuma: fora, com função e tudo.
DROP TRIGGER IF EXISTS trg_contrato_renting_inativar_motorista ON public.contratos_renting;
DROP FUNCTION IF EXISTS public.contrato_renting_inativar_motorista_na_devolucao();

-- 2) Fecho de contrato: encerra o vínculo à viatura, não mexe no motorista.
--    Sai daqui a busca por "tem outro contrato activo?" — só existia para
--    decidir a inactivação, que já não acontece.
CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_close() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Linha já era história antes desta alteração: o vínculo motorista-viatura
  -- pertence agora ao contrato sucessor — não tocar. (No momento da
  -- substituição OLD.substituido_em ainda é NULL → fecho normal mantém-se.)
  IF OLD.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- TODAS as linhas activas da viatura, não "uma" resolvida por LIMIT 1 —
  -- esse caminho deixava o condutor real preso à viatura quando o contrato
  -- tinha vários condutores.
  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, CURRENT_DATE)
   WHERE viatura_id = NEW.viatura_id
     AND status = 'ativo';

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_liga_motorista_close() IS 'Ao fechar/cancelar um contrato, fecha TODAS as linhas motorista_viaturas activas da sua viatura. Não toca em status_ativo: activar/inactivar um motorista é decisão manual desde 20260907170000.';

-- 3) Abertura de contrato: cria o vínculo à viatura, não reactiva ninguém.
CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_open() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_motorista_id uuid;
BEGIN
  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT id INTO v_motorista_id
    FROM public.motoristas_ativos
    WHERE cliente_id = NEW.cliente_id
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    SELECT motorista_id INTO v_motorista_id
    FROM public.contrato_condutores
    WHERE contrato_id = NEW.id AND motorista_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    RAISE WARNING 'contrato_renting_liga_motorista_open: motorista não resolvido para contrato % (codigo %, cliente_id %, viatura_id %) — motorista_viaturas não sincronizado',
      NEW.id, NEW.codigo, NEW.cliente_id, NEW.viatura_id;
    RETURN NEW;
  END IF;

  -- Encerra associação activa anterior a outra viatura (troca/upgrade)
  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, NEW.data_inicio::date)
   WHERE motorista_id = v_motorista_id
     AND status = 'ativo'
     AND viatura_id IS DISTINCT FROM NEW.viatura_id;

  -- Cria associação se ainda não existir activa para esta viatura
  IF NOT EXISTS (
    SELECT 1 FROM public.motorista_viaturas
     WHERE motorista_id = v_motorista_id
       AND viatura_id = NEW.viatura_id
       AND status = 'ativo'
  ) THEN
    INSERT INTO public.motorista_viaturas (
      motorista_id, viatura_id, data_inicio, status, org_id, observacoes
    )
    VALUES (
      v_motorista_id, NEW.viatura_id, NEW.data_inicio::date, 'ativo', NEW.org_id,
      'Gerado automaticamente pelo contrato de aluguer #' || NEW.codigo
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_liga_motorista_open() IS 'Ao abrir/actualizar contrato_renting com viatura, associa a viatura em motorista_viaturas. Resolve o motorista por cliente_id directo OU, em fallback, via contrato_condutores.motorista_id. Não toca em status_ativo: activar/inactivar é decisão manual desde 20260907170000.';

-- 4) Associar condutor ao contrato: cria o vínculo, não reactiva.
CREATE OR REPLACE FUNCTION public.fn_contrato_condutor_liga_motorista() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_c public.contratos_renting%ROWTYPE;
  v_inicio date;
  v_fim    date;
BEGIN
  IF NEW.motorista_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_c FROM public.contratos_renting WHERE id = NEW.contrato_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_c.deleted_at IS NOT NULL OR v_c.substituido_em IS NOT NULL THEN RETURN NEW; END IF;
  IF v_c.estado_operacional NOT IN ('agendado', 'em_curso') THEN RETURN NEW; END IF;
  IF v_c.viatura_id IS NULL OR v_c.regime = 'slot' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE motorista_id = NEW.motorista_id AND viatura_id = v_c.viatura_id
      AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE viatura_id = v_c.viatura_id AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE motorista_id = NEW.motorista_id AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- A data do CONDUTOR é a que diz quando ele pegou nesta viatura. A do
  -- contrato só serve quando aquela não existe.
  v_inicio := COALESCE(
    (NEW.data_inicio AT TIME ZONE 'Europe/Lisbon')::date,
    (v_c.data_inicio AT TIME ZONE 'Europe/Lisbon')::date,
    CURRENT_DATE
  );

  v_fim := COALESCE(
    (NEW.data_fim AT TIME ZONE 'Europe/Lisbon')::date,
    (v_c.data_fim AT TIME ZONE 'Europe/Lisbon')::date
  );

  -- Um fim anterior ao início não é um período curto: é lixo. Vale mais uma
  -- atribuição em aberto, que alguém fecha, do que um intervalo impossível
  -- que nenhuma consulta por datas consegue interpretar.
  IF v_fim IS NOT NULL AND v_fim < v_inicio THEN
    v_fim := NULL;
  END IF;

  INSERT INTO public.motorista_viaturas
    (motorista_id, viatura_id, data_inicio, data_fim, status, org_id, observacoes)
  VALUES (
    NEW.motorista_id, v_c.viatura_id, v_inicio, v_fim,
    'ativo', v_c.org_id, 'Gerado ao associar condutor ao contrato #' || v_c.codigo
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_contrato_condutor_liga_motorista() IS 'Cria a ligacao motorista-viatura ao associar um condutor ao contrato, com o inicio E o FIM do contrato. Sem a data de fim o resumo semanal cobrava os 7 dias para sempre. Ver migracao 20260814140000. Nao toca em status_ativo desde 20260907170000.';

-- 5) Troca de viatura (versionamento): copia o contrato, não reactiva.
--    Corpo idêntico ao que estava em produção (md5 0f1f9fc5…) menos o bloco
--    que punha status_ativo = true nos condutores do sucessor.
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
  -- ficou para trás da própria troca — aí seria um intervalo invertido, que a
  -- coluna gerada `periodo` (tstzrange) recusa com o erro cru 22000.
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

    IF v_data_fim IS NULL OR v_data_fim <= v_data THEN
      RAISE EXCEPTION
        'Não foi possível calcular o novo período deste contrato. Renova-o (ou corrige a data de fim) antes de trocar a viatura.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Viatura do sucessor. A validação de organização é obrigatória: a função é
  -- SECURITY DEFINER, logo a RLS não a protege.
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
