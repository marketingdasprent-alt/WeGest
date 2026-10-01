-- ============================================================
-- Buckets de viaturas — fase 0 (20260925150000)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Até aqui, em produção: viatura-danos deixava qualquer pessoa, mesmo sem
-- sessão, carregar, listar e APAGAR fotos de danos (prova); viatura-documentos
-- deixava qualquer sessão, de qualquer org, carregar e apagar. As políticas só
-- existem em produção (o baseline não tem storage), por isso aqui prova-se o
-- comportamento das políticas novas.
-- ============================================================

begin;
select plan(9);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000b00ff', 'bootstrap@buckets.test');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-4000-8000-0000000b0001', 'Org Buckets', 'buckets-fase0');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000b0011', 'dono@buckets.test'),
  ('00000000-0000-4000-8000-0000000b0012', 'outro@buckets.test'),
  ('00000000-0000-4000-8000-0000000b0013', 'editor@buckets.test');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-4000-8000-0000000b0011', '00000000-0000-4000-8000-0000000b0001'),
  ('00000000-0000-4000-8000-0000000b0012', '00000000-0000-4000-8000-0000000b0001'),
  ('00000000-0000-4000-8000-0000000b0013', '00000000-0000-4000-8000-0000000b0001')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-4000-8000-0000000b0021', 'Edita viaturas', '00000000-0000-4000-8000-0000000b0001'),
  ('00000000-0000-4000-8000-0000000b0022', 'Sem viaturas', '00000000-0000-4000-8000-0000000b0001');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-4000-8000-0000000b0011', '00000000-0000-4000-8000-0000000b0001', false, '00000000-0000-4000-8000-0000000b0022'),
  ('00000000-0000-4000-8000-0000000b0012', '00000000-0000-4000-8000-0000000b0001', false, '00000000-0000-4000-8000-0000000b0022'),
  ('00000000-0000-4000-8000-0000000b0013', '00000000-0000-4000-8000-0000000b0001', false, '00000000-0000-4000-8000-0000000b0021')
on conflict (user_id, org_id) do update set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-4000-8000-0000000b0021', r.id, '00000000-0000-4000-8000-0000000b0001', true, true
from public.recursos r where r.nome = 'viaturas_editar';

-- O storage recente recusa DELETE directo fora da API (protect_delete); aqui
-- testam-se só as políticas, por isso liga-se a excepção que esse trigger lê.
select set_config('storage.allow_delete_query', 'true', false);

insert into storage.buckets (id, name, public) values
  ('viatura-danos', 'viatura-danos', true),
  ('viatura-documentos', 'viatura-documentos', true)
on conflict (id) do nothing;

-- ── viatura-danos ───────────────────────────────────────────

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('viatura-danos', 'anonimo/prova.jpg') $$,
  '42501', null,
  'sem sessão já não se carregam fotos de danos'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b0011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000b0011","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('viatura-danos', 'entrega/foto-dono.jpg', '00000000-0000-4000-8000-0000000b0011') $$,
  'com sessão a entrega continua a carregar fotos'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b0012', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000b0012","role":"authenticated"}', true);
set local role authenticated;
delete from storage.objects where bucket_id = 'viatura-danos' and name = 'entrega/foto-dono.jpg';
reset role;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'viatura-danos' and name = 'entrega/foto-dono.jpg'),
  1,
  'outro utilizador, sem ser admin, não apaga a foto de quem a carregou'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b0011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000b0011","role":"authenticated"}', true);
set local role authenticated;
delete from storage.objects where bucket_id = 'viatura-danos' and name = 'entrega/foto-dono.jpg';
reset role;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'viatura-danos' and name = 'entrega/foto-dono.jpg'),
  0,
  'quem carregou pode desfazer o próprio upload (entrega falhada)'
);

-- ── viatura-documentos ──────────────────────────────────────

-- Sem permissão de viaturas, uma sessão qualquer já não carrega nem apaga.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b0012', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000b0012","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('viatura-documentos', 'viatura/dua.pdf', '00000000-0000-4000-8000-0000000b0012') $$,
  '42501', null,
  'sem viaturas_editar não se carregam documentos de viaturas'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b0013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000b0013","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('viatura-documentos', 'viatura/dua.pdf', '00000000-0000-4000-8000-0000000b0013') $$,
  'quem edita viaturas carrega documentos'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'viatura-documentos' and name = 'viatura/dua.pdf'),
  1,
  'quem edita viaturas lê o documento que carregou'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000b0012', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000b0012","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'viatura-documentos' and name = 'viatura/dua.pdf'),
  0,
  'sem permissão nem linha em viatura_documentos o ficheiro não se lê pela API'
);
delete from storage.objects where bucket_id = 'viatura-documentos' and name = 'viatura/dua.pdf';
reset role;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'viatura-documentos' and name = 'viatura/dua.pdf'),
  1,
  'sem permissão de viaturas não se apagam documentos'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
