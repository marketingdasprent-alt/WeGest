-- Recupera o número do cartão nos carregamentos EDP importados sem ele.
-- O edp-import-csv nunca gravou card_number; desde a importação de 02/09 o
-- gatilho resolver_motorista deixou TODOS os carregamentos sem motorista
-- (1.176 até 01/10). O número está no transaction_id ("edp-<cartão>-<data>").
-- Gravá-lo dispara o gatilho, que imputa cada carregamento ao titular do
-- cartão nessa data. Correr bloco a bloco no SQL Editor. Idempotente.
--
-- ATENÇÃO: mexe em semanas já fechadas (24/08 a 21/09). Os motoristas foram
-- pagos sem este desconto: depois de correr, voltar a carregar essas semanas
-- no Contas/Resumo e tratar os acertos das já pagas.

-- Bloco 0: pré-visualização, por motorista (não altera nada) ---------------
with tx as (
  select e.org_id, e.transaction_date, e.amount,
         substring(e.transaction_id from '^edp-(\d+)-') as numero
  from public.edp_transacoes e
  where e.card_number is null
    and e.motorista_id is null
    and e.cliente_id is null
    and e.transaction_id ~ '^edp-\d+-'
)
select coalesce(m.nome, case when r.cliente_id is not null then 'cliente' else 'sem titular nessa data' end) as fica_com,
       count(*) as carregamentos, sum(tx.amount) as valor
from tx
cross join lateral public.resolver_titular_por_cartao_em(
  tx.org_id, 'edp', tx.numero, tx.transaction_date) r
left join public.motoristas_ativos m on m.id = r.motorista_id
group by 1 order by 3 desc;

-- Bloco 1: gravar o número (o gatilho resolve o titular) --------------------
update public.edp_transacoes
   set card_number = substring(transaction_id from '^edp-(\d+)-')
 where card_number is null
   and transaction_id ~ '^edp-\d+-';

-- Bloco 2: conferir --------------------------------------------------------
select count(*) filter (where card_number is null)                          as sem_numero,
       count(*) filter (where motorista_id is not null)                     as com_motorista,
       count(*) filter (where motorista_id is null and cliente_id is null)  as sem_titular
from public.edp_transacoes
where created_at >= '2026-09-01';
