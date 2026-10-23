-- ============================================================
-- Quem vê que notificações: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Fixa a matriz de visibilidade de `notificacoes` por papel, organização e
-- destinatário. Escrito antes da migração 20261023140000 (funções da RLS
-- avaliadas uma vez por consulta): tem de passar igual antes e depois.
-- ============================================================

begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000009a00ff', 'bootstrap@rls-notificacoes.pt'),
  ('00000000-0000-0000-0000-0000009a0001', 'admin@rls-notificacoes.pt'),
  ('00000000-0000-0000-0000-0000009a0002', 'gestor@rls-notificacoes.pt'),
  ('00000000-0000-0000-0000-0000009a0003', 'supervisor@rls-notificacoes.pt'),
  ('00000000-0000-0000-0000-0000009a0004', 'comum@rls-notificacoes.pt'),
  ('00000000-0000-0000-0000-0000009a0005', 'admin-b@rls-notificacoes.pt'),
  ('00000000-0000-0000-0000-0000009a0006', 'grupo-administrador@rls-notificacoes.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000009a0a00', 'Org Notificações A', 'rls-notificacoes-a'),
  ('00000000-0000-0000-0000-0000009a0b00', 'Org Notificações B', 'rls-notificacoes-b');

-- Criar a organização semeia os grupos de base; trocam-se pelos ids do teste.
delete from public.cargos
 where org_id = '00000000-0000-0000-0000-0000009a0a00'
   and nome in ('Gestor TVDE', 'Supervisor Gestor TVDE');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000009ac001', 'Grupo neutro A', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009ac002', 'Gestor TVDE', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009ac003', 'Supervisor Gestor TVDE', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009ac004', 'Grupo neutro B', '00000000-0000-0000-0000-0000009a0b00');

-- handle_new_user_org pode ter metido estes utilizadores noutra organização:
-- os on conflict garantem que os valores DESTE teste vencem.
insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000009a0001', '00000000-0000-0000-0000-0000009a0a00', true,  '00000000-0000-0000-0000-0000009ac001'),
  ('00000000-0000-0000-0000-0000009a0002', '00000000-0000-0000-0000-0000009a0a00', false, '00000000-0000-0000-0000-0000009ac002'),
  ('00000000-0000-0000-0000-0000009a0003', '00000000-0000-0000-0000-0000009a0a00', false, '00000000-0000-0000-0000-0000009ac003'),
  ('00000000-0000-0000-0000-0000009a0004', '00000000-0000-0000-0000-0000009a0a00', false, '00000000-0000-0000-0000-0000009ac001'),
  ('00000000-0000-0000-0000-0000009a0005', '00000000-0000-0000-0000-0000009a0b00', true,  '00000000-0000-0000-0000-0000009ac004')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

-- Grupo "Administrador" semeado com a organização: entra pelo nome no 1.º ramo.
insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id)
select '00000000-0000-0000-0000-0000009a0006', '00000000-0000-0000-0000-0000009a0a00', false, c.id
  from public.cargos c
 where c.org_id = '00000000-0000-0000-0000-0000009a0a00' and c.nome = 'Administrador'
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000009a0006', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009a0001', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009a0002', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009a0003', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009a0004', '00000000-0000-0000-0000-0000009a0a00'),
  ('00000000-0000-0000-0000-0000009a0005', '00000000-0000-0000-0000-0000009a0b00')
on conflict (user_id) do update set org_id = excluded.org_id;

-- Em produção existe, mas nenhuma migração o semeia: sem isto a FK rebenta no CI.
insert into public.notificacao_tipos (tipo) values ('motorista_documento_pendente')
on conflict do nothing;

-- e1..e4, e7, e8 na Org A; e5, e6, e9 na Org B. Um ramo da regra por tipo.
-- e9 é da Org B mas dirigida ao comum da Org A: só o corte por org a esconde.
insert into public.notificacoes (id, org_id, tipo, titulo, severidade, destinatario_id) values
  ('00000000-0000-0000-0000-0000009ae001', '00000000-0000-0000-0000-0000009a0a00', 'motorista_pendente',           'A pendente',     'normal', null),
  ('00000000-0000-0000-0000-0000009ae002', '00000000-0000-0000-0000-0000009a0a00', 'escalonamento',                'A escalonar',    'urgente', null),
  ('00000000-0000-0000-0000-0000009ae003', '00000000-0000-0000-0000-0000009a0a00', 'cobranca_gerada',              'A do comum',     'normal', '00000000-0000-0000-0000-0000009a0004'),
  ('00000000-0000-0000-0000-0000009ae004', '00000000-0000-0000-0000-0000009a0a00', 'cobranca_gerada',              'A do gestor',    'normal', '00000000-0000-0000-0000-0000009a0002'),
  ('00000000-0000-0000-0000-0000009ae005', '00000000-0000-0000-0000-0000009a0b00', 'motorista_pendente',           'B pendente',     'normal', null),
  ('00000000-0000-0000-0000-0000009ae006', '00000000-0000-0000-0000-0000009a0b00', 'cobranca_gerada',              'B do admin',     'normal', '00000000-0000-0000-0000-0000009a0005'),
  ('00000000-0000-0000-0000-0000009ae007', '00000000-0000-0000-0000-0000009a0a00', 'motorista_documento_pendente', 'A documento',    'normal', null),
  ('00000000-0000-0000-0000-0000009ae008', '00000000-0000-0000-0000-0000009a0a00', 'pedido_troca_kms',             'A troca de kms', 'normal', null),
  ('00000000-0000-0000-0000-0000009ae009', '00000000-0000-0000-0000-0000009a0b00', 'cobranca_gerada',              'B para o comum', 'normal', '00000000-0000-0000-0000-0000009a0004');

-- ── Leitura, utilizador a utilizador ───────────────────────

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009a0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009a0001","role":"authenticated"}', true);
select set_eq(
  $$select id from public.notificacoes where id::text like '00000000-0000-0000-0000-0000009ae%'$$,
  array['00000000-0000-0000-0000-0000009ae001', '00000000-0000-0000-0000-0000009ae002',
        '00000000-0000-0000-0000-0000009ae007', '00000000-0000-0000-0000-0000009ae008']::uuid[],
  'admin da Org A vê as de grupo da sua org, e não as pessoais dos outros nem as da Org B'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009a0002', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009a0002","role":"authenticated"}', true);
select set_eq(
  $$select id from public.notificacoes where id::text like '00000000-0000-0000-0000-0000009ae%'$$,
  array['00000000-0000-0000-0000-0000009ae001', '00000000-0000-0000-0000-0000009ae007',
        '00000000-0000-0000-0000-0000009ae004']::uuid[],
  'Gestor TVDE vê motoristas pendentes e as suas, não escalonamentos'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009a0003', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009a0003","role":"authenticated"}', true);
select set_eq(
  $$select id from public.notificacoes where id::text like '00000000-0000-0000-0000-0000009ae%'$$,
  array['00000000-0000-0000-0000-0000009ae001', '00000000-0000-0000-0000-0000009ae007',
        '00000000-0000-0000-0000-0000009ae002', '00000000-0000-0000-0000-0000009ae008']::uuid[],
  'Supervisor vê motoristas pendentes e escalonamentos, não as pessoais dos outros'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009a0004', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009a0004","role":"authenticated"}', true);
select set_eq(
  $$select id from public.notificacoes where id::text like '00000000-0000-0000-0000-0000009ae%'$$,
  array['00000000-0000-0000-0000-0000009ae003']::uuid[],
  'utilizador comum só vê a que é dele, e não a que lhe dirigiram na Org B'
);

select is_empty(
  $$select id from public.notificacoes where org_id = '00000000-0000-0000-0000-0000009a0b00'$$,
  'pedir explicitamente as da Org B não devolve nada'
);

-- Sem regra de UPDATE/DELETE para authenticated, o bloco nunca falha: não toca em
-- linha nenhuma, e as contagens mais abaixo provam-no. Inserir rebenta.
do $$
begin
  update public.notificacoes set titulo = 'mexido';
  delete from public.notificacoes;
end
$$;

select throws_ok(
  $$insert into public.notificacoes (org_id, tipo, titulo, severidade, destinatario_id)
    values ('00000000-0000-0000-0000-0000009a0b00', 'cobranca_gerada', 'intrusa', 'normal',
            '00000000-0000-0000-0000-0000009a0005')$$,
  '42501',
  null,
  'não se insere notificação noutra organização'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009a0005', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009a0005","role":"authenticated"}', true);
select set_eq(
  $$select id from public.notificacoes where id::text like '00000000-0000-0000-0000-0000009ae%'$$,
  array['00000000-0000-0000-0000-0000009ae005', '00000000-0000-0000-0000-0000009ae006']::uuid[],
  'admin da Org B só vê as da Org B, e não a pessoal do comum'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009a0006', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009a0006","role":"authenticated"}', true);
select ok(
  (select count(*) from public.notificacoes
    where id in ('00000000-0000-0000-0000-0000009ae001', '00000000-0000-0000-0000-0000009ae007')) = 2,
  'o grupo Administrador (sem is_admin) vê os motoristas pendentes pelo nome do grupo'
);

reset role;

select is(
  (select count(*)::int from public.notificacoes
    where id::text like '00000000-0000-0000-0000-0000009ae%' and titulo = 'mexido'),
  0,
  'o update do utilizador comum não alterou nenhuma notificação'
);

select is(
  (select count(*)::int from public.notificacoes where id::text like '00000000-0000-0000-0000-0000009ae%'),
  9,
  'o delete do utilizador comum não apagou nenhuma notificação'
);

-- ── Sem sessão ─────────────────────────────────────────────

-- Falha já no GRANT (anon não tem SELECT); rls_deny_anon é a segunda barreira.
set local role anon;

select throws_ok(
  $$select id from public.notificacoes$$,
  '42501',
  null,
  'anon não lê notificações'
);

reset role;

-- ALTER POLICY só troca a expressão: tipo, papéis e comando ficam.
select results_eq(
  $$select policyname::text, permissive::text, roles::text, cmd::text
      from pg_policies
     where schemaname = 'public' and tablename = 'notificacoes'
     order by policyname$$,
  $$values ('rls_deny_anon', 'RESTRICTIVE', '{anon}', 'ALL'),
           ('rls_org_isolation', 'RESTRICTIVE', '{authenticated}', 'ALL'),
           ('ver notificacoes do meu cargo', 'PERMISSIVE', '{public}', 'SELECT')$$,
  'as três regras de notificacoes mantêm tipo, papéis e comando'
);

select * from finish();
rollback;
