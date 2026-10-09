-- ============================================================
-- Candidaturas TVDE da API do site (Fase D2)
-- ============================================================
-- Criar e obter (service_role), aprovar no ecrã (authenticated, com org e
-- permissão), anonimizar aos 6 meses e privilégios.
-- Fixture do catálogo ao padrão de api_tvde_catalogo.test.sql.
-- Datas relativas a now(): nunca dependem do dia da semana.
-- NIFs e IBAN de teste com checksum válido (nif_pt_valido / iban_valido).
-- ============================================================
begin;
select plan(43);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000e2d01ff', 'bootstrap@tvdecand.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000e2d0a00', 'Org Cand A', 'tvdecand-a'),
  ('00000000-0000-0000-0000-00000e2d0b00', 'Org Cand B', 'tvdecand-b');
insert into public.org_definicoes (org_id, iva_rent_a_car, iva_tvde) values ('00000000-0000-0000-0000-00000e2d0a00', 23, 6)
  on conflict (org_id) do update set iva_rent_a_car = 23, iva_tvde = 6;

-- Catálogo TVDE da org A: d01 Corolla publicável, d02 Proace comercial (não publicável).
insert into public.viatura_tipos (id, org_id, nome, elegivel_tvde) values
  ('00000000-0000-0000-0000-00000e2d0701', '00000000-0000-0000-0000-00000e2d0a00', 'PASSAGEIROS', true),
  ('00000000-0000-0000-0000-00000e2d0702', '00000000-0000-0000-0000-00000e2d0a00', 'COMERCIAL', false);
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e2d0aa1', '00000000-0000-0000-0000-00000e2d0a00', 'Toyota');
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-00000e2d0d01', '00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0aa1', 'Corolla', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-00000e2d0d02', '00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0aa1', 'Proace', 'manual', 3, 4, 10);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-00000e2d0101', '00000000-0000-0000-0000-00000e2d0a00', 'Berlina', 'BER', true);
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, tipo_id, is_slot) values
  ('00000000-0000-0000-0000-00000e2d0e01', '00000000-0000-0000-0000-00000e2d0a00', 'TC-01-AA', '00000000-0000-0000-0000-00000e2d0aa1', '00000000-0000-0000-0000-00000e2d0d01', '00000000-0000-0000-0000-00000e2d0101', '00000000-0000-0000-0000-00000e2d0701', false),
  ('00000000-0000-0000-0000-00000e2d0e02', '00000000-0000-0000-0000-00000e2d0a00', 'TC-02-AA', '00000000-0000-0000-0000-00000e2d0aa1', '00000000-0000-0000-0000-00000e2d0d02', '00000000-0000-0000-0000-00000e2d0101', '00000000-0000-0000-0000-00000e2d0702', false);
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000e2d0f02', '00000000-0000-0000-0000-00000e2d0a00', 'TVDE Site', 'tvde', true, true);
insert into public.renting_tarifa_precos_modelo
  (org_id, tarifa_id, modelo_id, preco_semana, caucao_valor, franquia_valor, km_mensal, km_adicional_valor) values
  ('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0f02', '00000000-0000-0000-0000-00000e2d0d01', 250.00, 500, 1000, 6000, 0.10),
  ('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0f02', '00000000-0000-0000-0000-00000e2d0d02', 300.00, 500, 1000, 6000, 0.10);

-- Chaves do site, uma por org.
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-00000e2d0901', '00000000-0000-0000-0000-00000e2d0a00', 'Site A', 'rent_a_car', '{tvde:candidaturas:write,tvde:candidaturas:read}'),
  ('00000000-0000-0000-0000-00000e2d0902', '00000000-0000-0000-0000-00000e2d0b00', 'Site B', 'rent_a_car', '{tvde:candidaturas:write,tvde:candidaturas:read}');

-- Utilizadores: 201 admin da A; 202 admin da B; 203 da A sem cargo nem admin;
-- 204 motorista com conta (portal); 205 motorista da A com ficha e conta;
-- 206 da A com um cargo que vê motoristas_gestao mas não edita.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000e2d0201', 'admin-a@tvdecand.pt'),
  ('00000000-0000-0000-0000-00000e2d0202', 'admin-b@tvdecand.pt'),
  ('00000000-0000-0000-0000-00000e2d0203', 'semperm-a@tvdecand.pt'),
  ('00000000-0000-0000-0000-00000e2d0204', 'portal@tvdecand.pt'),
  ('00000000-0000-0000-0000-00000e2d0205', 'comconta@tvdecand.pt'),
  ('00000000-0000-0000-0000-00000e2d0206', 'sover-a@tvdecand.pt');
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-00000e2d0201', '00000000-0000-0000-0000-00000e2d0a00'),
  ('00000000-0000-0000-0000-00000e2d0202', '00000000-0000-0000-0000-00000e2d0b00'),
  ('00000000-0000-0000-0000-00000e2d0203', '00000000-0000-0000-0000-00000e2d0a00'),
  ('00000000-0000-0000-0000-00000e2d0206', '00000000-0000-0000-0000-00000e2d0a00');
-- O catálogo de recursos pode vir vazio no CI.
insert into public.recursos (nome, categoria) values ('motoristas_gestao', 'motoristas')
  on conflict (nome) do nothing;
insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-00000e2d0c71', 'So Ve Motoristas', '00000000-0000-0000-0000-00000e2d0a00');
insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-00000e2d0c71', r.id, '00000000-0000-0000-0000-00000e2d0a00', true, false
  from public.recursos r where r.nome = 'motoristas_gestao';
insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-00000e2d0201', '00000000-0000-0000-0000-00000e2d0a00', true, null),
  ('00000000-0000-0000-0000-00000e2d0202', '00000000-0000-0000-0000-00000e2d0b00', true, null),
  ('00000000-0000-0000-0000-00000e2d0203', '00000000-0000-0000-0000-00000e2d0a00', false, null),
  ('00000000-0000-0000-0000-00000e2d0206', '00000000-0000-0000-0000-00000e2d0a00', false, '00000000-0000-0000-0000-00000e2d0c71');

-- Ficha da org A com conta, NIF 501234560, IBAN X e email próprios, sem telefone
-- (Review Focus 1 e a sobreposição pelo site).
insert into public.motoristas_ativos (id, org_id, nome, nif, user_id, iban, email) values
  ('00000000-0000-0000-0000-00000e2d0c01', '00000000-0000-0000-0000-00000e2d0a00', 'Motorista Com Conta', '501234560',
   '00000000-0000-0000-0000-00000e2d0205', 'PT42003300000045678901234', 'comconta@tvdecand.pt');

-- Pedido válido, ao formato de CorpoCandidatura (Task 3).
create temp table ped as select jsonb_build_object(
  'referencia_externa', 'site-0001',
  'nome', 'Rui Candidato',
  'email', 'rui@candidato.pt',
  'telefone', '+351912345678',
  'nif', '234567899',
  'morada', 'Rua Direita 1',
  'codigo_postal', '2400-001',
  'cidade', 'Leiria',
  'documento', jsonb_build_object('tipo', 'cc', 'numero', '12345678', 'validade', (current_date + 365)::text),
  'carta_conducao', jsonb_build_object('numero', 'L-123456', 'categorias', jsonb_build_array('B'),
                                       'validade', (current_date + 365)::text),
  'licenca_tvde', jsonb_build_object('numero', 'TVDE-1', 'validade', (current_date + 365)::text),
  'em_formacao_tvde', false,
  'iban', 'PT50000201231234567890154',
  'modelo_pretendido_id', '00000000-0000-0000-0000-00000e2d0d01',
  'data_inicio_pretendida', (current_date + 10)::text,
  'observacoes', null,
  'consentimento', jsonb_build_object('versao', '2026-10', 'aceite_em', now())) as j;
grant select on ped to public;

-- ── 1) colunas e CHECK ──────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.motorista_candidaturas (org_id, user_id, origem, nome, email)
     values ('00000000-0000-0000-0000-00000e2d0a00', null, 'site', 'Directo Site', 'directo@tvdecand.pt') $$,
  'user_id aceita null quando origem = site');
select throws_ok(
  $$ insert into public.motorista_candidaturas (org_id, user_id, origem, nome, email)
     values ('00000000-0000-0000-0000-00000e2d0a00', null, 'portal', 'Portal Sem Conta', 'semconta@tvdecand.pt') $$,
  '23514', null, 'origem portal sem user_id é recusada pelo CHECK');

-- ── 2) criar ────────────────────────────────────────────────────────────────
create temp table r1 as select public.api_tvde_criar_candidatura(
  '00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901', (select j from ped)) as r;
grant select on r1 to public;

select ok((select r->>'estado' = 'submetido' and r->>'id' is not null and r->'repetida' is null from r1),
  'criar devolve estado submetido e um id');
select ok(exists (
  select 1 from public.motorista_candidaturas c, r1
   where c.id = (r1.r->>'id')::uuid
     and c.org_id = '00000000-0000-0000-0000-00000e2d0a00'
     and c.origem = 'site'
     and c.api_chave_id = '00000000-0000-0000-0000-00000e2d0901'
     and c.user_id is null
     and c.data_submissao is not null
     and c.carta_categorias = '{B}'
     and c.modelo_pretendido_id = '00000000-0000-0000-0000-00000e2d0d01'
     and c.consentimento_versao = '2026-10'
     and c.consentimento_em is not null),
  'a linha fica na org A, origem site, com chave, data de submissão e categorias');
select is((select count(*)::int from public.notificacoes n, r1
            where n.candidatura_id = (r1.r->>'id')::uuid and n.tipo = 'motorista_pendente'), 1,
  'o sino antigo "Novo motorista pendente" disparou');

-- ── 3) idempotência ─────────────────────────────────────────────────────────
create temp table r1b as select public.api_tvde_criar_candidatura(
  '00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901', (select j from ped)) as r;
select ok((select r1b.r->>'id' = r1.r->>'id' and (r1b.r->>'repetida')::boolean from r1, r1b),
  'repetir a mesma referência devolve o mesmo id com repetida = true');
select ok((select count(*) from public.motorista_candidaturas
            where referencia_externa = 'site-0001' and org_id = '00000000-0000-0000-0000-00000e2d0a00') = 1
          and (select count(*) from public.notificacoes n, r1
                where n.candidatura_id = (r1.r->>'id')::uuid) = 1,
  'continua a haver só uma linha e um sino');

-- ── 4) duplicados por pessoa ────────────────────────────────────────────────
select is(public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
            (select j || '{"referencia_externa": "site-0002", "email": "outro@candidato.pt"}'::jsonb from ped))->'erro'->>'codigo',
  'CANDIDATURA_EXISTENTE', 'outra referência com o mesmo NIF');
select is(public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
            (select j || '{"referencia_externa": "site-0002", "nif": "212121219", "email": "RUI@Candidato.PT"}'::jsonb from ped))->'erro'->>'codigo',
  'CANDIDATURA_EXISTENTE', 'outra referência com o mesmo email em maiúsculas');
-- Org B com a mesma referencia_externa: candidatura nova, nunca a da A.
create temp table rb as select public.api_tvde_criar_candidatura(
  '00000000-0000-0000-0000-00000e2d0b00', '00000000-0000-0000-0000-00000e2d0902', (select j - 'modelo_pretendido_id' from ped)) as r;
select is((select r->>'estado' from rb), 'submetido', 'a mesma pessoa na org B é aceite (o duplicado é por org)');
select isnt((select r->>'id' from rb), (select r->>'id' from r1),
  'a chave da org B, com a mesma referência, não devolve a candidatura da A');

-- ── 5) validação ────────────────────────────────────────────────────────────
select is(public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
            (select j || '{"referencia_externa": "site-0003", "nif": "123456780"}'::jsonb from ped))->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'NIF com checksum errado');
select is(public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
            (select j || '{"referencia_externa": "site-0003", "nif": "212121219", "email": "x@y.pt", "iban": "PT50000201231234567890155"}'::jsonb from ped))->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'IBAN com checksum errado');
select is(public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
            (select j - 'nif' || '{"referencia_externa": "site-0003"}'::jsonb from ped))->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'NIF em falta (nif_pt_valido é STRICT e devolveria null)');
select is(public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
            (select j || '{"referencia_externa": "site-0003", "nif": "212121219", "email": "x@y.pt", "modelo_pretendido_id": "00000000-0000-0000-0000-00000e2d0d02"}'::jsonb from ped))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'modelo pretendido não publicável');

-- ── 6) obter ────────────────────────────────────────────────────────────────
select is(public.api_tvde_obter_candidatura('00000000-0000-0000-0000-00000e2d0a00', (select (r->>'id')::uuid from r1))->>'estado',
  'submetido', 'obter na org A devolve o resumo com estado');
select is(public.api_tvde_obter_candidatura('00000000-0000-0000-0000-00000e2d0b00', (select (r->>'id')::uuid from r1))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'a org B não vê a candidatura da A');

insert into public.motorista_candidaturas (id, org_id, user_id, nome, email, nif, status) values
  ('00000000-0000-0000-0000-00000e2d0c51', '00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0204',
   'Portal Pessoa', 'portal@tvdecand.pt', '252525256', 'rascunho');
select is(public.api_tvde_obter_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0c51')->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'uma candidatura do portal não sai pela API');

-- ── 7) aprovar ──────────────────────────────────────────────────────────────
-- Candidaturas do site para os testes: c3 com o NIF da ficha com conta,
-- c4 em análise, c5 para as recusas.
create temp table cs as select
  (public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
     (select j || '{"referencia_externa": "site-0004", "nif": "501234560", "email": "c3@candidato.pt"}'::jsonb from ped))->>'id')::uuid as c3,
  (public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
     (select j || '{"referencia_externa": "site-0005", "nif": "287654320", "email": "c4@candidato.pt"}'::jsonb from ped))->>'id')::uuid as c4,
  (public.api_tvde_criar_candidatura('00000000-0000-0000-0000-00000e2d0a00', '00000000-0000-0000-0000-00000e2d0901',
     (select j || '{"referencia_externa": "site-0006", "nif": "198765436", "email": "c5@candidato.pt"}'::jsonb from ped))->>'id')::uuid as c5;
grant select on cs to public;
update public.motorista_candidaturas set status = 'em_analise' where id = (select c4 from cs);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000e2d0201","role":"authenticated"}', true);

select is(public.aprovar_candidatura_motorista((select (r->>'id')::uuid from r1))->>'accao', 'criado',
  'admin da A aprova a candidatura do site e cria a ficha');
select is(public.aprovar_candidatura_motorista((select c3 from cs))->>'accao', 'associado',
  'NIF de um motorista com conta: associa à ficha, sem excepção');
select is(public.aprovar_candidatura_motorista((select c4 from cs))->>'accao', 'criado',
  'uma candidatura em_analise também se aprova');

-- Admin da org B a aprovar uma candidatura da A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000e2d0202","role":"authenticated"}', true);
select throws_ok(
  $$ select public.aprovar_candidatura_motorista((select c5 from cs)) $$,
  'P0001', 'Candidatura não encontrada', 'utilizador de outra org não aprova');
select throws_ok(
  $$ select public.rejeitar_candidatura_motorista((select c5 from cs), 'teste') $$,
  'P0001', 'Candidatura não encontrada ou não está pendente', 'admin de outra org não rejeita');

-- Utilizador da A sem motoristas_gestao nem admin.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000e2d0203","role":"authenticated"}', true);
select throws_ok(
  $$ select public.aprovar_candidatura_motorista((select c5 from cs)) $$,
  'P0001', 'Sem permissão para aprovar candidaturas', 'utilizador sem permissão não aprova');
select throws_ok(
  $$ select public.rejeitar_candidatura_motorista((select c5 from cs), 'teste') $$,
  'P0001', 'Sem permissão para rejeitar candidaturas', 'utilizador sem permissão não rejeita');

-- Utilizador da A que vê motoristas_gestao mas não edita.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000e2d0206","role":"authenticated"}', true);
select throws_ok(
  $$ select public.aprovar_candidatura_motorista((select c5 from cs)) $$,
  'P0001', 'Sem permissão para aprovar candidaturas', 'só ver motoristas_gestao não chega para aprovar');
select throws_ok(
  $$ select public.rejeitar_candidatura_motorista((select c5 from cs), 'teste') $$,
  'P0001', 'Sem permissão para rejeitar candidaturas', 'só ver motoristas_gestao não chega para rejeitar');

-- Volta a postgres e sem sessão: com os claims ainda definidos, auth.uid() continuava
-- a ser o 203 e a validação de automation_rules exigia-lhe permissões na fixture.
reset role;
select set_config('request.jwt.claims', '', true);

select ok(exists (select 1 from public.motoristas_ativos
                   where nif = '234567899' and org_id = '00000000-0000-0000-0000-00000e2d0a00' and user_id is null),
  'a ficha criada fica na org da candidatura');
select is((select user_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-00000e2d0c01'),
  '00000000-0000-0000-0000-00000e2d0205'::uuid, 'a ficha associada mantém a conta');
select ok((select iban = 'PT42003300000045678901234' and email = 'comconta@tvdecand.pt' and telefone = '+351912345678'
             from public.motoristas_ativos where id = '00000000-0000-0000-0000-00000e2d0c01'),
  'a candidatura do site não troca o IBAN nem o email da ficha; só preenche o telefone vazio');
select is((select status from public.motorista_candidaturas where id = (select c5 from cs)), 'submetido',
  'depois das recusas a candidatura continua submetido');

-- ── 8) anonimizar ───────────────────────────────────────────────────────────
-- c5 rejeitada há 7 meses (sai); c6 do site rejeitada há 5 meses e a do portal
-- rejeitada há 7 meses (ficam).
update public.motorista_candidaturas set status = 'rejeitado', data_decisao = now() - interval '7 months',
       motivo_rejeicao = 'Sem carta'
 where id = (select c5 from cs);
insert into public.motorista_candidaturas (id, org_id, user_id, origem, nome, email, nif, status, data_decisao) values
  ('00000000-0000-0000-0000-00000e2d0c52', '00000000-0000-0000-0000-00000e2d0a00', null, 'site',
   'Cinco Meses', 'cinco@tvdecand.pt', '262626268', 'rejeitado', now() - interval '5 months');
update public.motorista_candidaturas set status = 'rejeitado', data_decisao = now() - interval '7 months'
 where id = '00000000-0000-0000-0000-00000e2d0c51';

-- O evento da candidatura parada, o run do motor que o copiou e o aviso dele.
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, payload, emitted_by) values
  ('00000000-0000-0000-0000-00000e2d0e51', '00000000-0000-0000-0000-00000e2d0a00', 'motorista.candidatura_parada',
   'motorista_candidaturas', (select c5 from cs),
   '{"nome": "Rui Candidato", "email": "c5@candidato.pt", "status": "submetido"}'::jsonb, 'cron');
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-00000e2d0f51', '00000000-0000-0000-0000-00000e2d0a00',
   'teste.anonimizar_parada', 'Teste anonimizar', 'teste.anonimizar_parada', 'automacao_interna',
   '{"accao":"motorista.atualizar_campo","campo":"observacoes","valor":"x"}'::jsonb);
insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id, payload) values
  ('00000000-0000-0000-0000-00000e2d0f52', '00000000-0000-0000-0000-00000e2d0f51', '00000000-0000-0000-0000-00000e2d0a00',
   'motorista_candidaturas', (select c5 from cs),
   '{"nome": "Rui Candidato", "email": "c5@candidato.pt", "status": "submetido"}'::jsonb);
insert into public.notificacoes (id, org_id, tipo, titulo, mensagem, severidade, link, rule_run_id) values
  ('00000000-0000-0000-0000-00000e2d0f53', '00000000-0000-0000-0000-00000e2d0a00', 'motorista_candidatura_parada',
   'Candidatura de Rui Candidato parada há mais de 3 dias', 'Candidato: Rui Candidato', 'normal',
   '/motoristas/candidaturas', '00000000-0000-0000-0000-00000e2d0f52');

create temp table an as select public.api_tvde_anonimizar_candidaturas() as n;

select is((select n from an), 1, 'anonimizar trata uma candidatura');
select ok(exists (
  select 1 from public.motorista_candidaturas c
   where c.id = (select c5 from cs)
     and c.nome = 'Candidatura anonimizada' and c.email = 'anonimizada@invalid'
     and c.nif is null and c.iban is null and c.telefone is null and c.morada is null
     and c.documento_numero is null and c.carta_conducao is null and c.licenca_tvde_numero is null
     and c.motivo_rejeicao is null and c.anonimizada_em is not null),
  'a rejeitada do site há 7 meses fica sem nome, NIF, email, IBAN e telefone');
select ok(exists (select 1 from public.notificacoes n where n.candidatura_id = (select c5 from cs))
          and not exists (
  select 1 from public.notificacoes n
   where n.candidatura_id = (select c5 from cs)
     and (n.mensagem like '%Rui%' or coalesce(n.itens::text, '') like '%Rui%')),
  'o sino "Novo motorista pendente" fica sem o nome, também em itens');
select ok((select not (payload ? 'nome') and not (payload ? 'email') and payload ? 'status'
             from public.domain_events where id = '00000000-0000-0000-0000-00000e2d0e51'),
  'o payload de motorista.candidatura_parada fica sem nome e email');
select ok((select not (payload ? 'nome') and not (payload ? 'email')
             from public.automation_runs where id = '00000000-0000-0000-0000-00000e2d0f52'),
  'o run do motor que copiou o payload também');
select ok((select titulo not like '%Rui%' and mensagem not like '%Rui%' and coalesce(itens::text, '') not like '%Rui%'
             from public.notificacoes where id = '00000000-0000-0000-0000-00000e2d0f53'),
  'o aviso "Candidatura de ... parada" fica sem o nome');
select ok((select anonimizada_em is null and nome = 'Cinco Meses'
             from public.motorista_candidaturas where id = '00000000-0000-0000-0000-00000e2d0c52')
          and (select anonimizada_em is null and nome = 'Portal Pessoa'
                 from public.motorista_candidaturas where id = '00000000-0000-0000-0000-00000e2d0c51'),
  'não toca na do site com 5 meses nem na do portal com 7');
select ok(exists (select 1 from cron.job where jobname = 'tvde_candidaturas_anonimizar' and schedule = '41 4 * * *'),
  'o cron diário da anonimização está agendado');

-- ── 9) privilégios ──────────────────────────────────────────────────────────
create temp table fns as select unnest(array[
  'public.api_tvde_candidatura_resumo(uuid,uuid)',
  'public.api_tvde_criar_candidatura(uuid,uuid,jsonb)',
  'public.api_tvde_obter_candidatura(uuid,uuid)',
  'public.api_tvde_anonimizar_candidaturas()']) as f;
select ok(bool_and(not has_function_privilege('anon', f, 'EXECUTE')
                   and not has_function_privilege('authenticated', f, 'EXECUTE')),
  'anon e authenticated não executam as funções api_tvde_* das candidaturas') from fns;
select ok(bool_and(has_function_privilege('service_role', f, 'EXECUTE')),
  'service_role executa as funções api_tvde_* das candidaturas') from fns;
select ok(not has_function_privilege('anon', 'public.aprovar_candidatura_motorista(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.aprovar_candidatura_motorista(uuid)', 'EXECUTE'),
  'aprovar continua do browser (authenticated) e fechado a anon');

-- ── 10) permissões novas na whitelist das chaves ────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000e2d0201","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.api_chaves_criar('Site TVDE', 'rent_a_car',
       array['tvde:catalogo:read', 'tvde:candidaturas:read', 'tvde:candidaturas:write'], null, null) $$,
  'api_chaves_criar aceita tvde:candidaturas:read e tvde:candidaturas:write');
reset role;

select * from finish();
rollback;
