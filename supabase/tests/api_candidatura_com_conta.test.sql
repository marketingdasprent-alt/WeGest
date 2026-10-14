-- ============================================================
-- Candidatura do site ligada à conta do motorista (p_user_id)
-- ============================================================
-- A conta tem de ser motorista da org da chave, sem ficha nem outra
-- candidatura, com o email do pedido. Na aprovação a conta só segue para
-- uma ficha nova; o motorista não muda os campos da API na candidatura.
-- NIFs de teste com checksum válido; datas relativas a now().
-- ============================================================
begin;
select plan(24);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000c0aff', 'bootstrap@comconta.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000c0a00', 'Org Conta A', 'comconta-a'),
  ('00000000-0000-0000-0000-0000000c0b00', 'Org Conta B', 'comconta-b');
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-0000000c0901', '00000000-0000-0000-0000-0000000c0a00', 'Site A', 'rent_a_car',
   '{tvde:candidaturas:write,tvde:candidaturas:read}');

-- 301 motorista da A; 302 motorista só da B; 303 colaborador da A; 304 motorista
-- da A já com ficha; 305 motorista da A já com candidatura do portal; 306 e 307
-- motoristas da A cujo NIF tem ficha sem conta (306 com o mesmo email, 307 não).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0201', 'admin@comconta.pt'),
  ('00000000-0000-0000-0000-0000000c0301', 'm1@comconta.pt'),
  ('00000000-0000-0000-0000-0000000c0302', 'm2@comconta.pt'),
  ('00000000-0000-0000-0000-0000000c0303', 'colab@comconta.pt'),
  ('00000000-0000-0000-0000-0000000c0304', 'comficha@comconta.pt'),
  ('00000000-0000-0000-0000-0000000c0305', 'portal@comconta.pt'),
  ('00000000-0000-0000-0000-0000000c0306', 'mesmo@comconta.pt'),
  ('00000000-0000-0000-0000-0000000c0307', 'outro@comconta.pt');
update public.profiles set tipo_utilizador = 'motorista'
 where id in ('00000000-0000-0000-0000-0000000c0301', '00000000-0000-0000-0000-0000000c0302',
              '00000000-0000-0000-0000-0000000c0304', '00000000-0000-0000-0000-0000000c0305',
              '00000000-0000-0000-0000-0000000c0306', '00000000-0000-0000-0000-0000000c0307');
update public.profiles set tipo_utilizador = 'colaborador' where id = '00000000-0000-0000-0000-0000000c0303';
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000c0201', '00000000-0000-0000-0000-0000000c0a00', true),
  ('00000000-0000-0000-0000-0000000c0301', '00000000-0000-0000-0000-0000000c0a00', false),
  ('00000000-0000-0000-0000-0000000c0302', '00000000-0000-0000-0000-0000000c0b00', false),
  ('00000000-0000-0000-0000-0000000c0303', '00000000-0000-0000-0000-0000000c0a00', false),
  ('00000000-0000-0000-0000-0000000c0304', '00000000-0000-0000-0000-0000000c0a00', false),
  ('00000000-0000-0000-0000-0000000c0305', '00000000-0000-0000-0000-0000000c0a00', false),
  ('00000000-0000-0000-0000-0000000c0306', '00000000-0000-0000-0000-0000000c0a00', false),
  ('00000000-0000-0000-0000-0000000c0307', '00000000-0000-0000-0000-0000000c0a00', false)
  on conflict (user_id, org_id) do nothing;
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000c0201', '00000000-0000-0000-0000-0000000c0a00'),
  ('00000000-0000-0000-0000-0000000c0301', '00000000-0000-0000-0000-0000000c0a00')
  on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.motoristas_ativos (id, org_id, nome, nif, user_id, email, iban) values
  ('00000000-0000-0000-0000-0000000c0c04', '00000000-0000-0000-0000-0000000c0a00', 'Com Ficha', '210000040',
   '00000000-0000-0000-0000-0000000c0304', 'comficha@comconta.pt', null),
  ('00000000-0000-0000-0000-0000000c0c06', '00000000-0000-0000-0000-0000000c0a00', 'Ficha Mesmo Email', '210000058',
   null, 'mesmo@comconta.pt', null),
  ('00000000-0000-0000-0000-0000000c0c07', '00000000-0000-0000-0000-0000000c0a00', 'Ficha Outro Email', '210000066',
   null, 'ficha7@comconta.pt', 'PT42003300000045678901234');
insert into public.motorista_candidaturas (org_id, user_id, nome, email, nif, status) values
  ('00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0305',
   'Portal', 'portal@comconta.pt', '210000031', 'rascunho');

create temp table ped as select jsonb_build_object(
  'referencia_externa', 'conta-0001',
  'nome', 'Motorista Um',
  'email', 'm1@comconta.pt',
  'telefone', '+351912345678',
  'nif', '210000015',
  'morada', 'Rua Direita 1',
  'codigo_postal', '2400-001',
  'cidade', 'Leiria',
  'documento', jsonb_build_object('tipo', 'cc', 'numero', '12345678', 'validade', (current_date + 365)::text),
  'carta_conducao', jsonb_build_object('numero', 'L-123456', 'categorias', jsonb_build_array('B'),
                                       'validade', (current_date + 365)::text),
  'licenca_tvde', null,
  'em_formacao_tvde', true,
  'iban', 'PT50000201231234567890154',
  'observacoes', null,
  'consentimento', jsonb_build_object('versao', '2026-10', 'aceite_em', now())) as j;
grant select on ped to public;

create function pg_temp.criar(p_extra jsonb, p_user uuid) returns jsonb language sql as $$
  select public.api_tvde_criar_candidatura('00000000-0000-0000-0000-0000000c0a00',
    '00000000-0000-0000-0000-0000000c0901', (select j from ped) || p_extra, p_user);
$$;

-- ── 1) recusas da conta ─────────────────────────────────────────────────────
select is(pg_temp.criar('{"email": "outro-email@comconta.pt"}', '00000000-0000-0000-0000-0000000c0301')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'email do pedido diferente do da conta');
select is(pg_temp.criar('{"referencia_externa": "conta-r2", "email": "m2@comconta.pt"}', '00000000-0000-0000-0000-0000000c0302')->'erro'->>'codigo',
  'CONTA_INVALIDA', 'conta de motorista de outra organização');
select is(pg_temp.criar('{"referencia_externa": "conta-r3", "email": "colab@comconta.pt"}', '00000000-0000-0000-0000-0000000c0303')->'erro'->>'codigo',
  'CONTA_INVALIDA', 'conta de colaborador da organização');
select is(pg_temp.criar('{"referencia_externa": "conta-r4"}', '00000000-0000-0000-0000-0000000c09ff')->'erro'->>'codigo',
  'CONTA_INVALIDA', 'conta inexistente');
select is(pg_temp.criar('{"referencia_externa": "conta-r5", "email": "comficha@comconta.pt"}', '00000000-0000-0000-0000-0000000c0304')->'erro'->>'codigo',
  'CANDIDATURA_EXISTENTE', 'conta que já tem ficha nesta organização');
select is(pg_temp.criar('{"referencia_externa": "conta-r6", "email": "portal@comconta.pt"}', '00000000-0000-0000-0000-0000000c0305')->'erro'->>'codigo',
  'CANDIDATURA_EXISTENTE', 'conta que já tem candidatura (user_id é UNIQUE)');
select is((select count(*)::int from public.motorista_candidaturas
            where org_id = '00000000-0000-0000-0000-0000000c0a00' and origem = 'site'), 0,
  'nenhuma recusa gravou candidatura');

-- ── 2) criar com conta ──────────────────────────────────────────────────────
create temp table r1 as select pg_temp.criar('{}', '00000000-0000-0000-0000-0000000c0301') as r;
grant select on r1 to public;
select ok((select r->>'estado' = 'submetido' and (r->>'com_conta')::boolean from r1),
  'com conta: submetido e com_conta = true');
select is((select c.user_id from public.motorista_candidaturas c, r1 where c.id = (r1.r->>'id')::uuid),
  '00000000-0000-0000-0000-0000000c0301'::uuid, 'a linha guarda o user_id da conta');
select ok((public.api_tvde_obter_candidatura('00000000-0000-0000-0000-0000000c0a00',
             (select (r->>'id')::uuid from r1))->>'com_conta')::boolean,
  'obter também devolve com_conta = true');
select ok((select (pg_temp.criar('{}', '00000000-0000-0000-0000-0000000c0301')->>'repetida')::boolean),
  'repetir a mesma referência devolve a mesma, com repetida');
select is(pg_temp.criar('{"email": "mesmo@comconta.pt", "nif": "210000058"}', '00000000-0000-0000-0000-0000000c0306')->'erro'->>'codigo',
  'CANDIDATURA_EXISTENTE', 'a mesma referência com outra conta não devolve a candidatura alheia');

create temp table r0 as select public.api_tvde_criar_candidatura('00000000-0000-0000-0000-0000000c0a00',
  '00000000-0000-0000-0000-0000000c0901',
  (select j || '{"referencia_externa": "conta-0000", "nif": "210000023", "email": "semconta@comconta.pt"}'::jsonb from ped)) as r;
grant select on r0 to public;
select ok((select r->>'estado' = 'submetido' and not (r->>'com_conta')::boolean from r0),
  'sem p_user_id (3 argumentos) continua a funcionar, com_conta = false');

create temp table cs as select
  (pg_temp.criar('{"referencia_externa": "conta-0006", "nif": "210000058", "email": "mesmo@comconta.pt"}',
     '00000000-0000-0000-0000-0000000c0306')->>'id')::uuid as c6,
  (pg_temp.criar('{"referencia_externa": "conta-0007", "nif": "210000066", "email": "outro@comconta.pt"}',
     '00000000-0000-0000-0000-0000000c0307')->>'id')::uuid as c7;
grant select on cs to public;

-- ── 3) o motorista não muda os campos da API ────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c0301","role":"authenticated"}', true);
update public.motorista_candidaturas
   set referencia_externa = 'roubada', origem = 'portal', api_chave_id = null, telefone = '+351911111111'
 where id = (select (r->>'id')::uuid from r1);
reset role;
select ok((select referencia_externa = 'conta-0001' and origem = 'site'
                  and api_chave_id = '00000000-0000-0000-0000-0000000c0901'
             from public.motorista_candidaturas where id = (select (r->>'id')::uuid from r1)),
  'referencia_externa, origem e api_chave_id ficam como estavam');
select is((select telefone from public.motorista_candidaturas where id = (select (r->>'id')::uuid from r1)),
  '+351911111111', 'os dados do formulário continuam editáveis pelo motorista');

-- ── 4) aprovar ──────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c0201","role":"authenticated"}', true);

select is(public.aprovar_candidatura_motorista((select (r->>'id')::uuid from r1))->>'accao', 'criado',
  'aprovar a candidatura com conta cria a ficha');
select is(public.aprovar_candidatura_motorista((select c6 from cs))->>'accao', 'associado',
  'NIF com ficha sem conta e o mesmo email: associa');
select is(public.aprovar_candidatura_motorista((select c7 from cs))->>'accao', 'associado',
  'NIF com ficha sem conta e outro email: associa (só preenche vazios)');
reset role;

select is((select m.user_id from public.motoristas_ativos m
            where m.org_id = '00000000-0000-0000-0000-0000000c0a00' and m.nif = '210000015'),
  '00000000-0000-0000-0000-0000000c0301'::uuid, 'a ficha nova fica com a conta do motorista');
select ok((select user_id is null from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000000c0c06'),
  'ficha existente nunca recebe a conta do site, mesmo com o mesmo email (email não confirmado)');
select ok((select user_id is null and email = 'ficha7@comconta.pt' and iban = 'PT42003300000045678901234'
             from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000000c0c07'),
  'ficha com outro email fica sem conta, com o email e o IBAN dela');

-- ── 5) privilégios ──────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.api_tvde_criar_candidatura(uuid,uuid,jsonb,uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.api_tvde_criar_candidatura(uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'anon e authenticated não executam a criar');
select ok(has_function_privilege('service_role', 'public.api_tvde_criar_candidatura(uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'service_role executa a criar');
select is((select count(*)::int from pg_proc where proname = 'api_tvde_criar_candidatura'), 1,
  'só existe uma api_tvde_criar_candidatura (a de 3 argumentos saiu)');

select * from finish();
rollback;
