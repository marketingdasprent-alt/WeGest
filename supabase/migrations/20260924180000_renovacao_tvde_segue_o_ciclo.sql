-- Renovar um TVDE volta a fechar o período numa versão, e segue o ciclo escolhido.
--
-- Desde 20260908093000 renovar só avançava uma data no mesmo contrato: não
-- ficava o contrato de cada período, e quando o motorista pede o contrato do
-- mês passado não havia o que abrir. Agora a versão que sai é esse contrato
-- (período, valores, km) e a nova continua sem data de fim — a razão de
-- 08-09 (a versão de 30 dias expirava e parava o aluguer) já não se aplica.
--
-- Desde 20260908093000 a próxima renovação contava a partir de now(): quem
-- renovava atrasado ou adiantado mudava o dia do ciclo (#900 passou de 16 para
-- 18, #793/#794/#803 de 14 para 15). Agora conta-se a partir do prazo que se
-- está a renovar e salta-se para a primeira ocorrência depois de hoje — um
-- atraso resolve-se numa renovação e o dia não escorrega.
--
-- Com a data presa ao ciclo, cada clique repetido saltava um mês (#836 foi
-- renovado 5 vezes em 90 s). Daí a janela: só se renova de 7 dias antes do
-- prazo em diante, verificado antes de qualquer efeito (km, excedente).
--
-- E o aviso diário de renovação ignorava proxima_renovacao_em: TVDE já
-- renovados (#496, #498, #733…) recebiam "renovação próxima" todos os dias.

CREATE OR REPLACE FUNCTION public.proxima_renovacao_no_ciclo(
  p_ancora timestamptz,
  p_opcao text,
  p_intervalo integer,
  p_depois_de timestamptz
) RETURNS timestamptz
    LANGUAGE plpgsql
    STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  -- Contas no relógio de Lisboa: a hora da âncora mantém-se na mudança de hora.
  v_a     timestamp := p_ancora AT TIME ZONE 'Europe/Lisbon';
  v_r     timestamp := p_depois_de AT TIME ZONE 'Europe/Lisbon';
  v_passo integer   := CASE WHEN p_intervalo > 0 THEN p_intervalo ELSE 30 END;
  v_n     integer;
  v_c     timestamp;
BEGIN
  IF p_opcao = 'primeiro_dia_mes' THEN
    RETURN (date_trunc('month', v_r) + interval '1 month') AT TIME ZONE 'Europe/Lisbon';
  END IF;

  IF v_a > v_r THEN
    RETURN p_ancora;
  END IF;

  IF p_opcao = 'mesmo_dia_cada_mes' THEN
    -- Sempre âncora + n meses (nunca iterativo): o dia 31 não escorrega para 30.
    v_n := ((extract(year FROM v_r) - extract(year FROM v_a)) * 12
            + extract(month FROM v_r) - extract(month FROM v_a))::integer;
    v_c := v_a + make_interval(months => v_n);
    IF v_c <= v_r THEN
      v_c := v_a + make_interval(months => v_n + 1);
    END IF;
  ELSE
    v_n := floor((v_r::date - v_a::date)::numeric / v_passo)::integer;
    v_c := v_a + make_interval(days => v_n * v_passo);
    IF v_c <= v_r THEN
      v_c := v_a + make_interval(days => (v_n + 1) * v_passo);
    END IF;
  END IF;

  RETURN v_c AT TIME ZONE 'Europe/Lisbon';
END;
$$;

COMMENT ON FUNCTION public.proxima_renovacao_no_ciclo(timestamptz, text, integer, timestamptz) IS
  'Primeira data do ciclo de renovação (âncora + n períodos) estritamente depois de p_depois_de. Espelhada em src/lib/renovacaoContrato.ts (proximaRenovacaoNoCiclo).';

REVOKE ALL ON FUNCTION public.proxima_renovacao_no_ciclo(timestamptz, text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxima_renovacao_no_ciclo(timestamptz, text, integer, timestamptz) TO authenticated;


CREATE OR REPLACE FUNCTION public.renovar_contrato_renting(
  p_contrato_id uuid,
  p_km_inicio integer DEFAULT NULL,
  p_km_fim integer DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old            public.contratos_renting%ROWTYPE;
  v_user_id        uuid := auth.uid();
  v_new_id         uuid;
  v_inicio         timestamptz;
  v_fim            timestamptz;
  v_ancora         timestamptz;
  v_hoje           date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_semana         timestamptz;
  v_legado         boolean;
  v_conflito       integer;
  v_cols           text;
  v_vals           text;
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
  -- IS DISTINCT FROM, não <>: sem org activa get_current_org_id() é NULL, e
  -- "x <> NULL" não dispara o IF — deixava renovar contratos de outra org.
  IF v_old.org_id IS DISTINCT FROM get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;
  IF NOT COALESCE(v_old.is_longa_duracao, false) THEN
    RAISE EXCEPTION 'A renovação só se aplica a contratos de longa duração.';
  END IF;

  IF v_old.estado_operacional <> 'em_curso' THEN
    RAISE EXCEPTION
      'Só é possível renovar um contrato em curso (estado actual: %). Confirma a entrega/abertura do contrato antes de renovar.',
      v_old.estado_operacional;
  END IF;

  IF v_old.data_fim IS NULL AND v_old.regime <> 'tvde' THEN
    RAISE EXCEPTION 'Contrato sem data de fim — não é possível calcular o novo período.';
  END IF;
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL AND p_km_fim < p_km_inicio THEN
    RAISE EXCEPTION 'O km final (%) não pode ser inferior ao km inicial (%).', p_km_fim, p_km_inicio;
  END IF;

  -- TVDE: o prazo que se renova e a janela, antes de qualquer efeito — um
  -- clique repetido não pode deixar km nem excedente lançados.
  IF v_old.regime = 'tvde' THEN
    v_ancora := COALESCE(
      v_old.proxima_renovacao_em,
      public.proxima_data_renovacao(v_old.data_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias)
    );

    IF (v_ancora AT TIME ZONE 'Europe/Lisbon')::date > v_hoje + 7 THEN
      RAISE EXCEPTION
        'O contrato #% só renova a % — pode renovar-se a partir de % (7 dias antes).',
        v_old.codigo,
        to_char(v_ancora AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'),
        to_char((v_ancora AT TIME ZONE 'Europe/Lisbon')::date - 7, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Comum aos dois caminhos ────────────────────────────────────────────
  IF p_km_fim IS NOT NULL AND v_old.viatura_id IS NOT NULL THEN
    UPDATE public.viaturas
       SET km_atual = p_km_fim
     WHERE id = v_old.viatura_id
       AND (km_atual IS NULL OR p_km_fim >= km_atual);
  END IF;

  -- Km excedente do ciclo que fecha, lançado no contrato actual.
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

  -- ── TVDE: cada renovação fecha o período numa versão ───────────────────
  -- A versão que sai é o contrato daquele período (datas, valores, km) — é
  -- ela que se abre e imprime quando o motorista pede o contrato do mês
  -- passado. A nova continua sem data de fim: nada expira se não se renovar,
  -- que era o problema das versões de 30 dias antes de 20260908093000.
  IF v_old.regime = 'tvde' THEN
    -- Do prazo, no ciclo escolhido; atrasado salta para a ocorrência depois de hoje.
    v_fim := public.proxima_renovacao_no_ciclo(
               v_ancora, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias,
               GREATEST(now(), v_ancora));
    v_semana := date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';
    v_legado := v_old.data_fim IS NOT NULL AND v_old.data_fim < v_semana;

    -- A viatura tem de estar livre a partir de agora — senão a trava de
    -- overbooking rebentava com um erro cru.
    SELECT o.codigo INTO v_conflito
      FROM public.contratos_renting o
     WHERE o.org_id = v_old.org_id
       AND o.viatura_id = v_old.viatura_id
       AND o.id <> v_old.id
       AND o.deleted_at IS NULL
       AND o.substituido_em IS NULL
       AND o.estado_operacional IN ('agendado', 'em_curso')
       AND o.periodo && tstzrange(now(), NULL)
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'A viatura do contrato #% já está no contrato #%. Não se renova por cima: fecha este contrato ou resolve o outro primeiro.',
        v_old.codigo, v_conflito
        USING ERRCODE = 'check_violation';
    END IF;

    v_inicio := now();

    -- O período fecha agora e a versão nova começa no mesmo instante: sem
    -- buraco nem sobreposição no aluguer. Num legado cuja data_fim já fechou
    -- semanas, fica essa data — é ela que diz até onde já se cobrou.
    UPDATE public.contratos_renting
       SET substituido_em     = now(),
           estado_operacional = 'fechado'::contrato_estado_operacional_enum,
           data_fim           = CASE WHEN v_legado THEN data_fim ELSE v_inicio END,
           km_entrada         = COALESCE(p_km_fim, km_entrada),
           updated_by         = v_user_id
     WHERE id = v_old.id;

    -- Cópia de todas as colunas, como em criar_versao_contrato_renting: uma
    -- coluna nova na tabela não se perde na renovação. O código mantém-se.
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position),
           string_agg(
             CASE c.column_name
               WHEN 'versao'               THEN '$2'
               WHEN 'contrato_anterior_id' THEN '$1'
               WHEN 'motivo_versao'        THEN '$3'
               WHEN 'substituido_em'       THEN 'NULL'
               WHEN 'deleted_at'           THEN 'NULL'
               WHEN 'data_inicio'          THEN '$4'
               WHEN 'data_fim'             THEN 'NULL'
               WHEN 'proxima_renovacao_em' THEN '$6'
               WHEN 'estado_operacional'   THEN '''em_curso''::contrato_estado_operacional_enum'
               WHEN 'estado_financeiro'    THEN '''pendente''::contrato_estado_financeiro_enum'
               WHEN 'facturado_em'         THEN 'NULL'
               WHEN 'total_subtotal'       THEN 'NULL'
               WHEN 'total_iva'            THEN 'NULL'
               WHEN 'total_final'          THEN 'NULL'
               WHEN 'tipo_fecho'           THEN 'NULL'
               WHEN 'km_saida'             THEN 'COALESCE($7, km_saida)'
               WHEN 'km_entrada'           THEN 'NULL'
               WHEN 'combustivel_entrada'  THEN 'NULL'
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
    USING v_old.id, v_old.versao + 1,
          CASE WHEN v_legado
            THEN 'Renovação — reaberto a ' || to_char(v_inicio AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 '; tinha terminado a ' || to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 ' (sem aluguer no intervalo)'
            ELSE 'Renovação — ciclo de ' || to_char(v_ancora AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 ' renovado a ' || to_char(v_inicio AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 '; próxima renovação a ' || to_char(v_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY')
          END,
          v_inicio, v_user_id, v_fim, p_km_fim;

    INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
    SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
      FROM public.contrato_condutores WHERE contrato_id = v_old.id;

    INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
    SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
      FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

    -- O km excedente é do ciclo que fechou — fica na versão que sai. Copiá-lo
    -- cobrava-o outra vez.
    INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
    SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
      FROM public.contrato_extras
     WHERE contrato_id = v_old.id
       AND extra_nome NOT LIKE 'Km excedente%';

    INSERT INTO public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
    SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
      FROM public.contrato_taxas WHERE contrato_id = v_old.id;

    -- Não há entrega física: a viatura não saiu do motorista.
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = v_new_id
       AND tipo IN ('entrega', 'recolha')
       AND realizado_em IS NULL;

    -- Sem o prefixo "Renovado em …": esse é o das renovações de 08-09 a 24-09,
    -- sem versão, que o separador Histórico lista à parte.
    INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
    VALUES
      (v_old.id, v_old.org_id, 'alteracao', v_user_id,
       'Renovação: período fechado a ' || to_char(now() AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') ||
       CASE WHEN v_legado
            THEN ' (tinha terminado a ' || to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 '; as semanas do intervalo ficam sem aluguer)'
            ELSE '' END ||
       '. Continua na versão ' || (v_old.versao + 1) || '.'),
      (v_new_id, v_old.org_id, 'alteracao', v_user_id,
       'Renovação da versão ' || v_old.versao || '. Próxima renovação a ' ||
       to_char(v_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') || '.');

    RETURN v_new_id;
  END IF;

  -- ── Rent-a-car: a versão é a unidade de facturação, versiona como sempre ─
  v_inicio := COALESCE(v_old.data_fim, now());
  v_fim    := public.proxima_data_renovacao(
                v_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'fechado'::contrato_estado_operacional_enum,
         updated_by         = v_user_id,
         km_saida           = COALESCE(p_km_inicio, km_saida),
         km_entrada         = COALESCE(p_km_fim, km_entrada)
   WHERE id = v_old.id;

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

  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  RETURN v_new_id;
END;
$$;


-- O prazo do aviso é o mesmo do ecrã (prazoRenovacao): no TVDE manda
-- proxima_renovacao_em; sem ela, data_fim; sem nenhuma, o prazo virtual.
CREATE OR REPLACE FUNCTION public.emit_contrato_renting_renovacao_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    x.org_id,
    'contrato_renting.renovacao_proxima',
    'contratos_renting',
    x.id,
    jsonb_build_object('codigo', x.codigo, 'matricula', x.matricula, 'cliente_nome', x.cliente_nome, 'prazo', x.prazo),
    'cron'
  from (
    select
      c.id, c.org_id, c.codigo, c.matricula, cl.nome as cliente_nome,
      coalesce(
        case when c.regime = 'tvde' then c.proxima_renovacao_em end,
        c.data_fim,
        public.proxima_data_renovacao(c.data_inicio, c.renovacao_opcao::text, c.renovacao_intervalo_dias)
      )::date as prazo
    from public.contratos_renting c
    join public.clientes cl on cl.id = c.cliente_id
    where c.regime in ('rent_a_car', 'tvde')
      and coalesce(c.is_longa_duracao, false) = true
      and c.substituido_em is null
      and c.deleted_at is null
      and c.estado_operacional = 'em_curso'
      and (c.data_fim is not null or c.regime = 'tvde')
  ) x
  where x.prazo is not null
    and x.prazo <= current_date
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'contratos_renting'
        and e.entity_id = x.id
        and e.event_type = 'contrato_renting.renovacao_proxima'
        and e.processed_at is null
    );
end;
$$;

NOTIFY pgrst, 'reload schema';
