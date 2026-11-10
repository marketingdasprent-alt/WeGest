-- ============================================================
-- Aviso à equipa: a notificação na app é sempre criada; o e-mail só com o
-- modelo de e-mail ativo — pgTAP. Ver a migração 20261110100000.
-- ============================================================

begin;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003c00aa', 'admin@aviso-km.pt');
insert into public.profiles (id, email) values
  ('00000000-0000-0000-0000-0000003c00aa', 'admin@aviso-km.pt')
on conflict (id) do update set email = excluded.email;

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003c0000', 'Org Aviso Km', 'aviso-km');
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000003c00aa', '00000000-0000-0000-0000-0000003c0000', true);

insert into public.notification_templates (org_id, codigo, canal, assunto, corpo_template, ativo) values
  ('00000000-0000-0000-0000-0000003c0000', 'motorista.km_enviado', 'email', 'Km', 'Km', false),
  ('00000000-0000-0000-0000-0000003c0000', 'motorista.recibo_verde_enviado', 'email', 'Recibo', 'Recibo', true);

select public.avisar_staff_envio_motorista(
  '00000000-0000-0000-0000-0000003c0000', null, 'motorista.km_enviado',
  'X registou 100 km', 'AA-00-AA', '/viaturas/1', null, null, '{}'::jsonb, null);

select is(
  (select count(*)::int from public.notifications
    where org_id = '00000000-0000-0000-0000-0000003c0000' and template_codigo = 'motorista.km_enviado'),
  1,
  'km com e-mail desligado: a notificação na app é criada'
);

select is(
  (select count(*)::int from public.notification_queue
    where org_id = '00000000-0000-0000-0000-0000003c0000' and template_codigo = 'motorista.km_enviado'),
  0,
  'km com e-mail desligado: nenhum e-mail na fila'
);

select public.avisar_staff_envio_motorista(
  '00000000-0000-0000-0000-0000003c0000', null, 'motorista.recibo_verde_enviado',
  'X submeteu um recibo', 'semana', '/recibos/1', null, null, '{}'::jsonb, null);

select is(
  (select count(*)::int from public.notifications
    where org_id = '00000000-0000-0000-0000-0000003c0000' and template_codigo = 'motorista.recibo_verde_enviado'),
  1,
  'recibo com e-mail ativo: a notificação na app é criada'
);

select is(
  (select count(*)::int from public.notification_queue
    where org_id = '00000000-0000-0000-0000-0000003c0000' and template_codigo = 'motorista.recibo_verde_enviado'),
  1,
  'recibo com e-mail ativo: o e-mail entra na fila'
);

select * from finish();
rollback;
