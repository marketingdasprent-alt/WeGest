-- Um ID Uber ou Bolt fica com a ficha que o recebeu por último.
--
-- Até aqui ficava com a primeira: o índice motoristas_ativos_bolt_id_unico_por_org
-- recusava o ID na ficha nova enquanto a antiga o tivesse, a importação Bolt só
-- o gravava em fichas sem ID, e bolt_actualizar_bolt_id_recente saltava quando
-- outra ficha já o tinha. O André Nascimento voltou com ficha nova e, desde
-- agosto, o Bolt dele caiu na ficha antiga, inactiva e escondida do resumo.
--
-- Regra, em qualquer caminho (ecrã, importação, API):
--   1. uma ficha ACTIVA que recebe um ID fica com ele: sai das outras fichas e
--      o que já foi importado dessa conta passa para ela;
--   2. se a ficha de onde sai está inactiva, é a mesma pessoa: as outras
--      contas dela também passam;
--   3. uma ficha que é desactivada entrega cada conta à ficha activa mais
--      recente que tenha o mesmo ID.
-- As semanas que já passaram ficam como estão: o histórico só muda de ficha a
-- partir da semana anterior à mudança (no realinhamento de hoje, a semana de
-- 21 a 27/09, a pedido da direcção). Nessas semanas, o fecho ainda por pagar
-- da ficha inactiva sai (o Bolt dela passou para a nova): senão pagava-se a
-- dobrar. Fechos pagos nunca se tocam.

-- A validação dos ganhos Bolt só corre quando os ganhos mudam. Mudar o dono
-- de uma linha antiga não pode ser recusado por uma regra de importação.
-- Igual ao baseline no resto.
create or replace function public.fn_bolt_recusa_ganhos_sem_atividade()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_sem_metricas boolean;
  v_anterior     numeric;
begin
  if TG_OP = 'UPDATE'
     and NEW.ganhos_liquidos is not distinct from OLD.ganhos_liquidos
     and NEW.periodo_inicio is not distinct from OLD.periodo_inicio then
    return NEW;
  end if;

  if coalesce(NEW.ganhos_liquidos, 0) <= 0
     or coalesce(NEW.viagens_terminadas, 0) <> 0
     or coalesce(NEW.tempo_online_min, 0) <> 0
     or coalesce(NEW.distancia_total_km, 0) <> 0
     or coalesce(NEW.ganhos_campanha, 0) <> 0
     or coalesce(NEW.reembolsos_despesas, 0) <> 0
  then
    return NEW;
  end if;

  select coalesce(p.csv_sem_metricas_atividade, false)
  into v_sem_metricas
  from public.plataformas_configuracao p
  where p.id = NEW.integracao_id;

  if not coalesce(v_sem_metricas, false) then
    raise exception
      'Bolt: % EUR de ganhos sem atividade nenhuma (0 viagens, 0 min online, 0 km, '
      'sem campanha nem reembolso) para "%" no período %. Isto costuma ser um '
      'ficheiro de outra semana importado por engano — confirme o período do CSV '
      'antes de reimportar.',
      NEW.ganhos_liquidos, coalesce(NEW.motorista_nome, NEW.chave_motorista, '?'),
      coalesce(NEW.periodo, NEW.periodo_inicio::text, '?');
  end if;

  select r.ganhos_liquidos
  into v_anterior
  from public.bolt_resumos_semanais r
  where r.integracao_id = NEW.integracao_id
    and r.chave_motorista = NEW.chave_motorista
    and r.periodo_inicio = NEW.periodo_inicio - 7
  limit 1;

  if v_anterior is not null and v_anterior = NEW.ganhos_liquidos then
    raise exception
      'Bolt: % EUR para "%" no período % são cópia exacta da semana anterior. '
      'É a assinatura de um ficheiro da semana errada — confirme o período do '
      'CSV antes de reimportar.',
      NEW.ganhos_liquidos, coalesce(NEW.motorista_nome, NEW.chave_motorista, '?'),
      coalesce(NEW.periodo, NEW.periodo_inicio::text, '?');
  end if;

  return NEW;
end;
$$;

create or replace function public.mover_identidade_plataforma(
  p_org uuid,
  p_plataforma text,
  p_identificador text,
  p_motorista uuid,
  p_substituir_na_ficha boolean default true,
  -- Primeira semana que muda de ficha. Por omissão, a semana anterior à de
  -- hoje (a que está a ser fechada e paga); as anteriores ficam como estão.
  p_desde date default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_anterior   uuid;
  v_ant_activa boolean;
  v_flag       text := current_setting('wegest.movendo_identidade', true);
  v_desde      date := coalesce(p_desde, date_trunc('week', current_date - 7)::date);
  r            record;
begin
  if p_identificador is null or p_identificador = '' or p_plataforma not in ('uber', 'bolt') then
    return;
  end if;
  -- Os gatilhos da ficha não reagem às escritas feitas aqui dentro.
  perform set_config('wegest.movendo_identidade', '1', true);

  select i.motorista_id into v_anterior
    from public.motorista_plataforma_identidades i
   where i.org_id = p_org and i.plataforma = p_plataforma and i.identificador = p_identificador;

  if p_plataforma = 'bolt' then
    update public.motoristas_ativos set bolt_id = null
     where org_id = p_org and bolt_id = p_identificador and id <> p_motorista;
    update public.motoristas_ativos set bolt_id = p_identificador
     where id = p_motorista
       and (bolt_id is null or (p_substituir_na_ficha and bolt_id is distinct from p_identificador));
  else
    update public.motoristas_ativos set uber_uuid = null
     where org_id = p_org and uber_uuid = p_identificador and id <> p_motorista;
    update public.motoristas_ativos set uber_uuid = p_identificador
     where id = p_motorista
       and (uber_uuid is null or (p_substituir_na_ficha and uber_uuid is distinct from p_identificador));
  end if;

  insert into public.motorista_plataforma_identidades
    (org_id, motorista_id, plataforma, identificador, origem)
  values (p_org, p_motorista, p_plataforma, p_identificador, 'ultima_ficha')
  on conflict (org_id, plataforma, identificador)
    do update set motorista_id = excluded.motorista_id;

  -- O que já foi importado dessa conta segue a ficha, de v_desde em diante.
  if p_plataforma = 'bolt' then
    update public.bolt_resumos_semanais set motorista_id = p_motorista
     where org_id = p_org and identificador_motorista = p_identificador
       and periodo_inicio >= v_desde
       and motorista_id is distinct from p_motorista;
    update public.bolt_drivers set motorista_id = p_motorista
     where org_id = p_org and driver_uuid = p_identificador
       and motorista_id is distinct from p_motorista;
  else
    update public.uber_transactions set motorista_id = p_motorista
     where org_id = p_org and uber_driver_id = p_identificador
       and occurred_at >= v_desde
       and motorista_id is distinct from p_motorista;
    update public.uber_resumos_semanais set motorista_id = p_motorista
     where org_id = p_org and uber_driver_id = p_identificador
       and periodo_inicio >= v_desde
       and motorista_id is distinct from p_motorista;
    update public.uber_drivers set motorista_id = p_motorista
     where org_id = p_org and uber_driver_id = p_identificador
       and motorista_id is distinct from p_motorista;
  end if;

  -- Saiu de uma ficha inactiva: é a mesma pessoa, as outras contas vêm junto
  -- (sem tirar da ficha nova o ID que ela já tenha dessa plataforma).
  if v_anterior is not null and v_anterior <> p_motorista then
    select m.status_ativo is distinct from false into v_ant_activa
      from public.motoristas_ativos m where m.id = v_anterior;
    if not coalesce(v_ant_activa, false) then
      for r in
        select i.plataforma, i.identificador
          from public.motorista_plataforma_identidades i
         where i.org_id = p_org and i.motorista_id = v_anterior
      loop
        perform public.mover_identidade_plataforma(
          p_org, r.plataforma, r.identificador, p_motorista, false, v_desde);
      end loop;

      -- O fecho ainda por pagar da ficha inactiva nessas semanas era o dinheiro
      -- que acabou de passar para a ficha nova: sai, para não se pagar a dobrar.
      -- Ao recarregar a semana refaz-se, se ela ainda tiver alguma coisa. Um
      -- fecho com movimento pago ou anulado nunca se apaga (a ligação apaga o
      -- movimento em cascata).
      delete from public.motorista_liquido_semanal l
       where l.motorista_id = v_anterior
         and l.semana_inicio >= v_desde
         and not exists (
           select 1 from public.motorista_financeiro f
            where f.liquido_semanal_id = l.id and f.status is distinct from 'pendente'
         );
    end if;
  end if;

  perform set_config('wegest.movendo_identidade', coalesce(v_flag, ''), true);
end $$;

-- Antes de gravar: a ficha activa que recebe um ID Bolt tira-o das outras,
-- senão o índice único recusava-o (era assim que a primeira ficha ganhava).
create or replace function public.tg_ficha_liberta_id_plataforma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('wegest.movendo_identidade', true), '') = '1'
     or NEW.status_ativo is not distinct from false then
    return NEW;
  end if;
  if NEW.bolt_id is not null
     and (TG_OP = 'INSERT' or NEW.bolt_id is distinct from OLD.bolt_id
          or OLD.status_ativo is not distinct from false) then
    update public.motoristas_ativos set bolt_id = null
     where org_id = NEW.org_id and bolt_id = NEW.bolt_id and id <> NEW.id;
  end if;
  return NEW;
end $$;

-- Depois de gravar: a conta (e o histórico dela) passa para esta ficha; uma
-- ficha desactivada entrega as contas à activa mais recente com o mesmo ID.
create or replace function public.tg_ficha_fica_com_id_plataforma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      record;
  v_alvo uuid;
begin
  if coalesce(current_setting('wegest.movendo_identidade', true), '') = '1' then
    return null;
  end if;

  if NEW.status_ativo is distinct from false then
    if NEW.bolt_id is not null
       and (TG_OP = 'INSERT' or NEW.bolt_id is distinct from OLD.bolt_id
            or OLD.status_ativo is not distinct from false) then
      perform public.mover_identidade_plataforma(NEW.org_id, 'bolt', NEW.bolt_id, NEW.id);
    end if;
    if NEW.uber_uuid is not null
       and (TG_OP = 'INSERT' or NEW.uber_uuid is distinct from OLD.uber_uuid
            or OLD.status_ativo is not distinct from false) then
      perform public.mover_identidade_plataforma(NEW.org_id, 'uber', NEW.uber_uuid, NEW.id);
    end if;
  elsif TG_OP = 'UPDATE' and OLD.status_ativo is distinct from false then
    for r in
      select i.plataforma, i.identificador
        from public.motorista_plataforma_identidades i
       where i.org_id = NEW.org_id and i.motorista_id = NEW.id
    loop
      select m.id into v_alvo
        from public.motoristas_ativos m
       where m.org_id = NEW.org_id and m.id <> NEW.id and m.status_ativo is distinct from false
         and ((r.plataforma = 'bolt' and m.bolt_id = r.identificador)
              or (r.plataforma = 'uber' and m.uber_uuid = r.identificador))
       order by m.created_at desc
       limit 1;
      if v_alvo is not null then
        perform public.mover_identidade_plataforma(NEW.org_id, r.plataforma, r.identificador, v_alvo);
      end if;
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists trg_ficha_liberta_id_plataforma on public.motoristas_ativos;
create trigger trg_ficha_liberta_id_plataforma
  before insert or update of bolt_id, uber_uuid, status_ativo on public.motoristas_ativos
  for each row execute function public.tg_ficha_liberta_id_plataforma();

drop trigger if exists trg_ficha_fica_com_id_plataforma on public.motoristas_ativos;
create trigger trg_ficha_fica_com_id_plataforma
  after insert or update of bolt_id, uber_uuid, status_ativo on public.motoristas_ativos
  for each row execute function public.tg_ficha_fica_com_id_plataforma();

revoke all on function public.mover_identidade_plataforma(uuid, text, text, uuid, boolean, date) from public, anon, authenticated;
revoke all on function public.tg_ficha_liberta_id_plataforma() from public, anon, authenticated;
revoke all on function public.tg_ficha_fica_com_id_plataforma() from public, anon, authenticated;
grant execute on function public.mover_identidade_plataforma(uuid, text, text, uuid, boolean, date) to service_role;

-- A API também: o ID mais recente vai para a ficha activa, e uma ficha
-- inactiva já não o prende. Igual à versão do baseline no resto.
create or replace function public.bolt_actualizar_bolt_id_recente(p_integracao_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_linhas integer;
begin
  with candidatos as (
    select mp.motorista_id, mp.driver_uuid as uuid_escolhido, 1 as prioridade, null::date as quando
      from public.bolt_mapeamento_motoristas mp
      join public.bolt_drivers d on d.driver_uuid = mp.driver_uuid
     where d.status = 'active'
       and (p_integracao_id is null or mp.integracao_id = p_integracao_id)
    union all
    select r.motorista_id, r.identificador_motorista, 2, r.periodo_inicio
      from public.bolt_resumos_semanais r
     where r.motorista_id is not null and r.identificador_motorista is not null
       and r.periodo_inicio is not null and r.ganhos_brutos_app > 0
       and (p_integracao_id is null or r.integracao_id = p_integracao_id)
  ),
  escolhido as (
    select distinct on (motorista_id) motorista_id, uuid_escolhido
      from candidatos
     order by motorista_id, prioridade, quando desc nulls last, uuid_escolhido
  )
  update public.motoristas_ativos m
     set bolt_id = e.uuid_escolhido, updated_at = now()
    from escolhido e
   where m.id = e.motorista_id
     and m.status_ativo is distinct from false
     and m.bolt_id is distinct from e.uuid_escolhido
     and not exists (
       select 1 from public.motoristas_ativos outro
        where outro.org_id = m.org_id and outro.bolt_id = e.uuid_escolhido and outro.id <> m.id
          and outro.status_ativo is distinct from false
     );
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

-- Casos que já existem: conta presa numa ficha inactiva quando uma ficha
-- activa tem o mesmo ID passa para a activa mais recente (com as outras contas
-- da mesma pessoa). Duas fichas activas com a mesma conta ficam como estão.
do $$
declare
  r record;
begin
  for r in
    select distinct on (i.org_id, i.plataforma, i.identificador)
           i.org_id, i.plataforma, i.identificador, a.id as alvo
      from public.motorista_plataforma_identidades i
      join public.motoristas_ativos dona on dona.id = i.motorista_id
      join public.motoristas_ativos a
        on a.org_id = i.org_id and a.id <> dona.id and a.status_ativo is distinct from false
       and ((i.plataforma = 'bolt' and a.bolt_id = i.identificador)
            or (i.plataforma = 'uber' and a.uber_uuid = i.identificador))
     where dona.status_ativo is not distinct from false
     order by i.org_id, i.plataforma, i.identificador, a.created_at desc
  loop
    perform public.mover_identidade_plataforma(
      r.org_id, r.plataforma, r.identificador, r.alvo, true, date '2026-09-21');
  end loop;
end $$;

notify pgrst, 'reload schema';
