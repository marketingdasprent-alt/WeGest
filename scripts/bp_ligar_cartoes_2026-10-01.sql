-- Liga as transacções BP importadas por CSV ao cartão, para o gatilho
-- resolver_motorista encontrar o titular (histórico de Cartões Frota).
-- Os CSV de 15/09, 21/09 e 28/09 entraram sem cartão: 292 transacções sem
-- motorista nem cliente. Correr bloco a bloco no SQL Editor. Idempotente.

-- Bloco 0: pré-visualização (não altera nada) ------------------------------
with tx as (
  select t.id, t.org_id, t.transaction_date, t.amount,
         regexp_replace(split_part(replace(trim(t.raw_data->>'Nº cartão'), '.', ','), ',', 1),
                        '\D', '', 'g') as numero
  from public.bp_transacoes t
  where t.card_id is null
)
select case when r.motorista_id is not null then 'motorista'
            when r.cliente_id   is not null then 'cliente'
            else 'sem titular nessa data' end as fica_com,
       count(*) as transaccoes, sum(tx.amount) as valor
from tx
cross join lateral public.resolver_titular_por_cartao_em(
  tx.org_id, 'bp', tx.numero, tx.transaction_date) r
where tx.numero <> ''
group by 1 order by 1;

-- Bloco 1: criar os cartões vindos do CSV ----------------------------------
insert into public.bp_cartoes (integracao_id, org_id, card_id, card_number)
select distinct t.integracao_id, t.org_id, 'csv:' || n.numero, n.numero
from public.bp_transacoes t
cross join lateral (
  select regexp_replace(split_part(replace(trim(t.raw_data->>'Nº cartão'), '.', ','), ',', 1),
                        '\D', '', 'g') as numero
) n
where t.card_id is null and n.numero <> ''
on conflict (integracao_id, card_id) do nothing;

-- Bloco 2: ligar as transacções (o gatilho resolve o titular) ----------------
update public.bp_transacoes t
   set card_id = bc.id
  from public.bp_cartoes bc
 where t.card_id is null
   and bc.integracao_id = t.integracao_id
   and bc.card_id = 'csv:' || regexp_replace(
         split_part(replace(trim(t.raw_data->>'Nº cartão'), '.', ','), ',', 1), '\D', '', 'g');

-- Bloco 2b: voltar a resolver as que ficaram sem titular -------------------
-- Correr depois de a BO registar em Cartões Frota os titulares em falta.
update public.bp_transacoes
   set updated_at = updated_at
 where card_id is not null
   and motorista_id is null
   and cliente_id is null;

-- Bloco 3: conferir --------------------------------------------------------
select count(*) filter (where card_id is null)                      as sem_cartao,
       count(*) filter (where motorista_id is not null)             as com_motorista,
       count(*) filter (where cliente_id is not null)               as com_cliente,
       count(*) filter (where card_id is not null
                          and motorista_id is null
                          and cliente_id is null)                   as cartao_sem_titular
from public.bp_transacoes;
