-- ============================================================
-- Chat dos pedidos de informática — pgTAP
-- ============================================================
-- Ver a migração 20261026100000. Provas:
--   (a) quem gere lê a conversa dos pedidos da sua org;
--   (b) quem pediu, sem permissão de gerir, lê só a conversa dos próprios pedidos;
--   (c) outra org não lê nada;
--   (d) authenticated não escreve (só a edge function, com service role);
--   (e) anon não lê; a tabela está no realtime; os anexos ligam-se à mensagem;
--   (f) ficheiros do bucket: só os de anexos que a pessoa vê (outra org não).
-- ============================================================

begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000007c0ff', 'bootstrap@ti-chat.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000007ca00', 'Org Chat A', 'ti-chat-a'),
  ('00000000-0000-0000-0000-00000007cb00', 'Org Chat B', 'ti-chat-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000007ca01', 'admin-a@ti-chat.pt'),
  ('00000000-0000-0000-0000-00000007ca02', 'autor-a@ti-chat.pt'),
  ('00000000-0000-0000-0000-00000007cb01', 'admin-b@ti-chat.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-00000007ca01', '00000000-0000-0000-0000-00000007ca00'),
  ('00000000-0000-0000-0000-00000007ca02', '00000000-0000-0000-0000-00000007ca00'),
  ('00000000-0000-0000-0000-00000007cb01', '00000000-0000-0000-0000-00000007cb00');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-00000007ca01', '00000000-0000-0000-0000-00000007ca00', true),
  ('00000000-0000-0000-0000-00000007ca02', '00000000-0000-0000-0000-00000007ca00', false),
  ('00000000-0000-0000-0000-00000007cb01', '00000000-0000-0000-0000-00000007cb00', true)
on conflict (user_id, org_id) do update set is_admin = excluded.is_admin;

-- Dois pedidos na org A: um do autor com conta, outro de alguém sem conta.
insert into public.ti_tickets (id, org_id, autor_nome, autor_email, descricao, criado_por) values
  ('00000000-0000-0000-0000-00000007ca11', '00000000-0000-0000-0000-00000007ca00',
   'Autor A', 'autor-a@ti-chat.pt', 'Impressora não imprime', '00000000-0000-0000-0000-00000007ca02'),
  ('00000000-0000-0000-0000-00000007ca12', '00000000-0000-0000-0000-00000007ca00',
   'Sem Conta', 'sem-conta@ti-chat.pt', 'Email não abre', null);

insert into public.ti_ticket_mensagens (id, org_id, ticket_id, autor_tipo, criado_por, criado_por_nome, texto) values
  ('00000000-0000-0000-0000-00000007ca21', '00000000-0000-0000-0000-00000007ca00',
   '00000000-0000-0000-0000-00000007ca11', 'suporte', '00000000-0000-0000-0000-00000007ca01', 'Admin A', 'Já reiniciou?'),
  ('00000000-0000-0000-0000-00000007ca22', '00000000-0000-0000-0000-00000007ca00',
   '00000000-0000-0000-0000-00000007ca11', 'autor', '00000000-0000-0000-0000-00000007ca02', 'Autor A', 'Sim, continua.'),
  ('00000000-0000-0000-0000-00000007ca23', '00000000-0000-0000-0000-00000007ca00',
   '00000000-0000-0000-0000-00000007ca12', 'suporte', '00000000-0000-0000-0000-00000007ca01', 'Admin A', 'Qual é o erro?');

insert into storage.objects (bucket_id, name) values
  ('ti-ticket-anexos', '00000000-0000-0000-0000-00000007ca11/00000000-0000-0000-0000-00000007ca21/print.png');
insert into public.ti_ticket_anexos (org_id, ticket_id, mensagem_id, nome, ficheiro_url, criado_por_nome) values
  ('00000000-0000-0000-0000-00000007ca00', '00000000-0000-0000-0000-00000007ca11',
   '00000000-0000-0000-0000-00000007ca21', 'print.png',
   '00000000-0000-0000-0000-00000007ca11/00000000-0000-0000-0000-00000007ca21/print.png', 'Admin A');

-- ── (a) Quem gere ──────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007ca01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000007ca01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.ti_ticket_mensagens
    where org_id = '00000000-0000-0000-0000-00000007ca00'),
  3,
  '(a) o admin da org A lê a conversa de todos os pedidos da org'
);
select throws_ok(
  $$ insert into public.ti_ticket_mensagens (org_id, ticket_id, autor_tipo, criado_por_nome, texto)
     values ('00000000-0000-0000-0000-00000007ca00', '00000000-0000-0000-0000-00000007ca11',
             'suporte', 'Admin A', 'olá') $$,
  '42501', null,
  '(d) nem quem gere escreve directamente na tabela'
);
select throws_ok(
  $$ insert into public.ti_ticket_anexos (org_id, ticket_id, nome, ficheiro_url, criado_por_nome)
     values ('00000000-0000-0000-0000-00000007ca00', '00000000-0000-0000-0000-00000007ca11',
             'x', 'outra-org/segredo.pdf', 'Admin A') $$,
  '42501', null,
  '(d) quem gere não grava anexos a apontar para qualquer caminho do bucket'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'ti-ticket-anexos'
      and name like '00000000-0000-0000-0000-00000007ca11/%'),
  1,
  '(f) quem gere vê o ficheiro do anexo da sua org'
);

reset role;

-- ── (b) Quem pediu ─────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007ca02', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000007ca02","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  $$ select id from public.ti_ticket_mensagens order by created_at, id $$,
  $$ values ('00000000-0000-0000-0000-00000007ca21'::uuid), ('00000000-0000-0000-0000-00000007ca22'::uuid) $$,
  '(b) quem pediu lê só a conversa do próprio pedido'
);
select throws_ok(
  $$ insert into public.ti_ticket_mensagens (org_id, ticket_id, autor_tipo, criado_por_nome, texto)
     values ('00000000-0000-0000-0000-00000007ca00', '00000000-0000-0000-0000-00000007ca11',
             'suporte', 'Finge ser suporte', 'resolvido') $$,
  '42501', null,
  '(d) quem pediu não escreve directamente, nem a fingir ser o suporte'
);

reset role;

-- ── (c) Outra org ──────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007cb01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000007cb01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.ti_ticket_mensagens
    where org_id = '00000000-0000-0000-0000-00000007ca00'),
  0,
  '(c) o admin da org B não lê nada da org A'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'ti-ticket-anexos'
      and name like '00000000-0000-0000-0000-00000007ca11/%'),
  0,
  '(f) o admin da org B não vê os ficheiros da org A'
);

reset role;

-- ── (e) Privilégios, realtime e anexos ─────────────────────

select ok(
  has_table_privilege('authenticated', 'public.ti_ticket_mensagens', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ti_ticket_mensagens', 'INSERT')
  and not has_table_privilege('authenticated', 'public.ti_ticket_mensagens', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.ti_ticket_mensagens', 'DELETE')
  and not has_table_privilege('authenticated', 'public.ti_ticket_mensagens', 'TRUNCATE'),
  '(e) authenticated só tem SELECT'
);
select ok(
  not has_table_privilege('anon', 'public.ti_ticket_mensagens', 'SELECT'),
  '(e) anon não lê a conversa'
);
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'ti_ticket_mensagens'),
  1,
  '(e) a conversa está na publicação realtime'
);
select has_column('public', 'ti_ticket_anexos', 'mensagem_id',
  '(e) um anexo pode pertencer a uma mensagem');

select * from finish();
rollback;
