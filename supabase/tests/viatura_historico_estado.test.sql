-- ============================================================
-- Histórico de mudanças de estado das viaturas — pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261021120000. Provas:
--   (a) mudar o status grava uma linha com anterior/novo, profundidade 1,
--       'servidor' sem PostgREST e 'PATCH /viaturas' + user-agent + ator com ele;
--   (b) um UPDATE que não muda o status não grava nada;
--   (c) uma mudança vinda de outro trigger grava com profundidade > 1;
--   (d) updated_at só mexe quando o status muda;
--   (e) um utilizador de outra org não vê as linhas (RLS);
--   (f) authenticated não escreve na tabela nem executa a função do trigger.
--
-- Os GUCs request.* simulam o PostgREST com set_config; headers inválidos e
-- user-agents gigantes nunca podem fazer falhar o UPDATE da viatura.
-- Nada depende de dados de produção nem do dia da semana.
-- ============================================================

begin;
select plan(30);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e50ff', 'bootstrap@viatura-historico.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000e5a00', 'Org Historico A', 'vh-estado-a'),
  ('00000000-0000-0000-0000-0000000e5b00', 'Org Historico B', 'vh-estado-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e5a01', 'a@viatura-historico.pt'),
  ('00000000-0000-0000-0000-0000000e5b01', 'b@viatura-historico.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000e5a01', '00000000-0000-0000-0000-0000000e5a00'),
  ('00000000-0000-0000-0000-0000000e5b01', '00000000-0000-0000-0000-0000000e5b00');

-- marca/modelo entram por id: trg_sync_viatura_marca_modelo preenche o texto.
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000e5aa1', '00000000-0000-0000-0000-0000000e5a00', 'Renault'),
  ('00000000-0000-0000-0000-0000000e5ba1', '00000000-0000-0000-0000-0000000e5b00', 'Dacia');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000e5ab1', '00000000-0000-0000-0000-0000000e5a00',
   '00000000-0000-0000-0000-0000000e5aa1', 'Clio'),
  ('00000000-0000-0000-0000-0000000e5bb1', '00000000-0000-0000-0000-0000000e5b00',
   '00000000-0000-0000-0000-0000000e5ba1', 'Sandero');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, status) values
  ('00000000-0000-0000-0000-0000000e5ae1', '00000000-0000-0000-0000-0000000e5a00', 'VH-01-AA',
   '00000000-0000-0000-0000-0000000e5aa1', '00000000-0000-0000-0000-0000000e5ab1', 'disponivel'),
  ('00000000-0000-0000-0000-0000000e5be1', '00000000-0000-0000-0000-0000000e5b00', 'VH-01-BB',
   '00000000-0000-0000-0000-0000000e5ba1', '00000000-0000-0000-0000-0000000e5bb1', 'disponivel');

-- Lê a linha de uma transição pelo estado de chegada: dentro da transacção
-- criado_em é igual em todas, por isso não serve para distinguir.
create function pg_temp.linha(p_viatura uuid, p_estado_novo text)
returns public.viatura_historico language sql as $$
  select h from public.viatura_historico h
   where h.viatura_id = p_viatura and h.estado_novo = p_estado_novo and h.evento_tipo = 'estado'
$$;

create function pg_temp.linhas(p_viatura uuid) returns int language sql as $$
  select count(*)::int from public.viatura_historico where viatura_id = p_viatura
$$;

-- ── (a) Escrita directa, sem PostgREST ─────────────────────

select is(
  pg_temp.linhas('00000000-0000-0000-0000-0000000e5ae1'), 0,
  'inserir a viatura não grava nada: a semente é da migração'
);

update public.viaturas set status = 'em_uso'
 where id = '00000000-0000-0000-0000-0000000e5ae1';

select is(
  pg_temp.linhas('00000000-0000-0000-0000-0000000e5ae1'), 1,
  '(a) mudar o status grava uma linha'
);
select is(
  (select concat_ws(' | ', l.estado_anterior, l.estado_novo, l.evento_tipo, l.profundidade, l.org_id)
     from pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'em_uso') l),
  'disponivel | em_uso | estado | 1 | 00000000-0000-0000-0000-0000000e5a00',
  '(a) anterior, novo, tipo, profundidade 1 e org copiada da viatura'
);
select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'em_uso')).detalhe,
  'status: disponivel → em_uso',
  '(a) o detalhe é legível'
);
select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'em_uso')).origem,
  'servidor',
  '(a) sem request.method/path a origem é "servidor"'
);
select ok(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'em_uso')).ator_id is null
  and (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'em_uso')).user_agent is null,
  '(a) sem sessão não há ator nem user-agent'
);

-- ── (a) Escrita pelo PostgREST, com sessão ─────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e5a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000e5a01","role":"authenticated"}', true);
select set_config('request.method', 'PATCH', true);
select set_config('request.path', '/viaturas', true);
select set_config('request.headers', '{"user-agent":"pgTAP/1.0","accept":"*/*"}', true);

update public.viaturas set status = 'reservada'
 where id = '00000000-0000-0000-0000-0000000e5ae1';

select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'reservada')).origem,
  'PATCH /viaturas',
  '(a) com PostgREST a origem é método + caminho'
);
select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'reservada')).user_agent,
  'pgTAP/1.0',
  '(a) o user-agent vem de request.headers'
);
select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'reservada')).ator_id,
  '00000000-0000-0000-0000-0000000e5a01'::uuid,
  '(a) o ator é o utilizador da sessão'
);

-- ── (b) UPDATE sem mudar o status não grava ────────────────

update public.viaturas set km_atual = 1234
 where id = '00000000-0000-0000-0000-0000000e5ae1';
update public.viaturas set status = 'reservada'
 where id = '00000000-0000-0000-0000-0000000e5ae1';

select is(
  pg_temp.linhas('00000000-0000-0000-0000-0000000e5ae1'), 2,
  '(b) mexer noutra coluna, ou escrever o mesmo status, não grava'
);

-- ── GUCs estragados nunca travam a viatura ─────────────────

select set_config('request.headers', '{isto nao e json', true);

select lives_ok(
  $$ update public.viaturas set status = 'em_recolha'
      where id = '00000000-0000-0000-0000-0000000e5ae1' $$,
  'request.headers inválido não faz falhar o UPDATE'
);
select ok(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'em_recolha')).user_agent is null,
  'com headers inválidos o user-agent fica a NULL'
);
select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'em_recolha')).origem,
  'PATCH /viaturas',
  'e a origem continua a ler-se'
);

select set_config('request.headers', json_build_object('user-agent', repeat('x', 300))::text, true);

update public.viaturas set status = 'vendida'
 where id = '00000000-0000-0000-0000-0000000e5ae1';

select is(
  length((pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'vendida')).user_agent),
  200,
  'o user-agent é truncado a 200 caracteres'
);

-- ── (c) Mudança vinda de outro trigger ─────────────────────
-- Um trigger qualquer a mexer no estado: o que se prova é a profundidade,
-- não quem a provocou. Tabela e função morrem com o rollback.

create table public._vh_empurrao (viatura_id uuid, status text);
create function public._vh_empurra() returns trigger language plpgsql as $$
begin
  update public.viaturas set status = new.status where id = new.viatura_id;
  return new;
end
$$;
create trigger trg_vh_empurra after insert on public._vh_empurrao
  for each row execute function public._vh_empurra();

insert into public._vh_empurrao values ('00000000-0000-0000-0000-0000000e5ae1', 'manutencao');

select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'manutencao')).profundidade::int,
  2,
  '(c) uma mudança em cascata grava com profundidade 2'
);
select is(
  (pg_temp.linha('00000000-0000-0000-0000-0000000e5ae1', 'manutencao')).estado_anterior,
  'vendida',
  '(c) e com o estado anterior certo'
);

-- ── (d) updated_at só mexe quando o status muda ────────────

update public.viaturas set updated_at = '2020-01-01 00:00:00+00'
 where id = '00000000-0000-0000-0000-0000000e5ae1';
update public.viaturas set km_atual = 2000
 where id = '00000000-0000-0000-0000-0000000e5ae1';

select is(
  (select updated_at from public.viaturas where id = '00000000-0000-0000-0000-0000000e5ae1'),
  '2020-01-01 00:00:00+00'::timestamptz,
  '(d) sem mudar o status, updated_at fica como estava'
);

update public.viaturas set status = 'inativo'
 where id = '00000000-0000-0000-0000-0000000e5ae1';

select is(
  (select updated_at from public.viaturas where id = '00000000-0000-0000-0000-0000000e5ae1'),
  now(),
  '(d) mudar o status actualiza updated_at'
);

-- Uma viatura da org B, para as provas de isolamento.
update public.viaturas set status = 'em_uso'
 where id = '00000000-0000-0000-0000-0000000e5be1';

select is(
  pg_temp.linhas('00000000-0000-0000-0000-0000000e5ae1'), 6,
  'a viatura A tem uma linha por transição, sem duplicados'
);
select is(
  pg_temp.linhas('00000000-0000-0000-0000-0000000e5be1'), 1,
  'a viatura B tem a sua'
);

-- ── (e) RLS: cada org vê só o seu histórico ────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e5a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000e5a01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.viatura_historico
    where viatura_id = '00000000-0000-0000-0000-0000000e5ae1'),
  6,
  '(e) o utilizador da org A vê o histórico da sua viatura'
);
select is(
  (select count(*)::int from public.viatura_historico
    where viatura_id = '00000000-0000-0000-0000-0000000e5be1'),
  0,
  '(e) e não vê o da org B'
);
select throws_ok(
  $$ insert into public.viatura_historico (org_id, viatura_id, evento_tipo, estado_novo)
     values ('00000000-0000-0000-0000-0000000e5a00', '00000000-0000-0000-0000-0000000e5ae1',
             'estado', 'disponivel') $$,
  '42501', null,
  '(f) authenticated não escreve no histórico, nem na própria org'
);

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e5b01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000e5b01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.viatura_historico
    where viatura_id = '00000000-0000-0000-0000-0000000e5ae1'),
  0,
  '(e) o utilizador da org B não vê nada da org A'
);
select is(
  (select count(*)::int from public.viatura_historico
    where viatura_id = '00000000-0000-0000-0000-0000000e5be1'),
  1,
  '(e) mas vê a sua'
);

reset role;

-- ── (f) Grants ─────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.fn_viatura_regista_estado()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_viatura_regista_estado()', 'EXECUTE'),
  '(f) só o dono da base executa a função do trigger'
);
select ok(
  has_table_privilege('authenticated', 'public.viatura_historico', 'SELECT')
  and not has_table_privilege('authenticated', 'public.viatura_historico', 'INSERT')
  and not has_table_privilege('authenticated', 'public.viatura_historico', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.viatura_historico', 'DELETE'),
  '(f) authenticated só tem SELECT na tabela'
);
select ok(
  not has_table_privilege('anon', 'public.viatura_historico', 'SELECT'),
  '(f) anon não lê o histórico'
);

select ok(
  exists (select 1 from pg_trigger
           where tgname = 'trg_viatura_regista_estado'
             and tgrelid = 'public.viaturas'::regclass),
  'o trigger de registo existe'
);
select ok(
  exists (select 1 from pg_trigger
           where tgname = 'trg_viatura_status_updated_at'
             and tgrelid = 'public.viaturas'::regclass),
  'o trigger de updated_at existe'
);

select * from finish();
rollback;
