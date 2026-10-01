-- ============================================================
-- No dia em que um cartão muda de mãos, conta a HORA da entrega
-- ============================================================
-- Decisão do Thiago (2026-10-01): os abastecimentos do dia da entrega são de
-- quem tinha o cartão até à hora em que a entrega foi registada, e de quem o
-- recebeu a partir dela. Até aqui o dia inteiro ficava com quem entregou (o
-- período novo só começa no dia seguinte, por causa da restrição de datas):
-- a 23/09 o Gurbhej atestou uma hora depois de receber o Repsol 0511 e os
-- 100 € caíram no Luiz.
--
-- As datas (de/ate) e a restrição de sobreposição ficam como estão. Guarda-se
-- o momento da entrega e o resolvedor usa-o só nesse dia.
--
-- FUSOS: transaction_date guarda a hora LOCAL da bomba marcada como UTC (a
-- "HORA OPERAÇÃO 12:23" da Repsol fica 12:23+00); entregue_em é UTC a sério.
-- Compara-se tudo em hora de Lisboa.
--
-- Efeito nos dados à data: 2 abastecimentos, 125 € (o do Luiz para o Gurbhej
-- e 25 € do Alex Sandro para o Miguel Maia a 21/09). Aplicar à mão no SQL
-- Editor; idempotente.
-- ============================================================

-- 1) Momento da entrega -------------------------------------------------------
alter table public.cartao_atribuicoes add column if not exists entregue_em timestamptz;

comment on column public.cartao_atribuicoes.entregue_em is
  'Momento em que a entrega foi registada. Se foi registada na véspera do início '
  '(o dia da troca), os abastecimentos desse dia a partir desta hora são deste titular.';

-- Entregas já registadas: a hora do registo é a melhor aproximação que existe.
update public.cartao_atribuicoes
   set entregue_em = created_at
 where entregue_em is null
   and origem = 'associacao';

alter table public.cartao_atribuicoes alter column entregue_em set default now();

-- 2) Quem tinha o cartão naquele momento --------------------------------------
create or replace function public.resolver_titular_por_cartao_em(
  p_org_id  uuid,
  p_tipo    text,
  p_numero  text,
  p_momento timestamptz,
  out motorista_id uuid,
  out cliente_id   uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Hora de parede da bomba (ver FUSOS acima).
  v_local timestamp := p_momento at time zone 'UTC';
  v_n     int;
begin
  -- Cartão entregue neste mesmo dia: pelas datas o titular novo só começa
  -- amanhã, mas a partir da hora da entrega o cartão já está com ele.
  select count(*), (array_agg(a.motorista_id))[1], (array_agg(a.cliente_id))[1]
    into v_n, motorista_id, cliente_id
  from public.cartao_atribuicoes a
  join public.cartoes_frota c on c.id = a.cartao_id
  where a.org_id = p_org_id
    and c.tipo = p_tipo
    and public.normalizar_numero_cartao(c.numero) = public.normalizar_numero_cartao(p_numero)
    and a.entregue_em is not null
    and (a.entregue_em at time zone 'Europe/Lisbon')::date = a.de - 1
    and v_local::date = a.de - 1
    and v_local >= (a.entregue_em at time zone 'Europe/Lisbon');

  if v_n = 1 then
    return;
  end if;

  -- Resto: pelas datas, como sempre (inclui a ambiguidade que devolve NULL).
  select r.motorista_id, r.cliente_id
    into motorista_id, cliente_id
  from public.resolver_titular_por_cartao(p_org_id, p_tipo, p_numero, v_local::date) r;
end $$;

comment on function public.resolver_titular_por_cartao_em(uuid, text, text, timestamptz) is
  'Quem tinha este cartão naquele momento. No dia da troca conta a hora da entrega; '
  'nos outros dias é resolver_titular_por_cartao. Só para o gatilho de imputação.';

revoke all on function public.resolver_titular_por_cartao_em(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolver_titular_por_cartao_em(uuid, text, text, timestamptz)
  to service_role;

-- 3) O gatilho passa a resolver pelo momento ----------------------------------
-- Igual ao de 20260909160000, mudando só a chamada do resolvedor. Mantém
-- SECURITY DEFINER e search_path vazio de 20260910163600.
create or replace function public.tg_resolver_motorista_cartao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero text;
  r        record;
begin
  if TG_TABLE_NAME = 'bp_transacoes' then
    select bc.card_number into v_numero
    from public.bp_cartoes bc where bc.id = NEW.card_id;
  else
    v_numero := NEW.card_number;
  end if;

  select * into r from public.resolver_titular_por_cartao_em(
    NEW.org_id, TG_ARGV[0], v_numero, NEW.transaction_date
  );

  if r.motorista_id is not null
     or r.cliente_id is not null
     or TG_OP = 'INSERT'
     or public.recalculo_e_forcado() then
    NEW.motorista_id := r.motorista_id;
    NEW.cliente_id   := r.cliente_id;
    NEW.devedor_cliente_id := case
      when r.cliente_id is null then null
      else public.resolver_devedor_do_cliente(
             NEW.org_id, r.cliente_id, NEW.transaction_date::date)
      end;
  else
    NEW.motorista_id       := OLD.motorista_id;
    NEW.cliente_id         := OLD.cliente_id;
    NEW.devedor_cliente_id := OLD.devedor_cliente_id;
  end if;

  return NEW;
end $$;

revoke all on function public.tg_resolver_motorista_cartao() from public, anon, authenticated;
grant execute on function public.tg_resolver_motorista_cartao() to service_role;

-- 4) Reimputar os dias de troca já registados ---------------------------------
do $$
declare
  r record;
begin
  perform set_config('wegest.recalculo_forcado', '1', true);
  for r in
    select distinct c.org_id, c.tipo,
           public.normalizar_numero_cartao(c.numero) as numero,
           a.de - 1 as dia
    from public.cartao_atribuicoes a
    join public.cartoes_frota c on c.id = a.cartao_id
    where a.entregue_em is not null
      and (a.entregue_em at time zone 'Europe/Lisbon')::date = a.de - 1
  loop
    if r.tipo = 'repsol' then
      update public.repsol_transacoes set updated_at = updated_at
       where org_id = r.org_id
         and public.normalizar_numero_cartao(card_number) = r.numero
         and (transaction_date at time zone 'UTC')::date = r.dia;
    elsif r.tipo = 'edp' then
      update public.edp_transacoes set updated_at = updated_at
       where org_id = r.org_id
         and public.normalizar_numero_cartao(card_number) = r.numero
         and (transaction_date at time zone 'UTC')::date = r.dia;
    elsif r.tipo = 'bp' then
      update public.bp_transacoes t set updated_at = t.updated_at
        from public.bp_cartoes bc
       where bc.id = t.card_id
         and t.org_id = r.org_id
         and public.normalizar_numero_cartao(bc.card_number) = r.numero
         and (t.transaction_date at time zone 'UTC')::date = r.dia;
    end if;
  end loop;
  perform set_config('wegest.recalculo_forcado', '0', true);
end $$;

notify pgrst, 'reload schema';
