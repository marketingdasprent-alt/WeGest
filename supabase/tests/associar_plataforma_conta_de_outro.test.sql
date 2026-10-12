-- ============================================================
-- Associar uma conta Uber/Bolt recusa a ficha errada — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Reproduz o Paulo Jorge (2026-09-10): a conta Bolt "Paulo Jorge" tinha o
-- telefone e o email do Caldeira e foi ligada à mão ao Amado da Silva. Ver a
-- migração 20261012110000.
--   (1) conta com o contacto de outra ficha activa: recusada, nada gravado;
--   (2) a mesma conta na ficha certa: passa;
--   (3) conta sem telefone nem email: passa como antes;
--   (4) telefone partilhado, a ficha escolhida também o tem: passa;
--   (5) o contacto é de uma ficha inactiva: não bloqueia;
--   (6) vale também para a Uber (pelo email).
-- ============================================================

begin;
select plan(9);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000002a0000', 'Org Conta de Outro', 'cdo-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000002a00a1', 'gestor@conta-de-outro.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000002a00a1', '00000000-0000-0000-0000-0000002a0000')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000002a00a1', '00000000-0000-0000-0000-0000002a0000', true)
on conflict (user_id, org_id) do update set is_admin = excluded.is_admin;

insert into public.plataformas_configuracao (id, org_id, nome, plataforma) values
  ('00000000-0000-0000-0000-0000002a0e01', '00000000-0000-0000-0000-0000002a0000', 'Bolt', 'bolt'),
  ('00000000-0000-0000-0000-0000002a0e02', '00000000-0000-0000-0000-0000002a0000', 'Uber', 'uber');

insert into public.motoristas_ativos (id, org_id, nome, telefone, email, status_ativo) values
  ('00000000-0000-0000-0000-0000002a0b01', '00000000-0000-0000-0000-0000002a0000',
   'PAULO JORGE AMADO DA SILVA', '+351 926340893', 'j.or.paulo@hotmail.com', true),
  ('00000000-0000-0000-0000-0000002a0b02', '00000000-0000-0000-0000-0000002a0000',
   'Paulo Jorge de Almeida Caldeira', '932106326', 'paulojorgecaldeira01@gmail.com', true),
  ('00000000-0000-0000-0000-0000002a0b03', '00000000-0000-0000-0000-0000002a0000',
   'Irmão do Amado', '926340893', null, true),
  ('00000000-0000-0000-0000-0000002a0b04', '00000000-0000-0000-0000-0000002a0000',
   'Ficha Antiga', '911111111', null, false);

insert into public.bolt_drivers (org_id, integracao_id, driver_uuid, name, phone, email) values
  ('00000000-0000-0000-0000-0000002a0000', '00000000-0000-0000-0000-0000002a0e01',
   'bolt-paulo-jorge', 'Paulo Jorge', '+351932106326', 'PauloJorgeCaldeira01@gmail.com'),
  ('00000000-0000-0000-0000-0000002a0000', '00000000-0000-0000-0000-0000002a0e01',
   'bolt-sem-contacto', 'Paulo Jorge', null, null),
  ('00000000-0000-0000-0000-0000002a0000', '00000000-0000-0000-0000-0000002a0e01',
   'bolt-partilhado', 'Silva', '+351926340893', null),
  ('00000000-0000-0000-0000-0000002a0000', '00000000-0000-0000-0000-0000002a0e01',
   'bolt-antigo', 'Antigo', '+351911111111', null);

insert into public.uber_drivers (org_id, integracao_id, uber_driver_id, full_name, email) values
  ('00000000-0000-0000-0000-0000002a0000', '00000000-0000-0000-0000-0000002a0e02',
   'uber-paulo-jorge', 'Paulo Jorge', 'paulojorgecaldeira01@gmail.com');

-- Como o gestor no ecrã: sem role e claims, auth.uid() fica NULL e a função
-- recusava por falta de permissão, não pelo que se quer provar.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000002a00a1', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000002a00a1","role":"authenticated"}', true);

-- (1)
select throws_ok(
  $$ select public.associar_motorista_plataforma(
       '00000000-0000-0000-0000-0000002a0b01', null, 'bolt-paulo-jorge') $$,
  'P0001',
  'Esta conta Bolt tem o telefone ou o email de Paulo Jorge de Almeida Caldeira, não desta ficha. Confirme o motorista antes de associar.',
  'conta Bolt com o contacto do Caldeira não entra na ficha do Amado'
);

-- (2)
select lives_ok(
  $$ select public.associar_motorista_plataforma(
       '00000000-0000-0000-0000-0000002a0b02', null, 'bolt-paulo-jorge') $$,
  'a mesma conta entra na ficha do Caldeira'
);

-- (3)
select lives_ok(
  $$ select public.associar_motorista_plataforma(
       '00000000-0000-0000-0000-0000002a0b01', null, 'bolt-sem-contacto') $$,
  'conta sem telefone nem email associa-se como antes'
);

-- (4)
select lives_ok(
  $$ select public.associar_motorista_plataforma(
       '00000000-0000-0000-0000-0000002a0b03', null, 'bolt-partilhado') $$,
  'telefone partilhado: a ficha escolhida também o tem'
);

-- (5)
select lives_ok(
  $$ select public.associar_motorista_plataforma(
       '00000000-0000-0000-0000-0000002a0b01', null, 'bolt-antigo') $$,
  'o contacto de uma ficha inactiva não bloqueia'
);

-- (6)
select throws_ok(
  $$ select public.associar_motorista_plataforma(
       '00000000-0000-0000-0000-0000002a0b01', 'uber-paulo-jorge', null) $$,
  'P0001',
  'Esta conta Uber tem o telefone ou o email de Paulo Jorge de Almeida Caldeira, não desta ficha. Confirme o motorista antes de associar.',
  'conta Uber com o email do Caldeira não entra na ficha do Amado'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select is(
  (select motorista_id from public.motorista_plataforma_identidades
    where org_id = '00000000-0000-0000-0000-0000002a0000' and plataforma = 'bolt'
      and identificador = 'bolt-paulo-jorge'),
  '00000000-0000-0000-0000-0000002a0b02'::uuid,
  'a conta Bolt ficou com o Caldeira, não com o Amado'
);

select is(
  (select bolt_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000002a0b02'),
  'bolt-paulo-jorge',
  'a ficha do Caldeira tem o ID Bolt'
);

select is(
  (select count(*)::int from public.motorista_plataforma_identidades
    where org_id = '00000000-0000-0000-0000-0000002a0000' and plataforma = 'uber'),
  0,
  'a recusa da Uber não deixou nada gravado'
);

select * from finish();
rollback;
