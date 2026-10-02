-- ============================================================
-- API rent-a-car, fase C: criar, consultar e cancelar reservas
-- ============================================================
-- Chamadas pela edge api-rent-a-car com service_role, o org_id e o id da
-- chave. Erros de negócio voltam como { erro: { codigo, mensagem, detalhes? } }.
-- valor_total é só o aluguer sem IVA, como no balcão; extras e cobertura vão
-- para as tabelas próprias e o total com IVA fica em dados_site.cotacao.
-- ============================================================

create or replace function public.api_reserva_resumo(p_org_id uuid, p_reserva_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id,
    'codigo', r.codigo,
    'estado', r.estado,
    'referencia_externa', r.referencia_externa,
    'periodo', jsonb_build_object('inicio', r.data_inicio, 'fim', r.data_fim,
                                  'dias', public.api_dias(r.data_inicio, r.data_fim)),
    'modelo', r.dados_site->'cotacao'->'modelo',
    'estacoes', jsonb_build_object(
      'entrega', jsonb_build_object('id', ee.id, 'nome', ee.nome),
      'recolha', jsonb_build_object('id', er.id, 'nome', er.nome)),
    'total', r.dados_site->'cotacao'->'subtotal',
    'criada_em', r.created_at)
    from public.reservas r
    left join public.estacoes ee on ee.id = r.estacao_entrega_id and ee.org_id = p_org_id
    left join public.estacoes er on er.id = r.estacao_recolha_id and er.org_id = p_org_id
   where r.id = p_reserva_id and r.org_id = p_org_id;
$$;

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
      org_id, estado, regime, modelo_id, grupo_id, grupo_nome,
      data_inicio, data_fim, estacao_entrega_id, estacao_recolha_id,
      cliente_id, cliente_nome, condutor_nome, emissor_id,
      tarifa_id, tarifa_nome, tarifa_preco_dia,
      cobertura_id, cobertura_nome, cobertura_preco_dia, cobertura_franquia,
      valor_total, valor_total_manual, franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
      observacoes, origem, api_chave_id, referencia_externa, dados_site, created_by, gestor_id)
    values (
      p_org_id, 'pendente', 'rent_a_car', v_modelo, v_m.grupo_id, v_m.grupo_nome,
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
                || to_char(v_fim at time zone 'Europe/Lisbon', 'DD/MM HH24:MI') || ' — ' || v_cliente_nome
                || '. Atribuir viatura e confirmar.';
  if v_divergente then
    v_mensagem := v_mensagem || ' Dados do site diferentes da ficha do cliente — confirmar identidade ao balcão.';
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

-- Só reservas do site desta organização; as do balcão não existem para a API.
create or replace function public.api_obter_reserva(p_org_id uuid, p_codigo bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public.api_reserva_resumo(p_org_id, r.id) from public.reservas r
      where r.org_id = p_org_id and r.codigo = p_codigo and r.origem = 'site' and r.deleted_at is null),
    public.api_erro('NAO_ENCONTRADO', 'Reserva não encontrada.'));
$$;

-- Só uma reserva pendente se cancela pela API; cancelar outra vez devolve-a como está.
create or replace function public.api_cancelar_reserva(p_org_id uuid, p_codigo bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_estado text;
begin
  select id, estado::text into v_id, v_estado from public.reservas
   where org_id = p_org_id and codigo = p_codigo and origem = 'site' and deleted_at is null
   for update;
  if not found then return public.api_erro('NAO_ENCONTRADO', 'Reserva não encontrada.'); end if;
  if v_estado = 'cancelada' then return public.api_reserva_resumo(p_org_id, v_id); end if;
  if v_estado <> 'pendente' then
    return public.api_erro('ESTADO_INVALIDO', 'A reserva já foi confirmada pela equipa; o cancelamento é feito com ela.');
  end if;
  update public.reservas set estado = 'cancelada' where id = v_id;
  return public.api_reserva_resumo(p_org_id, v_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'api_reserva_resumo(uuid, uuid)',
    'api_criar_reserva(uuid, uuid, jsonb)',
    'api_obter_reserva(uuid, bigint)',
    'api_cancelar_reserva(uuid, bigint)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
