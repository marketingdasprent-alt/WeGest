-- ============================================================
-- Reserva do site entra já com matrícula
-- ============================================================
-- O WeGest protege a ocupação por matrícula (reservas_no_overbooking,
-- contratos_no_overbooking, contrato recusado com reserva no carro, ecrãs que
-- escondem carros ocupados). Uma reserva do site só com modelo escapava a tudo
-- isto. Agora a API escolhe a viatura ao reservar e a reserva fica igual às do
-- balcão; a equipa confirma ou troca o carro.
-- ============================================================

-- ── 1. Escolha da viatura ───────────────────────────────────────────────────
-- Entre as viaturas do modelo livres o período todo, a que encaixa mais justo:
-- menos tempo parado entre agora e o início e depois do fim (até 30 dias), para os carros com
-- períodos longos livres ficarem para outras reservas.
create or replace function public.api_escolher_viatura(
  p_org_id uuid, p_modelo_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns uuid language sql stable security definer set search_path = public as $$
  with livres as (
    select l.viatura_id from public.api_viaturas_livres(p_org_id, p_inicio, p_fim) l
     where l.modelo_id = p_modelo_id
  ), ocup as (
    select c.viatura_id, c.data_inicio as ini, c.data_fim as fim from public.contratos_renting c
     where c.org_id = p_org_id and c.deleted_at is null and c.substituido_em is null
       and c.estado_operacional::text in ('agendado', 'em_curso')
    union all
    select r.viatura_id, r.data_inicio, r.data_fim from public.reservas r
     where r.org_id = p_org_id and r.deleted_at is null and r.viatura_id is not null
       and r.estado::text in ('pendente', 'confirmada', 'em_curso')
    union all
    select mv.viatura_id, mv.data_inicio::timestamptz, (mv.data_fim + 1)::timestamptz
      from public.motorista_viaturas mv
     where mv.status = 'ativo'
  )
  select l.viatura_id
    from livres l
    join public.viaturas v on v.id = l.viatura_id
   order by
     -- O tempo parado antes conta de agora: o passado já não se vende.
     least(extract(epoch from p_inicio - greatest(now(), coalesce(
             (select max(o.fim) from ocup o where o.viatura_id = l.viatura_id and o.fim <= p_inicio),
             now()))), 2592000)
     + least(extract(epoch from coalesce(
             (select min(o.ini) from ocup o where o.viatura_id = l.viatura_id and o.ini >= p_fim),
             p_fim + interval '30 days') - p_fim), 2592000),
     v.matricula
   limit 1;
$$;

-- ── 2. api_criar_reserva com a viatura ──────────────────────────────────────
-- Copiada de 20261003110000; muda a escolha da viatura, o insert e a mensagem
-- do sino, e uma corrida perdida para o balcão (EXCLUDE) dá SEM_DISPONIBILIDADE.
create or replace function public.api_criar_reserva(
  p_org_id uuid, p_api_chave_id uuid, p_pedido jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_ref text := p_pedido->>'referencia_externa';
  v_modelo uuid := (p_pedido->>'modelo_id')::uuid;
  v_inicio timestamptz := (p_pedido->>'inicio')::timestamptz;
  v_fim timestamptz := (p_pedido->>'fim')::timestamptz;
  v_entrega uuid := (p_pedido->>'entrega')::uuid;
  v_recolha uuid := (p_pedido->>'recolha')::uuid;
  v_cobertura uuid := nullif(p_pedido->>'cobertura_id', '')::uuid;
  v_extras jsonb := coalesce(p_pedido->'extras', '[]'::jsonb);
  v_cli jsonb := p_pedido->'cliente';
  v_nif text := nullif(btrim(coalesce(p_pedido->'cliente'->>'nif', '')), '');
  v_email text := lower(btrim(p_pedido->'cliente'->>'email'));
  v_existente uuid; v_emissor uuid; v_cot jsonb; v_total numeric; v_esperado numeric;
  v_cliente uuid; v_cliente_nome text; v_reserva uuid; v_codigo bigint; v_dias int;
  v_m record; v_pr record; v_tarifa uuid; v_tarifa_nome text;
  v_cob_nome text; v_cob_preco numeric; v_cob_franquia numeric;
  v_cliente_email text; v_por_nif boolean := false; v_divergente boolean := false; v_mensagem text;
  v_viatura uuid; v_matricula text;
begin
  -- Sem modelo o lock seria hashtext(null): não serializava nada.
  if v_modelo is null or v_ref is null then
    return public.api_erro('PARAMETRO_INVALIDO', 'modelo_id e referencia_externa são obrigatórios.');
  end if;

  -- Lock antes de tudo: serializa a última viatura do modelo e repetições do mesmo pedido.
  perform pg_advisory_xact_lock(hashtext('api_reserva:' || p_org_id::text || ':' || v_modelo::text));

  select id into v_existente from public.reservas
   where org_id = p_org_id and api_chave_id = p_api_chave_id and referencia_externa = v_ref;
  if found then
    return public.api_reserva_resumo(p_org_id, v_existente) || jsonb_build_object('repetida', true);
  end if;

  select d.emissor_rent_a_car_id into v_emissor
    from public.org_definicoes d
    join public.clientes e on e.id = d.emissor_rent_a_car_id
                          and e.org_id = p_org_id and e.is_emissora and e.deleted_at is null
   where d.org_id = p_org_id;
  if v_emissor is null then
    return public.api_erro('CONFIG_EM_FALTA', 'Empresa emissora das reservas do site por configurar.');
  end if;

  if v_nif is not null and not public.nif_pt_valido(v_nif) then
    return public.api_erro('PARAMETRO_INVALIDO', 'cliente.nif não é um NIF português válido. Clientes estrangeiros omitem-no.');
  end if;

  -- Revalida período, tarifa, extras, cobertura e disponibilidade (já com a procura sem viatura).
  v_cot := public.api_cotacao(p_org_id, v_modelo, v_inicio, v_fim, v_entrega, v_recolha, v_extras, v_cobertura);
  if v_cot ? 'erro' then return v_cot; end if;

  v_total := (v_cot->'subtotal'->>'com_iva')::numeric;
  v_esperado := round((p_pedido->>'total_esperado')::numeric, 2);
  if v_esperado is distinct from v_total then
    return jsonb_set(
      public.api_erro('PRECO_ALTERADO', 'O preço mudou desde a cotação. Confirme o novo total com o cliente.'),
      '{erro,detalhes}', v_cot);
  end if;

  -- Matrícula escolhida já: a reserva passa a ocupar um carro concreto e as
  -- protecções do WeGest (sobreposição, contrato com reserva) valem para ela.
  v_viatura := public.api_escolher_viatura(p_org_id, v_modelo, v_inicio, v_fim);
  if v_viatura is null then
    return public.api_erro('SEM_DISPONIBILIDADE', 'Sem viaturas deste modelo livres nestas datas.');
  end if;
  select matricula into v_matricula from public.viaturas where id = v_viatura;

  select * into v_m from public.api_modelos_publicaveis(p_org_id) where modelo_id = v_modelo;
  v_tarifa := public.api_tarifa_site(p_org_id);
  select nome into v_tarifa_nome from public.renting_tarifas where id = v_tarifa and org_id = p_org_id;
  select * into v_pr from public.renting_tarifa_precos_modelo
   where modelo_id = v_modelo and tarifa_id = v_tarifa and org_id = p_org_id;
  v_dias := (v_cot->'periodo'->>'dias')::int;
  if v_cobertura is not null then
    select nome, preco_dia, franquia_valor into v_cob_nome, v_cob_preco, v_cob_franquia
      from public.renting_coberturas where id = v_cobertura and org_id = p_org_id;
  end if;

  -- Cliente e reserva no mesmo bloco: se o insert da reserva perder a corrida
  -- da idempotência, o cliente novo também é desfeito.
  begin
    -- Cliente: por NIF, senão por email; o mais antigo; nunca uma emissora; nunca alterado.
    if v_nif is not null then
      select id, nome, email into v_cliente, v_cliente_nome, v_cliente_email from public.clientes
       where org_id = p_org_id and deleted_at is null and not is_emissora and nif = v_nif
       order by created_at, id limit 1;
      v_por_nif := v_cliente is not null;
    end if;
    if v_cliente is null then
      select id, nome, email into v_cliente, v_cliente_nome, v_cliente_email from public.clientes
       where org_id = p_org_id and deleted_at is null and not is_emissora and lower(btrim(email)) = v_email
       order by created_at, id limit 1;
    end if;
    if v_cliente is not null then
      -- Liga e avisa: a ficha não muda, mas a equipa confirma a identidade ao balcão.
      v_divergente :=
        lower(regexp_replace(btrim(v_cliente_nome), '\s+', ' ', 'g'))
          is distinct from lower(regexp_replace(btrim(v_cli->>'nome'), '\s+', ' ', 'g'))
        or (v_por_nif and v_cliente_email is not null
            and lower(btrim(v_cliente_email)) is distinct from v_email);
    else
      insert into public.clientes (org_id, nome, email, telefone, nif, data_nascimento, morada,
                                   codigo_postal, localidade, pais, tipo_cliente, created_by)
      values (p_org_id, btrim(v_cli->>'nome'), v_email, btrim(v_cli->>'telefone'), v_nif,
              (v_cli->>'data_nascimento')::date, nullif(btrim(v_cli->>'morada'), ''),
              nullif(btrim(v_cli->>'codigo_postal'), ''), nullif(btrim(v_cli->>'localidade'), ''),
              coalesce(nullif(btrim(v_cli->>'pais'), ''), 'Portugal'), 'particular', null)
      returning id, nome into v_cliente, v_cliente_nome;
    end if;

    insert into public.reservas (
      org_id, estado, regime, modelo_id, viatura_id, matricula, grupo_id, grupo_nome,
      data_inicio, data_fim, estacao_entrega_id, estacao_recolha_id,
      cliente_id, cliente_nome, condutor_nome, emissor_id,
      tarifa_id, tarifa_nome, tarifa_preco_dia,
      cobertura_id, cobertura_nome, cobertura_preco_dia, cobertura_franquia,
      valor_total, valor_total_manual, franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
      observacoes, origem, api_chave_id, referencia_externa, dados_site, created_by, gestor_id)
    values (
      p_org_id, 'pendente', 'rent_a_car', v_modelo, v_viatura, v_matricula, v_m.grupo_id, v_m.grupo_nome,
      v_inicio, v_fim, v_entrega, v_recolha,
      v_cliente, v_cliente_nome, v_cliente_nome, v_emissor,
      v_tarifa, v_tarifa_nome, v_m.preco_dia,
      v_cobertura, v_cob_nome, v_cob_preco, v_cob_franquia,
      round(v_m.preco_dia * v_dias, 2), round(v_m.preco_dia * v_dias, 2),
      case when v_cobertura is not null then v_cob_franquia else v_pr.franquia_valor end,
      v_pr.caucao_valor, v_pr.km_mensal, v_pr.km_adicional_valor,
      nullif(btrim(p_pedido->>'mensagem'), ''), 'site', p_api_chave_id, v_ref,
      jsonb_build_object('cliente', v_cli, 'carta_conducao', p_pedido->'carta_conducao',
                         'mensagem', p_pedido->>'mensagem', 'total_esperado', v_esperado, 'cotacao', v_cot,
                         'cliente_divergente', v_divergente),
      null, null)
    returning id, codigo into v_reserva, v_codigo;
  exception when unique_violation then
    -- O mesmo pedido noutro modelo (outro lock) chegou primeiro: devolve o que existe.
    select id into v_existente from public.reservas
     where org_id = p_org_id and api_chave_id = p_api_chave_id and referencia_externa = v_ref;
    if v_existente is null then raise; end if;
    return public.api_reserva_resumo(p_org_id, v_existente) || jsonb_build_object('repetida', true);
  when exclusion_violation then
    -- O balcão reservou o mesmo carro entre a escolha e o insert.
    return public.api_erro('SEM_DISPONIBILIDADE', 'Sem viaturas deste modelo livres nestas datas.');
  end;

  insert into public.reserva_extras (org_id, reserva_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  select p_org_id, v_reserva, e.id, e.nome, e.preco_unidade, e.tipo_calculo, (x->>'quantidade')::int,
         round(e.preco_unidade * (x->>'quantidade')::int * case when e.tipo_calculo = 'dia' then v_dias else 1 end, 2)
    from jsonb_array_elements(v_extras) x
    join public.renting_extras e on e.id = (x->>'extra_id')::uuid and e.org_id = p_org_id;

  if v_cobertura is not null then
    insert into public.reserva_coberturas (org_id, reserva_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
    values (p_org_id, v_reserva, v_cobertura, v_cob_nome, v_cob_preco, v_cob_franquia);
  end if;

  insert into public.reserva_condutores (org_id, reserva_id, cliente_id, is_principal)
  values (p_org_id, v_reserva, v_cliente, true);

  v_mensagem := 'Reserva #' || v_codigo || ' do site: ' || v_m.marca || ' ' || v_m.modelo || ', '
                || to_char(v_inicio at time zone 'Europe/Lisbon', 'DD/MM HH24:MI') || ' a '
                || to_char(v_fim at time zone 'Europe/Lisbon', 'DD/MM HH24:MI') || ', ' || v_cliente_nome
                || '. Viatura proposta: ' || v_matricula || '. Confirmar ou trocar.';
  if v_divergente then
    v_mensagem := v_mensagem || ' Dados do site diferentes da ficha do cliente: confirmar identidade ao balcão.';
  end if;

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  values (p_org_id, 'reserva.site_recebida', 'reservas', v_reserva, jsonb_build_object(
    'codigo', v_codigo,
    'modelo', v_m.marca || ' ' || v_m.modelo,
    'cliente', v_cliente_nome,
    'cliente_divergente', v_divergente,
    'data_inicio', v_inicio,
    'data_fim', v_fim,
    'total', v_total,
    'mensagem', v_mensagem),
    'edge_function');

  return public.api_reserva_resumo(p_org_id, v_reserva);
end $$;

-- ── 3. Estado do carro com reserva do site pendente ─────────────────────────
-- Copiada do baseline. Uma reserva do site pendente e ainda não terminada também
-- marca a viatura como reservada: os ecrãs da assistência e do check-in só olham
-- para o estado. As do balcão continuam a contar só quando confirmadas.
CREATE OR REPLACE FUNCTION public.recalcular_disponibilidade_viatura(p_viatura_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_novo   text;
BEGIN
  IF p_viatura_id IS NULL THEN RETURN; END IF;

  SELECT status INTO v_status FROM public.viaturas WHERE id = p_viatura_id;
  IF v_status IS NULL THEN RETURN; END IF;

  IF v_status IN ('manutencao', 'inativo', 'vendida', 'em_recolha') THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contratos_renting c
    WHERE c.viatura_id = p_viatura_id
      AND c.deleted_at IS NULL
      AND c.estado_operacional = 'em_curso'
  ) THEN
    v_novo := 'em_uso';
  ELSIF EXISTS (
    SELECT 1 FROM public.contratos_renting c
    WHERE c.viatura_id = p_viatura_id
      AND c.deleted_at IS NULL
      AND c.estado_operacional = 'agendado'
  ) OR EXISTS (
    SELECT 1 FROM public.reservas r
    WHERE r.viatura_id = p_viatura_id
      AND r.deleted_at IS NULL
      AND (r.estado = 'confirmada'
           OR (r.estado = 'pendente' AND r.origem = 'site' AND r.data_fim > now()))
  ) THEN
    v_novo := 'reservada';
  ELSE
    v_novo := 'disponivel';
  END IF;

  IF v_novo IS DISTINCT FROM v_status THEN
    UPDATE public.viaturas SET status = v_novo WHERE id = p_viatura_id;
  END IF;
END;
$function$;

-- ── 4. Grants ───────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
revoke execute on function public.api_escolher_viatura(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.api_escolher_viatura(uuid, uuid, timestamptz, timestamptz) to service_role;
revoke execute on function public.api_criar_reserva(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.api_criar_reserva(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
