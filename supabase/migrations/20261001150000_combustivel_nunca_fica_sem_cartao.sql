-- O combustível nunca fica sem o número do cartão.
--
-- O gatilho que decide quem paga cada abastecimento lê o número do cartão de
-- um sítio diferente em cada fonte (card_number na Repsol e na EDP, bp_cartoes
-- na BP). Dois importadores não escreviam nesse sítio e o gatilho gravava "sem
-- motorista" em silêncio: a EDP desde 02/09 (1.176 carregamentos) e a BP por
-- CSV desde 15/09 (292 abastecimentos). Fecharam-se semanas sem o desconto.
--
-- Agora, se o sítio habitual vier vazio, o gatilho usa o número que vem no
-- próprio ficheiro (raw_data da BP) ou no transaction_id que os importadores
-- montam ("edp-<cartão>-<data>", "bp-<cartão>-<data>"). Na Repsol e na EDP
-- grava-o também em card_number. Igual a 20261001100500 no resto.

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
    -- "Nº cartão" no CSV do portal; o Excel às vezes grava-o como "105,0".
    v_numero := coalesce(nullif(v_numero, ''), nullif(regexp_replace(split_part(replace(
      coalesce(NEW.raw_data->>'Nº cartão', NEW.raw_data->>'card_number', NEW.raw_data->>'cardNumber', ''),
      '.', ','), ',', 1), '\D', '', 'g'), ''));
  else
    v_numero := NEW.card_number;
  end if;

  v_numero := coalesce(nullif(v_numero, ''), substring(NEW.transaction_id from '^[a-z]+-(\d+)-'));

  if TG_TABLE_NAME <> 'bp_transacoes' then
    if NEW.card_number is null then
      NEW.card_number := v_numero;
    end if;
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

notify pgrst, 'reload schema';
