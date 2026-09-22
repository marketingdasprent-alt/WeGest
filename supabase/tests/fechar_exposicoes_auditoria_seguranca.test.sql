-- supabase/tests/fechar_exposicoes_auditoria_seguranca.test.sql
--
-- Auditoria 2026-09-22: cinco objectos deixavam dados de uma organização ao
-- alcance de qualquer utilizador autenticado. Verifica privilégios no
-- catálogo e o comportamento cross-org das duas RPCs reescritas.
begin;
select plan(12);

-- ── META (catálogo) ─────────────────────────────────────────
-- 1-2. Segredos Uber: só a service role executa.
select ok(
  not has_function_privilege('authenticated', 'public.get_uber_platform_config(uuid)', 'EXECUTE'),
  'authenticated não executa get_uber_platform_config'
);
select ok(
  has_function_privilege('service_role', 'public.get_uber_platform_config(uuid)', 'EXECUTE'),
  'service_role executa get_uber_platform_config'
);

-- 3. Saldos: a função corre como o chamador, a RLS de motorista_financeiro aplica-se.
select is(
  (select prosecdef from pg_proc
   where oid = 'public.motoristas_saldo_pendente_lote(uuid[], date, date)'::regprocedure),
  false,
  'motoristas_saldo_pendente_lote é SECURITY INVOKER'
);

-- 4-5. View financeira: security_invoker ligado e anon sem acesso.
select ok(
  exists (
    select 1 from pg_class c
    where c.oid = 'public.v_dinheiro_sem_dono'::regclass
      and 'security_invoker=true' = any (c.reloptions)
  ),
  'v_dinheiro_sem_dono tem security_invoker = true'
);
select ok(
  not has_table_privilege('anon', 'public.v_dinheiro_sem_dono', 'SELECT'),
  'anon não lê v_dinheiro_sem_dono'
);

-- ── COMPORTAMENTO ───────────────────────────────────────────
-- Bootstrap: consome a vaga de "primeiro utilizador" antes de haver org, para
-- o handle_new_user_org não escrever user_org_ativa por cima dos inserts.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000009200ff', 'bootstrap@audit-0922.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000920000', 'Org Audit A', 'audit-0922-a'),
  ('00000000-0000-0000-0000-000000920001', 'Org Audit B', 'audit-0922-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000920a01', 'gestor.a@audit-0922.pt'),
  ('00000000-0000-0000-0000-000000920b01', 'gestor.b@audit-0922.pt'),
  ('00000000-0000-0000-0000-000000920c01', 'intruso@audit-0922.pt');

-- handle_new_user_org já criou os perfis; completam-se com nome e cargo.
insert into public.profiles (id, org_id, nome, email, cargo, tipo_utilizador) values
  ('00000000-0000-0000-0000-000000920a01', '00000000-0000-0000-0000-000000920000', 'Gestor Alfa', 'gestor.a@audit-0922.pt', 'Gestor', 'colaborador'),
  ('00000000-0000-0000-0000-000000920b01', '00000000-0000-0000-0000-000000920001', 'Gestor Beta',  'gestor.b@audit-0922.pt', 'Gestor', 'colaborador'),
  ('00000000-0000-0000-0000-000000920c01', '00000000-0000-0000-0000-000000920001', 'Intruso',      'intruso@audit-0922.pt',  'Gestor', 'colaborador')
on conflict (id) do update set
  org_id = excluded.org_id, nome = excluded.nome, email = excluded.email,
  cargo = excluded.cargo, tipo_utilizador = excluded.tipo_utilizador;

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000920a01', '00000000-0000-0000-0000-000000920000', true),
  ('00000000-0000-0000-0000-000000920b01', '00000000-0000-0000-0000-000000920001', true),
  ('00000000-0000-0000-0000-000000920c01', '00000000-0000-0000-0000-000000920001', false)
on conflict (user_id, org_id) do update set is_admin = excluded.is_admin;

-- O gestor A vê a org A. O intruso é membro de B mas aponta a sessão para A:
-- é o caso que get_gestores/get_viaturas_motorista_atual têm de recusar.
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000920a01', '00000000-0000-0000-0000-000000920000'),
  ('00000000-0000-0000-0000-000000920b01', '00000000-0000-0000-0000-000000920001'),
  ('00000000-0000-0000-0000-000000920c01', '00000000-0000-0000-0000-000000920000')
on conflict (user_id) do update set org_id = excluded.org_id;

set local role authenticated;

-- Gestor A: vê o seu, não vê o de B.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000920a01', 'role', 'authenticated')::text, true);

-- 6-7.
select ok(
  exists (select 1 from public.get_gestores() where nome = 'Gestor Alfa'),
  'get_gestores devolve o gestor da própria organização'
);
select ok(
  not exists (select 1 from public.get_gestores() where nome in ('Gestor Beta', 'Intruso')),
  'get_gestores não devolve gestores de outra organização'
);

-- 8-9. Viaturas: a org activa passa; outra org falha com insufficient_privilege.
select lives_ok(
  $$ select * from public.get_viaturas_motorista_atual() $$,
  'get_viaturas_motorista_atual aceita a organização activa'
);
select throws_ok(
  $$ select * from public.get_viaturas_motorista_atual('00000000-0000-0000-0000-000000920001') $$,
  '42501',
  'Sem acesso a esta organização',
  'get_viaturas_motorista_atual recusa outra organização'
);

-- Intruso: sessão aponta para A sem ser membro de A.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000920c01', 'role', 'authenticated')::text, true);

-- 10-11.
select is(
  (select count(*)::int from public.get_gestores()),
  0,
  'get_gestores não devolve nada a quem não é membro da org activa'
);
select throws_ok(
  $$ select * from public.get_viaturas_motorista_atual() $$,
  '42501',
  'Sem acesso a esta organização',
  'get_viaturas_motorista_atual recusa quem não é membro da org activa'
);

-- 12. A view não expõe nada a quem não é membro (RLS das tabelas de origem).
select is(
  (select count(*)::int from public.v_dinheiro_sem_dono),
  0,
  'v_dinheiro_sem_dono não devolve linhas a quem não é membro da org activa'
);

select * from finish();
rollback;
