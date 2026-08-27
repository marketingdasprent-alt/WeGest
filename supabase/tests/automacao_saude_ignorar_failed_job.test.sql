begin;
select plan(4);   -- 2026-08-28: era 7 e o ficheiro tem 4 asserções (ver nota acima)

select has_view('public', 'automacao_saude_canais', 'view automacao_saude_canais existe');
select has_function('public', 'ignorar_failed_job', array['uuid'], 'ignorar_failed_job existe');

insert into public.organizacoes (id, nome, codigo) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Org Teste Saúde', 'teste-saude');
insert into public.notifications (id, org_id, destinatario_user_id, template_codigo, titulo)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', gen_random_uuid(), 'teste', 'Teste');
insert into public.notification_queue (id, notification_id, org_id, canal, destinatario, template_codigo, status, created_at)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', 'a@teste.pt', 'teste', 'failed', now() - interval '10 minutes'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', 'b@teste.pt', 'teste', 'sent', now() - interval '5 minutes');
insert into public.notification_delivery (notification_queue_id, notification_id, org_id, canal, destinatario, status, enviado_em)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', 'b@teste.pt', 'enviado', now() - interval '4 minutes 30 seconds');

select is(
  (select falhas_ultima_hora from public.automacao_saude_canais where org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and canal = 'email'),
  1::bigint,
  'saúde por canal conta 1 falha na última hora'
);
select is(
  (select enviados_ultima_hora from public.automacao_saude_canais where org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and canal = 'email'),
  1::bigint,
  'saúde por canal conta 1 envio na última hora'
);
select ok(
  (select tempo_resposta_medio_ms from public.automacao_saude_canais where org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and canal = 'email') between 25000 and 35000,
  'tempo médio de resposta ~30s calculado a partir de notification_delivery'
);

insert into public.failed_jobs (id, source_table, source_id, org_id, job_type, attempts, last_error)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'notification_queue', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', 5, 'erro de teste');

select throws_ok(
  $$select public.ignorar_failed_job('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)$$,
  'sem permissão para ignorar jobs falhados',
  'ignorar_failed_job exige permissão automacoes (sem sessão autenticada, falha)'
);

select * from finish();
rollback;
