-- ============================================================
-- vigiar_cron_edge(): só avisa falhas sustentadas (pgTAP)
-- ============================================================
-- A função foi reescrita para não fazer seq scan a net._http_response por
-- cada linha (20261019120000). Este teste fixa o comportamento que tinha de
-- ficar igual: falha sem recuperação avisa, falha recuperada não, pedido sem
-- resposta só avisa passados 10 minutos, e uma segunda passagem não repete.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo)
values (public.org_sistema(), 'Sistema', 'sistema-vigia-teste')
on conflict (id) do nothing;

-- now() é fixo dentro da transacção: as janelas são relativas a ele.
insert into public.cron_http_log (jobname, url, request_id, invoked_at) values
  ('teste-vigia-falha',      'http://x/f',  990000001, now() - interval '20 minutes'),
  ('teste-vigia-recuperou',  'http://x/r',  990000002, now() - interval '20 minutes'),
  ('teste-vigia-recuperou',  'http://x/r',  990000003, now() - interval '10 minutes'),
  ('teste-vigia-recente',    'http://x/n',  990000004, now() - interval '5 minutes'),
  ('teste-vigia-perdido',    'http://x/p',  990000005, now() - interval '30 minutes');

insert into net._http_response (id, status_code, content, created) values
  (990000001, 500, 'rebentou', now() - interval '19 minutes'),
  (990000002, 502, 'gateway',  now() - interval '19 minutes'),
  (990000003, 200, 'ok',       now() - interval '9 minutes');

select is(public.vigiar_cron_edge(), 2, 'avisa duas falhas: a sem recuperação e a sem resposta');

select ok(
  exists (select 1 from public.failed_jobs
          where job_type = 'cron_edge:teste-vigia-falha' and last_error like '%HTTP 500 - rebentou%'),
  'HTTP 500 sem nenhum 2xx na janela gera failed_job com o corpo da resposta'
);

select ok(
  exists (select 1 from public.failed_jobs
          where job_type = 'cron_edge:teste-vigia-perdido' and last_error like '%Sem resposta HTTP%'),
  'pedido sem resposta há mais de 10 min gera failed_job'
);

select is(
  (select count(*)::int from public.failed_jobs where job_type = 'cron_edge:teste-vigia-recuperou'),
  0,
  'falha seguida de 2xx do mesmo job não avisa'
);

select is(
  (select count(*)::int from public.cron_http_log
   where jobname = 'teste-vigia-recuperou' and alertado_em is null),
  0,
  'a falha recuperada e o 2xx ficam marcados como vistos'
);

select ok(
  (select alertado_em is null from public.cron_http_log where jobname = 'teste-vigia-recente'),
  'pedido sem resposta há menos de 10 min fica por avaliar'
);

select is(public.vigiar_cron_edge(), 0, 'segunda passagem não repete avisos');

select * from finish();
rollback;
