-- Um TVDE em curso cobra sempre a viatura, esteja ou não por renovar.
--
-- Até 08-09 a data da renovação gravava-se no fim do contrato, e o aluguer só
-- se calcula entre o início e o fim. A 20260924100000 limpou esse fim de
-- legado só onde isso não cobrava semanas passadas; os restantes (fim antes de
-- 21-09) ficaram a andar sem aluguer: o Boota Singh (#802) desde 16-06. O
-- "Renovar" só os reabre a partir de hoje, e aos já renovados entre 08 e 24-09
-- nem isso (janela de 7 dias antes do próximo prazo).
--
-- Decisão da direcção (01-10-2026): volta a cobrar desde a semana de 21-09.
-- Cada contrato parado ganha uma versão nova, sem fim, a começar a 20-09 (o
-- dia de início não se cobra: o primeiro dia cobrado é 21-09). A versão que
-- sai guarda o fim antigo, que diz até onde já se cobrou; as semanas entre
-- esse fim e 21-09 ficam como estão. A próxima renovação não muda.
--
-- Não reabre quem já não tem o carro (motivo_tvde_parado_nao_reabre diz
-- porquê): esses fecham-se à mão.

-- NULL = pode reabrir a partir de p_desde; senão, o motivo.
create or replace function public.motivo_tvde_parado_nao_reabre(p_contrato uuid, p_desde timestamptz)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  c       public.contratos_renting%rowtype;
  v_outro integer;
  v_nome  text;
begin
  select * into c from public.contratos_renting where id = p_contrato;
  if not found then
    return 'contrato não existe';
  end if;
  if c.regime is distinct from 'tvde' then
    return 'não é TVDE';
  end if;
  if c.deleted_at is not null or c.substituido_em is not null
     or c.estado_operacional <> 'em_curso' then
    return 'não está em curso';
  end if;
  if c.data_fim is null then
    return 'não está parado: não tem data de fim';
  end if;
  -- O ecrã e o fecho lêem as datas em UTC: a versão antiga cobra até ao dia
  -- do fim, a nova a partir do dia a seguir a p_desde. Nenhum dia duas vezes.
  if (c.data_fim at time zone 'UTC')::date > (p_desde at time zone 'UTC')::date then
    return 'termina depois do início da versão nova';
  end if;
  if c.viatura_id is null then
    return 'sem viatura';
  end if;

  if not exists (
    select 1
      from public.contrato_condutores cc
      join public.motoristas_ativos m on m.id = cc.motorista_id
     where cc.contrato_id = c.id
       and cc.is_principal
       and (cc.data_fim is null or cc.data_fim > p_desde)
       and m.status_ativo is distinct from false
  ) then
    return 'motorista principal com a ficha inactiva';
  end if;

  select o.codigo into v_outro
    from public.contratos_renting o
   where o.org_id = c.org_id and o.viatura_id = c.viatura_id and o.id <> c.id
     and o.deleted_at is null and o.substituido_em is null
     and o.estado_operacional in ('agendado', 'em_curso')
     and o.periodo && tstzrange(p_desde, null)
   limit 1;
  if found then
    return 'viatura já no contrato #' || v_outro;
  end if;

  select r.codigo into v_outro
    from public.reservas r
   where r.org_id = c.org_id and r.viatura_id = c.viatura_id
     and r.deleted_at is null
     and r.estado in ('pendente', 'confirmada', 'em_curso')
     and r.periodo && tstzrange(p_desde, null)
     and r.id is distinct from c.reserva_id
   limit 1;
  if found then
    return 'viatura reservada (reserva #' || v_outro || ')';
  end if;

  -- Cobrar dois carros ao mesmo motorista é pior do que não cobrar nenhum.
  select o.codigo into v_outro
    from public.contrato_condutores cc
    join public.contrato_condutores oc
      on oc.motorista_id = cc.motorista_id and oc.contrato_id <> cc.contrato_id
    join public.contratos_renting o on o.id = oc.contrato_id
   where cc.contrato_id = c.id
     and cc.motorista_id is not null
     and (cc.data_fim is null or cc.data_fim > p_desde)
     and (oc.data_fim is null or oc.data_fim > p_desde)
     and o.deleted_at is null and o.substituido_em is null
     and o.estado_operacional in ('agendado', 'em_curso')
     and o.periodo && tstzrange(p_desde, null)
   limit 1;
  if found then
    return 'motorista já no contrato #' || v_outro;
  end if;

  -- A atribuição nova fecha a 19-09 as que se cruzam com ela
  -- (fn_motorista_viaturas_fecha_anteriores). Se a frota diz que outro anda
  -- com o carro, ou este motorista com outro carro, o contrato já não é real.
  select m.nome into v_nome
    from public.motorista_viaturas mv
    join public.motoristas_ativos m on m.id = mv.motorista_id
   where mv.viatura_id = c.viatura_id
     and mv.status = 'ativo'
     and (mv.data_fim is null or mv.data_fim >= (p_desde at time zone 'UTC')::date)
     and not exists (
       select 1 from public.contrato_condutores cc
        where cc.contrato_id = c.id and cc.motorista_id = mv.motorista_id)
   limit 1;
  if found then
    return 'viatura atribuída a ' || v_nome;
  end if;

  select v.matricula into v_nome
    from public.motorista_viaturas mv
    join public.viaturas v on v.id = mv.viatura_id
   where mv.viatura_id <> c.viatura_id
     and mv.status = 'ativo'
     and (mv.data_fim is null or mv.data_fim >= (p_desde at time zone 'UTC')::date)
     and exists (
       select 1 from public.contrato_condutores cc
        where cc.contrato_id = c.id and cc.motorista_id = mv.motorista_id
          and (cc.data_fim is null or cc.data_fim > p_desde))
   limit 1;
  if found then
    return 'motorista atribuído à viatura ' || v_nome;
  end if;

  return null;
end $$;

-- Igual ao ramo de legado de renovar_contrato_renting (20260924180000), com o
-- início escolhido em vez de now() e sem mexer na próxima renovação.
create or replace function public.reabrir_tvde_parado(p_contrato uuid, p_desde timestamptz)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_old    public.contratos_renting%rowtype;
  v_motivo text;
  v_autor  uuid;
  v_fim    text;
  v_cobra  text;
  v_cols   text;
  v_vals   text;
  v_new_id uuid;
begin
  select * into v_old from public.contratos_renting where id = p_contrato for update;

  v_motivo := public.motivo_tvde_parado_nao_reabre(p_contrato, p_desde);
  if v_motivo is not null then
    raise exception 'Contrato #% não reabre: %', v_old.codigo, v_motivo
      using errcode = 'check_violation';
  end if;

  -- A cascata do contrato cria eventos de calendário com criado_por
  -- obrigatório, e aqui não há auth.uid(): fica o autor do contrato.
  v_autor := coalesce(
    v_old.created_by,
    v_old.updated_by,
    (select uo.user_id from public.user_organizacoes uo
      where uo.org_id = v_old.org_id and uo.is_admin
      order by uo.created_at limit 1)
  );
  if v_autor is null then
    raise exception 'Contrato #% não reabre: sem autor para o registar', v_old.codigo;
  end if;

  v_fim   := to_char(v_old.data_fim at time zone 'Europe/Lisbon', 'DD/MM/YYYY');
  v_cobra := to_char((p_desde at time zone 'UTC')::date + 1, 'DD/MM/YYYY');

  -- A versão que sai fica com o fim antigo: é ele que diz até onde já se cobrou.
  -- substituido_em no mesmo UPDATE: sem ele, as cascatas do fecho desactivavam
  -- a ficha do motorista e concluíam a reserva.
  update public.contratos_renting
     set substituido_em     = now(),
         estado_operacional = 'fechado'::public.contrato_estado_operacional_enum,
         updated_by         = v_autor
   where id = v_old.id;

  -- Cópia de todas as colunas, como na renovação: uma coluna nova na tabela
  -- não se perde. O código e a próxima renovação mantêm-se.
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
         string_agg(
           case c.column_name
             when 'versao'               then '$2'
             when 'contrato_anterior_id' then '$1'
             when 'motivo_versao'        then '$3'
             when 'substituido_em'       then 'null'
             when 'deleted_at'           then 'null'
             when 'data_inicio'          then '$4'
             when 'data_fim'             then 'null'
             when 'estado_operacional'   then '''em_curso''::public.contrato_estado_operacional_enum'
             when 'estado_financeiro'    then '''pendente''::public.contrato_estado_financeiro_enum'
             when 'facturado_em'         then 'null'
             when 'total_subtotal'       then 'null'
             when 'total_iva'            then 'null'
             when 'total_final'          then 'null'
             when 'tipo_fecho'           then 'null'
             when 'km_entrada'           then 'null'
             when 'combustivel_entrada'  then 'null'
             when 'eletricidade_entrada' then 'null'
             when 'dua_devolvida_em'     then 'null'
             when 'entrega_via_any_rent' then 'false'
             when 'created_by'           then '$5'
             when 'updated_by'           then '$5'
             when 'created_at'           then 'now()'
             when 'updated_at'           then 'now()'
             else quote_ident(c.column_name)
           end, ', ' order by c.ordinal_position)
    into v_cols, v_vals
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name   = 'contratos_renting'
     and c.is_generated = 'NEVER'
     and c.column_name <> 'id';

  execute format(
    'insert into public.contratos_renting (%s) select %s from public.contratos_renting where id = $1 returning id',
    v_cols, v_vals
  )
  into v_new_id
  using v_old.id, v_old.versao + 1,
        'Reaberto: estava em curso sem cobrar a viatura desde ' || v_fim ||
        ' (data de fim antiga). Volta a cobrar desde ' || v_cobra || '.',
        p_desde, v_autor;

  -- Só os condutores de hoje, a começar com a versão: o fecho da semana só
  -- dá o aluguer ao principal com vigência nessa semana.
  insert into public.contrato_condutores
    (org_id, contrato_id, cliente_id, motorista_id, is_principal, data_inicio, data_fim, created_by)
  select org_id, v_new_id, cliente_id, motorista_id, is_principal,
         greatest(data_inicio, p_desde), data_fim, v_autor
    from public.contrato_condutores
   where contrato_id = v_old.id
     and (data_fim is null or data_fim > p_desde);

  insert into public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
  select org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    from public.contrato_coberturas where contrato_id = v_old.id;

  insert into public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  select org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    from public.contrato_extras
   where contrato_id = v_old.id
     and extra_nome not like 'Km excedente%';

  insert into public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
  select org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    from public.contrato_taxas where contrato_id = v_old.id;

  -- Não há entrega física: a viatura nunca saiu do motorista.
  delete from public.calendario_eventos
   where origem_tipo = 'contrato_renting'
     and origem_id   = v_new_id
     and tipo in ('entrega', 'recolha')
     and realizado_em is null;

  insert into public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  values
    (v_old.id, v_old.org_id, 'alteracao', v_autor,
     'Estava em curso sem cobrar a viatura desde ' || v_fim ||
     ' (data de fim antiga). Reaberto na versão ' || (v_old.versao + 1) ||
     ', que cobra desde ' || v_cobra || '.'),
    (v_new_id, v_old.org_id, 'alteracao', v_autor,
     'Reabertura da versão ' || v_old.versao || ': cobra a viatura desde ' || v_cobra ||
     '. As semanas entre ' || v_fim || ' e essa data ficam sem aluguer.');

  return v_new_id;
end $$;

revoke all on function public.motivo_tvde_parado_nao_reabre(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reabrir_tvde_parado(uuid, timestamptz) from public, anon, authenticated;

-- Os contratos parados de hoje. O mais recente primeiro: se dois partilham
-- carro ou motorista, reabre o que está em uso e o outro fica de fora.
do $$
declare
  -- Meio-dia UTC de 20-09: a data lê-se 20-09 em qualquer fuso, e o
  -- primeiro dia cobrado é 21-09.
  v_desde constant timestamptz := '2026-09-20 12:00:00+00';
  r record;
begin
  for r in
    select c.id
      from public.contratos_renting c
     where c.regime = 'tvde'
       and c.estado_operacional = 'em_curso'
       and c.deleted_at is null
       and c.substituido_em is null
       and c.data_fim is not null
     order by c.data_fim desc, c.codigo desc
  loop
    if public.motivo_tvde_parado_nao_reabre(r.id, v_desde) is null then
      perform public.reabrir_tvde_parado(r.id, v_desde);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
