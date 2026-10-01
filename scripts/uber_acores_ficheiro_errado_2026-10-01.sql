-- A 28/09 às 08:32 o ficheiro "20260921-20260927-UBER URBANGO.csv" foi
-- importado na integração Uber Açores (e um minuto depois, bem, na Uber
-- Urbango). Os 17 motoristas da Urbango ficaram com os ganhos Uber da semana
-- 21–27/09 a dobrar, e o ficheiro da Uber Açores dessa semana nunca entrou.
-- Isto tira o que a importação errada gravou na Uber Açores. Correr bloco a
-- bloco no SQL Editor. Idempotente.
--
-- Depois: importar "20260921-20260927-UBER AÇORES.csv" na Uber Açores e
-- voltar a carregar a semana 21/09 no Contas/Resumo (está fechada mas por pagar).

-- Bloco 0: o que vai sair (não altera nada) --------------------------------
select 'uber_resumos_semanais' as tabela, count(*), sum(ganhos_brutos)
  from public.uber_resumos_semanais
 where integracao_id = '2fbb4a4a-f7a0-43f4-b02f-cc57e8d87f22'
   and periodo_inicio = '2026-09-21'
   and created_at >= '2026-09-28 08:31+00' and created_at < '2026-09-28 08:33+00'
union all
select 'uber_transactions', count(*), sum(gross_amount)
  from public.uber_transactions
 where integracao_id = '2fbb4a4a-f7a0-43f4-b02f-cc57e8d87f22'
   and created_at >= '2026-09-28 08:31+00' and created_at < '2026-09-28 08:33+00'
union all
select 'uber_drivers', count(*), null
  from public.uber_drivers
 where integracao_id = '2fbb4a4a-f7a0-43f4-b02f-cc57e8d87f22'
   and created_at >= '2026-09-28 08:31+00' and created_at < '2026-09-28 08:33+00';

-- Bloco 1: apagar ----------------------------------------------------------
delete from public.uber_resumos_semanais
 where integracao_id = '2fbb4a4a-f7a0-43f4-b02f-cc57e8d87f22'
   and periodo_inicio = '2026-09-21'
   and created_at >= '2026-09-28 08:31+00' and created_at < '2026-09-28 08:33+00';

delete from public.uber_transactions
 where integracao_id = '2fbb4a4a-f7a0-43f4-b02f-cc57e8d87f22'
   and created_at >= '2026-09-28 08:31+00' and created_at < '2026-09-28 08:33+00';

-- Só os motoristas que a importação errada criou na Uber Açores; os da
-- Urbango continuam na integração dela.
delete from public.uber_drivers
 where integracao_id = '2fbb4a4a-f7a0-43f4-b02f-cc57e8d87f22'
   and created_at >= '2026-09-28 08:31+00' and created_at < '2026-09-28 08:33+00';

-- Bloco 2: conferir: nenhum motorista Uber em duas integrações na semana ----
select uber_driver_id, max(motorista_nome) as nome, count(*) as integracoes
  from public.uber_resumos_semanais
 where periodo_inicio = '2026-09-21'
 group by uber_driver_id
having count(distinct integracao_id) > 1;
