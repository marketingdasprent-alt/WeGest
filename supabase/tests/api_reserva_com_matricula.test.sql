-- ============================================================
-- Reserva do site entra já com matrícula (20261015190000)
-- ============================================================
-- api_escolher_viatura escolhe a viatura do modelo com menos tempo parado à
-- volta do período (desempate pela matrícula); api_criar_reserva grava-a; a
-- reserva do site pendente marca a viatura como reservada e passa a valer a
-- protecção por matrícula (EXCLUDE das reservas, contrato por cima).
-- Fixture ao padrão de api_reservas.test.sql; datas relativas a now().
-- ============================================================
begin;
select plan(25);

-- Bootstrap antes da organização: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000a7c01ff', 'bootstrap@matricula.pt'),
  ('00000000-0000-0000-0000-00000a7c02ff', 'gestor@matricula.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000a7c0a00', 'Org Matricula A', 'matric-a');
insert into public.org_definicoes (org_id, iva_rent_a_car) values ('00000000-0000-0000-0000-00000a7c0a00', 23)
  on conflict (org_id) do update set iva_rent_a_car = 23;

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000a7c0aa1', '00000000-0000-0000-0000-00000a7c0a00', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-00000a7c0d01', '00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0aa1', 'Clio', 'manual', 5, 5, 2),
  ('00000000-0000-0000-0000-00000a7c0d02', '00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0aa1', 'Captur', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-00000a7c0d03', '00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0aa1', 'Megane', 'manual', 5, 5, 3);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-00000a7c0101', '00000000-0000-0000-0000-00000a7c0a00', 'Citadino', 'CIT', true);
-- Clio: e01 e e02 livres; a e02 tem a matrícula menor mas o id maior (o desempate é pela matrícula).
-- Captur: e03 com reserva do balcão a acabar 1 dia antes; e04 livre com matrícula menor.
-- Megane: e05 só para o estado com uma reserva do site já terminada.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, is_slot, status) values
  ('00000000-0000-0000-0000-00000a7c0e01', '00000000-0000-0000-0000-00000a7c0a00', 'MT-20-BB', '00000000-0000-0000-0000-00000a7c0aa1', '00000000-0000-0000-0000-00000a7c0d01', '00000000-0000-0000-0000-00000a7c0101', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000a7c0e02', '00000000-0000-0000-0000-00000a7c0a00', 'MT-10-BB', '00000000-0000-0000-0000-00000a7c0aa1', '00000000-0000-0000-0000-00000a7c0d01', '00000000-0000-0000-0000-00000a7c0101', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000a7c0e03', '00000000-0000-0000-0000-00000a7c0a00', 'MT-90-CC', '00000000-0000-0000-0000-00000a7c0aa1', '00000000-0000-0000-0000-00000a7c0d02', '00000000-0000-0000-0000-00000a7c0101', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000a7c0e04', '00000000-0000-0000-0000-00000a7c0a00', 'MT-50-CC', '00000000-0000-0000-0000-00000a7c0aa1', '00000000-0000-0000-0000-00000a7c0d02', '00000000-0000-0000-0000-00000a7c0101', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000a7c0e05', '00000000-0000-0000-0000-00000a7c0a00', 'MT-70-DD', '00000000-0000-0000-0000-00000a7c0aa1', '00000000-0000-0000-0000-00000a7c0d03', '00000000-0000-0000-0000-00000a7c0101', false, 'disponivel');

-- Tarifa do site sem validade: só a regra dos 15 dias limita.
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000a7c0f01', '00000000-0000-0000-0000-00000a7c0a00', 'Geral', 'renting', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, franquia_valor, caucao_valor, km_mensal, km_adicional_valor) values
  ('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0f01', '00000000-0000-0000-0000-00000a7c0d01', 35.00, 800, 300, 3000, 0.20),
  ('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0f01', '00000000-0000-0000-0000-00000a7c0d02', 50.00, 1000, 400, 3000, 0.25);
insert into public.estacoes (id, org_id, nome, cidade, ativa) values
  ('00000000-0000-0000-0000-00000a7c0301', '00000000-0000-0000-0000-00000a7c0a00', 'Leiria', 'Leiria', true);
insert into public.clientes (id, org_id, nome, tipo_cliente, is_emissora) values
  ('00000000-0000-0000-0000-00000a7c0910', '00000000-0000-0000-0000-00000a7c0a00', 'Emissora RAC', 'empresa', true);
insert into public.clientes (id, org_id, nome, email) values
  ('00000000-0000-0000-0000-00000a7c0911', '00000000-0000-0000-0000-00000a7c0a00', 'Cliente Balcao', 'balcao@matricula.pt');
update public.org_definicoes set emissor_rent_a_car_id = '00000000-0000-0000-0000-00000a7c0910'
 where org_id = '00000000-0000-0000-0000-00000a7c0a00';
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-00000a7c0901', '00000000-0000-0000-0000-00000a7c0a00', 'Site', 'rent_a_car', '{reservas:write}');

-- Período: 3 dias a começar daqui a 5 dias, às 10h de Lisboa.
create temp table p as select
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '5 days 10 hours') at time zone 'Europe/Lisbon') as inicio,
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '8 days 10 hours') at time zone 'Europe/Lisbon') as fim;
grant select on p to public;

-- Reserva do balcão que vai dar origem ao contrato da prova (5); sem viatura, não ocupa nada.
insert into public.reservas (id, org_id, estado, data_inicio, data_fim, cliente_id, created_by) values
  ('00000000-0000-0000-0000-00000a7c0b02', '00000000-0000-0000-0000-00000a7c0a00', 'confirmada',
   (select inicio from p), (select fim from p),
   '00000000-0000-0000-0000-00000a7c0911', '00000000-0000-0000-0000-00000a7c02ff');

-- Totais da cotação calculados antes de haver reservas do site.
create temp table tot as select m.id as modelo_id,
  (public.api_cotacao('00000000-0000-0000-0000-00000a7c0a00', m.id, (select inicio from p), (select fim from p),
     '00000000-0000-0000-0000-00000a7c0301', '00000000-0000-0000-0000-00000a7c0301', '[]'::jsonb)->'subtotal'->>'com_iva')::numeric as total
  from public.viatura_modelos m
 where m.id in ('00000000-0000-0000-0000-00000a7c0d01', '00000000-0000-0000-0000-00000a7c0d02');
grant select on tot to public;

create temp table q as select jsonb_build_object(
  'inicio', (select inicio from p), 'fim', (select fim from p),
  'entrega', '00000000-0000-0000-0000-00000a7c0301', 'recolha', '00000000-0000-0000-0000-00000a7c0301',
  'extras', '[]'::jsonb,
  'cliente', jsonb_build_object('nome', 'Rita Site', 'email', 'rita@matricula.pt', 'telefone', '+351912345678',
                                'data_nascimento', '1990-05-01', 'pais', 'Portugal'),
  'carta_conducao', jsonb_build_object('numero', 'L-777', 'validade', '2030-01-01', 'pais', 'Portugal')) as pedido;
grant select on q to public;
create temp table res (nome text primary key, r jsonb);
grant select, insert on res to public;
create temp view rid as select nome, (r->>'id')::uuid as id, (r->>'codigo')::bigint as codigo from res;
grant select on rid to public;

select is((select total from tot where modelo_id = '00000000-0000-0000-0000-00000a7c0d01'), 105.00::numeric,
  'fixture: cotação do Clio = 3 dias x 35');

-- ── 1. Escolha da viatura ───────────────────────────────────────────────────
select is(public.api_escolher_viatura('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0d01',
  (select inicio from p), (select fim from p)), '00000000-0000-0000-0000-00000a7c0e02'::uuid,
  'ambas livres: desempate pela matrícula (MT-10-BB antes de MT-20-BB)');

insert into public.reservas (id, org_id, viatura_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-00000a7c0b01', '00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0e03',
   now() + interval '1 day', (select inicio from p) - interval '1 day');
select is((select status from public.viaturas where id = '00000000-0000-0000-0000-00000a7c0e03'), 'disponivel',
  'reserva do balcão pendente (origem app) não muda o estado da viatura');

select is(public.api_escolher_viatura('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0d02',
  (select inicio from p), (select fim from p)), '00000000-0000-0000-0000-00000a7c0e03'::uuid,
  'escolhe a que encaixa: a reserva do balcão acaba 1 dia antes, ganha à livre de matrícula menor');

-- ── 2. api_criar_reserva grava a viatura ────────────────────────────────────
insert into res select 'r1', public.api_criar_reserva('00000000-0000-0000-0000-00000a7c0a00',
  '00000000-0000-0000-0000-00000a7c0901',
  (select pedido || jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000a7c0d01', 'referencia_externa', 'mat-001',
     'total_esperado', (select total from tot where modelo_id = '00000000-0000-0000-0000-00000a7c0d01')) from q));

select ok((select r.viatura_id = '00000000-0000-0000-0000-00000a7c0e02' and v.modelo_id = r.modelo_id
                  and r.modelo_id = '00000000-0000-0000-0000-00000a7c0d01' and r.origem = 'site' and r.estado = 'pendente'
             from public.reservas r join public.viaturas v on v.id = r.viatura_id
            where r.id = (select id from rid where nome = 'r1')),
  'reserva do site pendente grava a viatura escolhida, do modelo pedido');
-- A listagem de reservas lê reservas.matricula (não faz join a viaturas).
select is((select matricula::text from public.reservas where id = (select id from rid where nome = 'r1')), 'MT-10-BB',
  'reservas.matricula preenchida para a listagem');
select is((select status from public.viaturas where id = '00000000-0000-0000-0000-00000a7c0e02'), 'reservada',
  'reserva do site pendente marca a viatura como reservada');
select is((select status from public.viaturas where id = '00000000-0000-0000-0000-00000a7c0e01'), 'disponivel',
  'a outra Clio fica disponível');
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0d01',
  (select inicio from p), (select fim from p)), 1, 'conta uma vez: sai das livres pela matrícula');
select is((select coalesce(sum(n), 0)::int from public.api_procura_sem_viatura('00000000-0000-0000-0000-00000a7c0a00',
  (select inicio from p), (select fim from p)) where modelo_id = '00000000-0000-0000-0000-00000a7c0d01'), 0,
  'reserva do site com viatura já não entra na procura sem viatura');
select ok(exists (select 1 from public.domain_events where event_type = 'reserva.site_recebida'
                   and entity_id = (select id from rid where nome = 'r1')
                   and payload->>'mensagem' like '%Viatura proposta: MT-10-BB. Confirmar ou trocar.%'),
  'o sino diz a matrícula proposta');

-- ── 3. Sobreposta fica com a outra; esgotado não grava ──────────────────────
insert into res select 'r2', public.api_criar_reserva('00000000-0000-0000-0000-00000a7c0a00',
  '00000000-0000-0000-0000-00000a7c0901',
  (select pedido || jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000a7c0d01', 'referencia_externa', 'mat-002',
     'total_esperado', (select total from tot where modelo_id = '00000000-0000-0000-0000-00000a7c0d01')) from q));
select is((select viatura_id from public.reservas where id = (select id from rid where nome = 'r2')),
  '00000000-0000-0000-0000-00000a7c0e01'::uuid, 'segunda reserva sobreposta fica com a outra Clio');
select is(public.api_escolher_viatura('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0d01',
  (select inicio from p), (select fim from p)), null::uuid, 'Clio esgotada: api_escolher_viatura devolve null');
select is((public.api_criar_reserva('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0901',
  (select pedido || jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000a7c0d01', 'referencia_externa', 'mat-003',
     'total_esperado', (select total from tot where modelo_id = '00000000-0000-0000-0000-00000a7c0d01')) from q)))->'erro'->>'codigo',
  'SEM_DISPONIBILIDADE', 'terceira com o modelo esgotado → SEM_DISPONIBILIDADE');
select ok((select count(*) = 0 from public.reservas where referencia_externa = 'mat-003')
          and (select count(*) = 2 from public.reservas where org_id = '00000000-0000-0000-0000-00000a7c0a00'
                and origem = 'site' and modelo_id = '00000000-0000-0000-0000-00000a7c0d01'),
  'nada gravado com o modelo esgotado');

-- ── 4. A protecção por matrícula passa a valer ──────────────────────────────
select throws_ok(
  $$ insert into public.reservas (org_id, viatura_id, data_inicio, data_fim)
     values ('00000000-0000-0000-0000-00000a7c0a00', '00000000-0000-0000-0000-00000a7c0e01',
             (select inicio from p) + interval '1 day', (select fim from p) + interval '1 day') $$,
  '23P01', null, 'reserva do balcão sobreposta na matrícula do site é recusada (EXCLUDE)');
-- O contrato copia a viatura para a sua reserva e o EXCLUDE das reservas recusa-o.
select throws_ok(
  $$ insert into public.contratos_renting
       (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
        estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
     values
       ('00000000-0000-0000-0000-00000a7c0c01', '00000000-0000-0000-0000-00000a7c0a00',
        '00000000-0000-0000-0000-00000a7c0b02', '00000000-0000-0000-0000-00000a7c0911',
        '00000000-0000-0000-0000-00000a7c0e01', 'MT-20-BB', (select inicio from p), (select fim from p),
        'agendado', 'pendente', 'rent_a_car', 23, '00000000-0000-0000-0000-00000a7c02ff') $$,
  '23P01', null, 'contrato de outra reserva na matrícula do site é recusado');

-- Pelo site, a Captur que encaixa.
insert into res select 'r4', public.api_criar_reserva('00000000-0000-0000-0000-00000a7c0a00',
  '00000000-0000-0000-0000-00000a7c0901',
  (select pedido || jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000a7c0d02', 'referencia_externa', 'mat-004',
     'total_esperado', (select total from tot where modelo_id = '00000000-0000-0000-0000-00000a7c0d02')) from q));
select is((select viatura_id from public.reservas where id = (select id from rid where nome = 'r4')),
  '00000000-0000-0000-0000-00000a7c0e03'::uuid, 'pelo site, a Captur com a reserva do balcão a acabar antes');

-- ── 5. Cancelar devolve o carro ─────────────────────────────────────────────
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-00000a7c0a00', (select codigo from rid where nome = 'r1')))->>'estado',
  'cancelada', 'r1 cancelada pela API');
select is((select status from public.viaturas where id = '00000000-0000-0000-0000-00000a7c0e02'), 'disponivel',
  'cancelar a reserva do site devolve disponivel');

insert into public.reservas (org_id, origem, viatura_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-00000a7c0a00', 'site', '00000000-0000-0000-0000-00000a7c0e05',
   now() - interval '3 days', now() - interval '1 day');
select is((select status from public.viaturas where id = '00000000-0000-0000-0000-00000a7c0e05'), 'disponivel',
  'reserva do site pendente já terminada não marca a viatura');

-- ── 6. Privilégios ──────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.api_escolher_viatura(uuid,uuid,timestamptz,timestamptz)', 'execute'),
  'anon não executa api_escolher_viatura');
select ok(not has_function_privilege('authenticated', 'public.api_escolher_viatura(uuid,uuid,timestamptz,timestamptz)', 'execute'),
  'authenticated não executa api_escolher_viatura');
select ok(has_function_privilege('service_role', 'public.api_escolher_viatura(uuid,uuid,timestamptz,timestamptz)', 'execute'),
  'service_role executa api_escolher_viatura');
select ok(has_function_privilege('service_role', 'public.api_criar_reserva(uuid,uuid,jsonb)', 'execute'),
  'service_role executa api_criar_reserva');

select * from finish();
rollback;
