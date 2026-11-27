-- ============================================================
-- Resumo da semana na ficha do motorista: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261127120000. Cobre:
--   (1) o recurso motoristas_resumos existe e o Administrador tem-no;
--   (2) privilégios: anon não executa, authenticated sim;
--   (3) sem financeiro_recibos nem motoristas_resumos: recusa;
--   (4) com motoristas_resumos: devolve as 5 listas;
--   (5) Bolt: as do motorista e as sem ficha que podem ser dele; nunca as de
--       outro condutor ou org; portagens só dele; contas Uber dele e de frota;
--   (6) motorista de outra org ou chamador de outra org: recusa;
--   (7) período invertido ou maior que 31 dias: recusa.
-- ============================================================

begin;
select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000005e5001', 'gestor-a@resumo-ficha.pt'),
  ('00000000-0000-0000-0000-0000005e5002', 'sem-perm-a@resumo-ficha.pt'),
  ('00000000-0000-0000-0000-0000005e5003', 'gestor-b@resumo-ficha.pt');

-- Organizações depois do bootstrap: criar uma já semeia os grupos de base.
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000005e0a00', 'Org Resumo Ficha A', 'resumo-ficha-a'),
  ('00000000-0000-0000-0000-0000005e0b00', 'Org Resumo Ficha B', 'resumo-ficha-b');

-- handle_new_user_org pode ter metido estes utilizadores noutra org: vence este teste.
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000005e5001', '00000000-0000-0000-0000-0000005e0a00'),
  ('00000000-0000-0000-0000-0000005e5002', '00000000-0000-0000-0000-0000005e0a00'),
  ('00000000-0000-0000-0000-0000005e5003', '00000000-0000-0000-0000-0000005e0b00')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000005ec001', 'Gestor resumo A', '00000000-0000-0000-0000-0000005e0a00'),
  ('00000000-0000-0000-0000-0000005ec002', 'Sem permissao A', '00000000-0000-0000-0000-0000005e0a00'),
  ('00000000-0000-0000-0000-0000005ec003', 'Gestor resumo B', '00000000-0000-0000-0000-0000005e0b00');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000005e5001', '00000000-0000-0000-0000-0000005e0a00', false,
   '00000000-0000-0000-0000-0000005ec001'),
  ('00000000-0000-0000-0000-0000005e5002', '00000000-0000-0000-0000-0000005e0a00', false,
   '00000000-0000-0000-0000-0000005ec002'),
  ('00000000-0000-0000-0000-0000005e5003', '00000000-0000-0000-0000-0000005e0b00', false,
   '00000000-0000-0000-0000-0000005ec003')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

-- Gestores A e B: só o recurso novo. "Sem permissao": nenhum.
insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-0000005ec001'::uuid, r.id, '00000000-0000-0000-0000-0000005e0a00'::uuid, true, false
  from public.recursos r where r.nome = 'motoristas_resumos'
union all
select '00000000-0000-0000-0000-0000005ec003'::uuid, r.id, '00000000-0000-0000-0000-0000005e0b00'::uuid, true, false
  from public.recursos r where r.nome = 'motoristas_resumos';

-- X e Y na org A, Z na org B.
insert into public.motoristas_ativos (id, nome, org_id, bolt_id) values
  ('00000000-0000-0000-0000-0000005e0001', 'Xavier Lopes', '00000000-0000-0000-0000-0000005e0a00', 'rf-bolt-x'),
  ('00000000-0000-0000-0000-0000005e0002', 'Yara Costa', '00000000-0000-0000-0000-0000005e0a00', null),
  ('00000000-0000-0000-0000-0000005e0003', 'Zacarias Pinto', '00000000-0000-0000-0000-0000005e0b00', null);

insert into public.plataformas_configuracao (id, org_id, plataforma, nome, robot_target_platform) values
  ('00000000-0000-0000-0000-0000005eb0a1', '00000000-0000-0000-0000-0000005e0a00',
   'robot', 'Bolt Resumo Ficha A', 'bolt'),
  ('00000000-0000-0000-0000-0000005eb0b1', '00000000-0000-0000-0000-0000005e0b00',
   'robot', 'Bolt Resumo Ficha B', 'bolt');

-- As triggers (resolver_motorista, imputação) reescrevem motorista_id a partir
-- das identidades: aqui o motorista de cada linha é o que o teste diz.
alter table public.bolt_resumos_semanais disable trigger user;
alter table public.via_verde_transacoes disable trigger user;
alter table public.uber_drivers disable trigger user;

insert into public.bolt_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, motorista_nome,
   motorista_id, identificador_motorista, fonte_viagens, ganhos_liquidos, gorjetas, viagens_terminadas)
values
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   '2026-11-16 a 2026-11-22', '2026-11-16', '2026-11-22', 'rf-x', 'Bolt X',
   '00000000-0000-0000-0000-0000005e0001', null, 'csv', 100, 2, 10),
  -- Sem ficha, mas o nome pode ser do Xavier: o frontend emparelha-a.
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   '2026-11-16 a 2026-11-22', '2026-11-16', '2026-11-22', 'rf-nome', 'Xavier Lopes Silva',
   null, null, 'csv', 50, 0, 5),
  -- Sem ficha, com o identificador Bolt do Xavier.
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   '2026-11-16 a 2026-11-22', '2026-11-16', '2026-11-22', 'rf-id', 'Condutor Por Id',
   null, 'rf-bolt-x', 'csv', 40, 0, 4),
  -- Sem ficha e sem nada do Xavier: ganhos de outra pessoa, não saem.
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   '2026-11-16 a 2026-11-22', '2026-11-16', '2026-11-22', 'rf-alheio', 'Condutor Alheio',
   null, 'rf-bolt-outro', 'csv', 30, 0, 3),
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   '2026-11-16 a 2026-11-22', '2026-11-16', '2026-11-22', 'rf-y', 'Bolt Y',
   '00000000-0000-0000-0000-0000005e0002', null, 'csv', 70, 0, 7),
  -- Outra semana: fora do período pedido.
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   '2026-11-02 a 2026-11-08', '2026-11-02', '2026-11-08', 'rf-x', 'Bolt X Antiga',
   '00000000-0000-0000-0000-0000005e0001', null, 'csv', 90, 0, 9),
  -- Org B, sem ficha, com o nome do Zacarias.
  ('00000000-0000-0000-0000-0000005e0b00', '00000000-0000-0000-0000-0000005eb0b1',
   '2026-11-16 a 2026-11-22', '2026-11-16', '2026-11-22', 'rf-z', 'Zacarias Pinto',
   null, null, 'csv', 60, 0, 6);

insert into public.via_verde_transacoes (org_id, transaction_id, transaction_date, amount, motorista_id) values
  ('00000000-0000-0000-0000-0000005e0a00', 'rf-vv-x', '2026-11-18 10:00+00', 1.75,
   '00000000-0000-0000-0000-0000005e0001'),
  ('00000000-0000-0000-0000-0000005e0a00', 'rf-vv-y', '2026-11-18 10:00+00', 3.10,
   '00000000-0000-0000-0000-0000005e0002'),
  -- Último segundo da semana conta; o seguinte já não.
  ('00000000-0000-0000-0000-0000005e0a00', 'rf-vv-x-limite', '2026-11-22 23:59:59+00', 0.50,
   '00000000-0000-0000-0000-0000005e0001'),
  ('00000000-0000-0000-0000-0000005e0a00', 'rf-vv-x-fora', '2026-11-23 00:00:00+00', 9.99,
   '00000000-0000-0000-0000-0000005e0001');

insert into public.uber_drivers
  (org_id, integracao_id, uber_driver_id, full_name, motorista_id, is_conta_frota)
values
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   'rf-uber-x', 'Xavier L.', '00000000-0000-0000-0000-0000005e0001', false),
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   'rf-uber-y', 'Yara Costa', '00000000-0000-0000-0000-0000005e0002', false),
  ('00000000-0000-0000-0000-0000005e0a00', '00000000-0000-0000-0000-0000005eb0a1',
   'rf-uber-frota', 'Empresa Frota', null, true),
  ('00000000-0000-0000-0000-0000005e0b00', '00000000-0000-0000-0000-0000005eb0b1',
   'rf-uber-z', 'Zacarias Pinto', '00000000-0000-0000-0000-0000005e0003', false);

alter table public.bolt_resumos_semanais enable trigger user;
alter table public.via_verde_transacoes enable trigger user;
alter table public.uber_drivers enable trigger user;

-- ── (1) Recurso ────────────────────────────────────────────

select is(
  (select categoria from public.recursos where nome = 'motoristas_resumos'),
  'Motoristas',
  'o recurso motoristas_resumos existe na categoria Motoristas'
);

select ok(
  exists (
    select 1 from public.cargo_permissoes cp
      join public.cargos c on c.id = cp.cargo_id
      join public.recursos r on r.id = cp.recurso_id
     where r.nome = 'motoristas_resumos'
       and c.org_id = '00000000-0000-0000-0000-0000005e0a00'
       and btrim(lower(c.nome)) = 'administrador'
       and cp.tem_acesso
  ),
  'o Administrador de uma org nova nasce com motoristas_resumos'
);

-- ── (2) Privilégios ────────────────────────────────────────

select ok(
  not has_function_privilege('anon',
    'public.resumo_semana_motorista_ficha(uuid, date, date)', 'EXECUTE'),
  'anon não executa resumo_semana_motorista_ficha'
);

select ok(
  has_function_privilege('authenticated',
    'public.resumo_semana_motorista_ficha(uuid, date, date)', 'EXECUTE'),
  'authenticated executa resumo_semana_motorista_ficha (a permissão é verificada lá dentro)'
);

-- ── (3) Sem permissão ──────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000005e5002', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005e5002","role":"authenticated"}', true);

select throws_ok($$
  select public.resumo_semana_motorista_ficha(
    '00000000-0000-0000-0000-0000005e0001', '2026-11-16', '2026-11-22')
$$, '42501', null, 'sem financeiro nem motoristas_resumos: recusa');

-- ── (4)(5) Gestor A com motoristas_resumos ─────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000005e5001', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005e5001","role":"authenticated"}', true);

create temp table r on commit drop as
  select public.resumo_semana_motorista_ficha(
    '00000000-0000-0000-0000-0000005e0001', '2026-11-16', '2026-11-22') as j;

select is(
  (select array_agg(k order by k) from r, jsonb_object_keys(r.j) k),
  array['bolt_resumos', 'combustivel', 'contratos', 'portagens', 'uber_drivers'],
  'devolve as cinco listas'
);

select is(
  (select array_agg(e->>'motorista_nome' order by e->>'motorista_nome')
     from r, jsonb_array_elements(r.j->'bolt_resumos') e),
  array['Bolt X', 'Condutor Por Id', 'Xavier Lopes Silva'],
  'Bolt: as do motorista e as sem ficha que podem ser dele (identificador ou nome)'
);

select ok(
  not exists (select 1 from r, jsonb_array_elements(r.j->'bolt_resumos') e
               where e->>'motorista_nome' in
                 ('Condutor Alheio', 'Bolt Y', 'Zacarias Pinto', 'Bolt X Antiga')),
  'Bolt: nunca a de outro condutor, de outra org nem de outra semana'
);

select is(
  (select sum((e->>'amount')::numeric) from r, jsonb_array_elements(r.j->'portagens') e),
  2.25::numeric,
  'portagens: só as do motorista, até ao último segundo da semana'
);

select is(
  (select array_agg(e->>'uber_driver_id' order by e->>'uber_driver_id')
     from r, jsonb_array_elements(r.j->'uber_drivers') e),
  array['rf-uber-frota', 'rf-uber-x'],
  'contas Uber: a do motorista e as de frota; nem a da Yara nem a da org B'
);

select ok(
  (select e->'full_name' = 'null'::jsonb and e->'motorista_id' = 'null'::jsonb
     from r, jsonb_array_elements(r.j->'uber_drivers') e
    where e->>'uber_driver_id' = 'rf-uber-frota'),
  'conta de frota vai sem nome nem motorista'
);

select is(
  (select jsonb_array_length(r.j->'contratos') from r),
  0,
  'contratos: lista vazia quando o motorista não tem contrato'
);

select is(
  (select jsonb_array_length(r.j->'combustivel') from r),
  0,
  'combustível: lista vazia quando não há transações'
);

-- ── (6) Outra org ──────────────────────────────────────────

select throws_ok($$
  select public.resumo_semana_motorista_ficha(
    '00000000-0000-0000-0000-0000005e0003', '2026-11-16', '2026-11-22')
$$, '42501', null, 'motorista de outra org: recusa');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000005e5003', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005e5003","role":"authenticated"}', true);

select throws_ok($$
  select public.resumo_semana_motorista_ficha(
    '00000000-0000-0000-0000-0000005e0001', '2026-11-16', '2026-11-22')
$$, '42501', null, 'gestor da org B com o recurso não vê o motorista da org A');

select lives_ok($$
  select public.resumo_semana_motorista_ficha(
    '00000000-0000-0000-0000-0000005e0003', '2026-11-16', '2026-11-22')
$$, 'gestor da org B vê o motorista da sua org');

select is(
  (select array_agg(e->>'motorista_nome')
     from jsonb_array_elements((public.resumo_semana_motorista_ficha(
       '00000000-0000-0000-0000-0000005e0003', '2026-11-16', '2026-11-22'))->'bolt_resumos') e),
  array['Zacarias Pinto'],
  'gestor da org B: só a Bolt da org B'
);

-- ── (7) Período inválido ───────────────────────────────────

select throws_ok($$
  select public.resumo_semana_motorista_ficha(
    '00000000-0000-0000-0000-0000005e0003', '2026-11-22', '2026-11-16')
$$, '22023', null, 'fim antes do início: recusa');

select throws_ok($$
  select public.resumo_semana_motorista_ficha(
    '00000000-0000-0000-0000-0000005e0003', '2026-01-01', '2026-11-22')
$$, '22023', null, 'mais de 31 dias: recusa (não é exportação do histórico)');

reset role;

select ok(
  not has_function_privilege('authenticated',
    'public.nome_plataforma_pode_ser(text, text)', 'EXECUTE'),
  'nome_plataforma_pode_ser não está exposta a authenticated'
);

-- "João" com o til decomposto (NFD), como vem de alguns CSV: o frontend emparelha.
select ok(
  public.nome_plataforma_pode_ser(E'João Pinto', 'João Costa')
    and not public.nome_plataforma_pode_ser('Condutor Alheio', 'Xavier Lopes'),
  'nome_plataforma_pode_ser: acentos decompostos contam, nomes sem nada em comum não'
);

select * from finish();
rollback;
