-- TVDE reaberto à mão em 01-10 passa a cobrar desde 21-09.
--
-- Quem carregou em "Renovar" num contrato parado antes de 20261001190000 criou
-- uma versão que começa a 01-10, e a versão anterior acabou meses antes: a
-- semana de 21-09 ficou sem contrato e o aluguer sai 0,00 (Boota Singh, #802).
-- A 20261001190000 não os apanhou porque já não estavam parados.
--
-- Decisão da direcção (01-10-2026): cobra desde 21-09. A versão que sai já
-- guarda o fim antigo; só recua o início da versão viva (e o do condutor e da
-- atribuição à viatura que nasceram com ela). Não mexe em quem já tem
-- cobertura nessa semana nem em contratos com a viatura ocupada.

-- NULL = corrigido; senão, o motivo de ficar como está.
create or replace function public.corrigir_inicio_tvde_reaberto(p_contrato uuid, p_desde timestamptz)
returns text
language plpgsql
set search_path to 'public'
as $$
declare
  c        public.contratos_renting%rowtype;
  a        public.contratos_renting%rowtype;
  v_outro  integer;
  v_inicio timestamptz;
begin
  select * into c from public.contratos_renting where id = p_contrato for update;
  if not found then
    return 'contrato não existe';
  end if;
  if c.regime is distinct from 'tvde' or c.deleted_at is not null
     or c.substituido_em is not null or c.estado_operacional <> 'em_curso' then
    return 'não está em curso';
  end if;
  if c.data_fim is not null then
    return 'tem data de fim';
  end if;
  if c.contrato_anterior_id is null then
    return 'não é uma reabertura';
  end if;
  if c.data_inicio <= p_desde then
    return 'já cobre a semana';
  end if;

  select * into a from public.contratos_renting where id = c.contrato_anterior_id;
  if a.data_fim is null
     or (a.data_fim at time zone 'UTC')::date > (p_desde at time zone 'UTC')::date then
    return 'a versão anterior cobre a semana';
  end if;

  if not exists (
    select 1
      from public.contrato_condutores cc
      join public.motoristas_ativos m on m.id = cc.motorista_id
     where cc.contrato_id = c.id and cc.is_principal
       and cc.data_fim is null
       and m.status_ativo is distinct from false
  ) then
    return 'motorista principal com a ficha inactiva';
  end if;

  select o.codigo into v_outro
    from public.contratos_renting o
   where o.org_id = c.org_id and o.viatura_id = c.viatura_id and o.id <> c.id
     and o.deleted_at is null and o.substituido_em is null
     and o.estado_operacional in ('agendado', 'em_curso')
     and o.periodo && tstzrange(p_desde, c.data_inicio)
   limit 1;
  if found then
    return 'viatura já no contrato #' || v_outro;
  end if;

  v_inicio := c.data_inicio;

  update public.contratos_renting set data_inicio = p_desde where id = c.id;

  update public.contrato_condutores
     set data_inicio = p_desde
   where contrato_id = c.id and data_inicio > p_desde;

  -- A atribuição que a versão criou: começa com ela.
  update public.motorista_viaturas mv
     set data_inicio = (p_desde at time zone 'UTC')::date
   where mv.viatura_id = c.viatura_id and mv.org_id = c.org_id
     and mv.data_inicio = (v_inicio at time zone 'Europe/Lisbon')::date
     and mv.observacoes in (
       'Gerado ao associar condutor ao contrato #' || c.codigo,
       'Gerado automaticamente pelo contrato de aluguer #' || c.codigo);

  insert into public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  values (c.id, c.org_id, 'alteracao', coalesce(c.updated_by, c.created_by),
          'Início recuado de ' || to_char(v_inicio at time zone 'Europe/Lisbon', 'DD/MM/YYYY') ||
          ' para ' || to_char(p_desde at time zone 'UTC', 'DD/MM/YYYY') ||
          ': o contrato tinha ficado parado e volta a cobrar desde 21/09/2026.');

  return null;
end $$;

revoke all on function public.corrigir_inicio_tvde_reaberto(uuid, timestamptz) from public, anon, authenticated;

-- De vez: um TVDE reaberto por "Renovar" depois de parado começa na semana que
-- se está a fechar (a anterior à de hoje), não hoje. Sem isto cada renovação
-- tardia deixava a semana em branco e o aluguer a 0,00, sem aviso nenhum.
-- Só a reabertura de um contrato parado há mais de uma semana; renovações
-- seguidas e trocas de viatura mantêm a data. Com a viatura ocupada nesse
-- intervalo não mexe: a renovação segue como estava.
create or replace function public.fn_tvde_reaberto_cobra_desde_semana_anterior()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Domingo da semana anterior, ao meio-dia UTC: o primeiro dia cobrado é a
  -- segunda-feira dessa semana (o dia de início não se cobra).
  v_desde   timestamptz := (((date_trunc('week', now() at time zone 'Europe/Lisbon'))::date - 8)::timestamp
                            + interval '12 hours') at time zone 'UTC';
  v_fim_ant timestamptz;
begin
  if NEW.regime is distinct from 'tvde' or NEW.data_fim is not null
     or NEW.contrato_anterior_id is null or NEW.data_inicio is null
     or NEW.data_inicio <= v_desde
     or coalesce(NEW.motivo_versao, '') not like 'Renova%reaberto a %' then
    return NEW;
  end if;

  select a.data_fim into v_fim_ant from public.contratos_renting a where a.id = NEW.contrato_anterior_id;
  if v_fim_ant is null or v_fim_ant >= v_desde then
    return NEW;
  end if;

  if exists (
    select 1 from public.contratos_renting o
     where o.org_id = NEW.org_id and o.viatura_id = NEW.viatura_id
       and o.id <> NEW.contrato_anterior_id
       and o.deleted_at is null and o.substituido_em is null
       and o.estado_operacional in ('agendado', 'em_curso')
       and o.periodo && tstzrange(v_desde, NEW.data_inicio)
  ) then
    return NEW;
  end if;

  NEW.data_inicio := v_desde;
  return NEW;
end $$;

drop trigger if exists trg_b_tvde_reaberto_cobra on public.contratos_renting;
create trigger trg_b_tvde_reaberto_cobra
  before insert on public.contratos_renting
  for each row execute function public.fn_tvde_reaberto_cobra_desde_semana_anterior();

revoke all on function public.fn_tvde_reaberto_cobra_desde_semana_anterior() from public, anon, authenticated;

do $$
declare
  v_desde constant timestamptz := '2026-09-20 12:00:00+00';
  r record;
begin
  for r in
    select c.id
      from public.contratos_renting c
     where c.regime = 'tvde' and c.estado_operacional = 'em_curso'
       and c.deleted_at is null and c.substituido_em is null
       and c.data_fim is null and c.contrato_anterior_id is not null
       and c.data_inicio > v_desde
     order by c.codigo
  loop
    perform public.corrigir_inicio_tvde_reaberto(r.id, v_desde);
  end loop;
end $$;

notify pgrst, 'reload schema';
