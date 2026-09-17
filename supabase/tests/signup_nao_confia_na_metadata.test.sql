-- Registo: org/cargo nunca vêm da metadata do cliente (auditoria 2026-09-16).
-- Corre com: supabase start && supabase test db

begin;
select plan(11);

-- Duas organizações activas e uma inactiva.
insert into public.organizacoes (id, nome, codigo, ativa) values
  ('00000000-0000-0000-0000-0000005a0000', 'Org Signup A', 'signup-a', true),
  ('00000000-0000-0000-0000-0000005b0000', 'Org Signup B', 'signup-b', true),
  ('00000000-0000-0000-0000-0000005c0000', 'Org Signup Inactiva', 'signup-c', false);

-- Cargo privilegiado sem "admin" no nome (era o buraco). Nome próprio porque
-- ensure_base_cargos já cria "Gestor TVDE" por org.
insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-00000c5a0001', 'Gestor Frota Signup', '00000000-0000-0000-0000-0000005a0000'),
  ('00000000-0000-0000-0000-00000c5b0001', 'Gestor Frota Signup', '00000000-0000-0000-0000-0000005b0000');

-- Cargo Motorista global (uma linha só, partilhada por todas as orgs).
insert into public.cargos (id, nome, org_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Motorista', '00000000-0000-0000-0000-0000005a0000')
on conflict (id) do nothing;

-- Arranque: garante que nenhum dos utilizadores abaixo é "o primeiro da
-- instalação" (esse caminho dá admin de propósito e não é o que está em teste).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000005a0001', 'bootstrap@signup-a.pt');

-- ------------------------------------------------------------
-- 1-2. signUp de "colaborador" a apontar para org + cargo privilegiado.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000005a0002', 'atacante@signup-a.pt',
   jsonb_build_object(
     'nome', 'Atacante',
     'tipo_utilizador', 'colaborador',
     'org_id', '00000000-0000-0000-0000-0000005a0000',
     'cargo_id', '00000000-0000-0000-0000-00000c5a0001',
     'cargo_nome', 'Gestor Frota Signup'
   ));

select is(
  (select count(*)::int from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005a0002'),
  0,
  'signUp com org_id/cargo_id na metadata não cria membership nenhuma'
);

select is(
  (select cargo_id from public.profiles where id = '00000000-0000-0000-0000-0000005a0002'),
  null,
  'signUp com cargo_id na metadata não recebe cargo'
);

-- ------------------------------------------------------------
-- 3-5. Auto-registo de motorista: org do cliente, cargo SEMPRE Motorista.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000005a0003', 'motorista@signup-a.pt',
   jsonb_build_object(
     'tipo_utilizador', 'motorista',
     'cargo_nome', 'Motorista',
     'org_id', '00000000-0000-0000-0000-0000005a0000',
     'cargo_id', '00000000-0000-0000-0000-00000c5a0001'
   ));

select is(
  (select org_id from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005a0003'),
  '00000000-0000-0000-0000-0000005a0000'::uuid,
  'motorista fica membro da org que escolheu no registo'
);

select is(
  (select cargo_id from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005a0003'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'motorista recebe o cargo Motorista fixo, mesmo pedindo outro cargo'
);

select is(
  (select tipo_utilizador from public.profiles where id = '00000000-0000-0000-0000-0000005a0003'),
  'motorista',
  'motorista fica com tipo_utilizador = motorista'
);

-- ------------------------------------------------------------
-- 6. Motorista a apontar para org inactiva: sem membership.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000005a0004', 'motorista-inactiva@signup-a.pt',
   jsonb_build_object('tipo_utilizador', 'motorista', 'org_id', '00000000-0000-0000-0000-0000005c0000'));

select is(
  (select count(*)::int from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005a0004'),
  0,
  'motorista a apontar para org inactiva não entra em lado nenhum'
);

-- ------------------------------------------------------------
-- 7-8. app_metadata (servidor) é a fonte de verdade para colaboradores.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000005a0005', 'gestor@signup-a.pt',
   jsonb_build_object('org_id', '00000000-0000-0000-0000-0000005a0000', 'cargo_id', '00000000-0000-0000-0000-00000c5a0001'),
   jsonb_build_object('nome', 'Gestor'));

select is(
  (select cargo_id from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005a0005'),
  '00000000-0000-0000-0000-00000c5a0001'::uuid,
  'app_metadata escrita pelo servidor atribui org e cargo'
);

-- Cargo de OUTRA org em app_metadata: a org fica, o cargo cai.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000005a0006', 'gestor-cruzado@signup-a.pt',
   jsonb_build_object('org_id', '00000000-0000-0000-0000-0000005a0000', 'cargo_id', '00000000-0000-0000-0000-00000c5b0001'));

select is(
  (select cargo_id from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005a0006'),
  null,
  'um cargo de outra organização em app_metadata não é atribuído'
);

-- ------------------------------------------------------------
-- 9-10. Convites: válido atribui; expirado não.
-- ------------------------------------------------------------
insert into public.convites (email, token, usado, expires_at, cargo_id, org_id) values
  ('convidado@signup-b.pt', 'tok-valido', false, now() + interval '1 day',
   '00000000-0000-0000-0000-00000c5b0001', '00000000-0000-0000-0000-0000005b0000'),
  ('expirado@signup-b.pt', 'tok-expirado', false, now() - interval '1 day',
   '00000000-0000-0000-0000-00000c5b0001', '00000000-0000-0000-0000-0000005b0000');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000005b0001', 'convidado@signup-b.pt', jsonb_build_object('nome', 'Convidado')),
  ('00000000-0000-0000-0000-0000005b0002', 'expirado@signup-b.pt', jsonb_build_object('nome', 'Expirado'));

select is(
  (select cargo_id from public.user_organizacoes
    where user_id = '00000000-0000-0000-0000-0000005b0001'
      and org_id = '00000000-0000-0000-0000-0000005b0000'),
  '00000000-0000-0000-0000-00000c5b0001'::uuid,
  'convite válido atribui a org e o cargo do convite'
);

select is(
  (select count(*)::int from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005b0002'),
  0,
  'convite expirado não atribui nada'
);

-- ------------------------------------------------------------
-- 11. Colaborador sem convite nem app_metadata: não cai em org nenhuma.
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000005b0003', 'solto@signup-b.pt', jsonb_build_object('nome', 'Solto'));

select is(
  (select count(*)::int from public.user_organizacoes where user_id = '00000000-0000-0000-0000-0000005b0003'),
  0,
  'colaborador sem convite não cai na primeira org activa'
);

select * from finish();
rollback;
