-- ============================================================
-- Histórico de cada dano (estado e observações) — pgTAP
-- ============================================================
-- Ver a migração 20261023100000. Provas:
--   (a) criar o dano grava o estado inicial;
--   (b) cada mudança de estado grava anterior/novo, pela ordem do processo;
--   (c) editar observações grava o texto anterior e o novo;
--   (d) um UPDATE que não mexe em estado nem observações não grava nada;
--   (e) RLS: vê o histórico quem vê o dano — admin da org sim, sem permissão não, outra org não;
--   (f) authenticated não escreve na tabela nem executa a função do trigger.
-- ============================================================

begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d50ff', 'bootstrap@dano-historico.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000d5a00', 'Org Dano A', 'dh-dano-a'),
  ('00000000-0000-0000-0000-0000000d5b00', 'Org Dano B', 'dh-dano-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d5a01', 'admin-a@dano-historico.pt'),
  ('00000000-0000-0000-0000-0000000d5a02', 'sem-perm-a@dano-historico.pt'),
  ('00000000-0000-0000-0000-0000000d5b01', 'admin-b@dano-historico.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000d5a01', '00000000-0000-0000-0000-0000000d5a00'),
  ('00000000-0000-0000-0000-0000000d5a02', '00000000-0000-0000-0000-0000000d5a00'),
  ('00000000-0000-0000-0000-0000000d5b01', '00000000-0000-0000-0000-0000000d5b00');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000d5a01', '00000000-0000-0000-0000-0000000d5a00', true),
  ('00000000-0000-0000-0000-0000000d5a02', '00000000-0000-0000-0000-0000000d5a00', false),
  ('00000000-0000-0000-0000-0000000d5b01', '00000000-0000-0000-0000-0000000d5b00', true)
on conflict (user_id, org_id) do update set is_admin = excluded.is_admin;

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d5aa1', '00000000-0000-0000-0000-0000000d5a00', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000d5ab1', '00000000-0000-0000-0000-0000000d5a00',
   '00000000-0000-0000-0000-0000000d5aa1', 'Clio');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, status) values
  ('00000000-0000-0000-0000-0000000d5ae1', '00000000-0000-0000-0000-0000000d5a00', 'DH-01-AA',
   '00000000-0000-0000-0000-0000000d5aa1', '00000000-0000-0000-0000-0000000d5ab1', 'disponivel');

-- ── (a) Criar grava o estado inicial ───────────────────────

insert into public.viatura_danos (id, org_id, viatura_id, descricao, estado, observacoes) values
  ('00000000-0000-0000-0000-0000000d5ad1', '00000000-0000-0000-0000-0000000d5a00',
   '00000000-0000-0000-0000-0000000d5ae1', 'Colisão lateral esquerda', 'existente', 'Sem perito');

select results_eq(
  $$ select campo, valor_anterior, valor_novo from public.viatura_dano_historico
      where dano_id = '00000000-0000-0000-0000-0000000d5ad1' $$,
  $$ values ('estado'::text, null::text, 'existente'::text) $$,
  '(a) criar o dano grava o estado inicial'
);

-- ── (b) Mudanças de estado ─────────────────────────────────

update public.viatura_danos set estado = 'aguarda_peritagem'
 where id = '00000000-0000-0000-0000-0000000d5ad1';
update public.viatura_danos set estado = 'condicional'
 where id = '00000000-0000-0000-0000-0000000d5ad1';

select is(
  (select count(*)::int from public.viatura_dano_historico
    where dano_id = '00000000-0000-0000-0000-0000000d5ad1' and campo = 'estado'),
  3,
  '(b) cada mudança de estado grava uma linha'
);
select ok(
  exists (select 1 from public.viatura_dano_historico
           where dano_id = '00000000-0000-0000-0000-0000000d5ad1' and campo = 'estado'
             and valor_anterior = 'aguarda_peritagem' and valor_novo = 'condicional'),
  '(b) a linha guarda o estado anterior e o novo'
);

-- ── (c) Observações ────────────────────────────────────────

update public.viatura_danos set observacoes = 'Peritagem marcada para 13/10'
 where id = '00000000-0000-0000-0000-0000000d5ad1';

select results_eq(
  $$ select valor_anterior, valor_novo from public.viatura_dano_historico
      where dano_id = '00000000-0000-0000-0000-0000000d5ad1' and campo = 'observacoes' $$,
  $$ values ('Sem perito'::text, 'Peritagem marcada para 13/10'::text) $$,
  '(c) editar observações guarda o texto anterior e o novo'
);

-- ── (d) Outras colunas não gravam ──────────────────────────

update public.viatura_danos set valor = 120, estado = 'condicional'
 where id = '00000000-0000-0000-0000-0000000d5ad1';

select is(
  (select count(*)::int from public.viatura_dano_historico
    where dano_id = '00000000-0000-0000-0000-0000000d5ad1'),
  4,
  '(d) um UPDATE sem mudança de estado nem de observações não grava nada'
);

-- ── (e) RLS ────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d5a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d5a01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.viatura_dano_historico
    where dano_id = '00000000-0000-0000-0000-0000000d5ad1'),
  4,
  '(e) o admin da org A vê o histórico do dano'
);
select throws_ok(
  $$ insert into public.viatura_dano_historico (org_id, dano_id, campo, valor_novo)
     values ('00000000-0000-0000-0000-0000000d5a00', '00000000-0000-0000-0000-0000000d5ad1',
             'estado', 'reparado') $$,
  '42501', null,
  '(f) authenticated não escreve no histórico, nem na própria org'
);

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d5a02', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d5a02","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.viatura_dano_historico
    where dano_id = '00000000-0000-0000-0000-0000000d5ad1'),
  0,
  '(e) sem permissão para ver o dano, não vê o histórico, mesmo na própria org'
);

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d5b01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d5b01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.viatura_dano_historico
    where dano_id = '00000000-0000-0000-0000-0000000d5ad1'),
  0,
  '(e) o admin da org B não vê nada da org A'
);

reset role;

-- ── (f) Grants ─────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.fn_viatura_dano_regista_historico()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_viatura_dano_regista_historico()', 'EXECUTE'),
  '(f) só o dono da base executa a função do trigger'
);
select ok(
  has_table_privilege('authenticated', 'public.viatura_dano_historico', 'SELECT')
  and not has_table_privilege('authenticated', 'public.viatura_dano_historico', 'INSERT')
  and not has_table_privilege('authenticated', 'public.viatura_dano_historico', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.viatura_dano_historico', 'DELETE'),
  '(f) authenticated só tem SELECT na tabela'
);
select ok(
  not has_table_privilege('anon', 'public.viatura_dano_historico', 'SELECT'),
  '(f) anon não lê o histórico'
);

-- ── Apagar o dano leva o histórico ─────────────────────────

delete from public.viatura_danos where id = '00000000-0000-0000-0000-0000000d5ad1';

select is(
  (select count(*)::int from public.viatura_dano_historico
    where dano_id = '00000000-0000-0000-0000-0000000d5ad1'),
  0,
  'apagar o dano apaga o seu histórico'
);
select ok(
  exists (select 1 from pg_trigger
           where tgname = 'trg_viatura_dano_regista_historico'
             and tgrelid = 'public.viatura_danos'::regclass),
  'o trigger de registo existe'
);

select * from finish();
rollback;
