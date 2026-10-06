-- ============================================================
-- Reservas sem viatura contam contra o modelo (Fase C da API)
-- ============================================================
-- Uma reserva do site não tem viatura: viaturas_com_disponibilidade não a vê.
-- api_procura_sem_viatura desconta-a nas funções api_*; o balcão não muda.
-- Fixture copiada de api_disponibilidade.test.sql (do auth.users à temp table p).
-- ============================================================
begin;
select plan(18);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000d01ff', 'bootstrap@dispon.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000d0a00', 'Org Disp A', 'disp-a'),
  ('00000000-0000-0000-0000-0000000d0b00', 'Org Disp B', 'disp-b');
insert into public.org_definicoes (org_id, iva_rent_a_car) values ('00000000-0000-0000-0000-0000000d0a00', 23)
  on conflict (org_id) do update set iva_rent_a_car = 23;

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0a00', 'Renault'),
  ('00000000-0000-0000-0000-0000000d0ab1', '00000000-0000-0000-0000-0000000d0b00', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0aa1', 'Clio', 'manual', 5, 5, 2),
  ('00000000-0000-0000-0000-0000000d0d02', '00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0aa1', 'Captur', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-0000000d0db1', '00000000-0000-0000-0000-0000000d0b00', '00000000-0000-0000-0000-0000000d0ab1', 'Clio', 'manual', 5, 5, 2);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-0000000d0101', '00000000-0000-0000-0000-0000000d0a00', 'Citadino', 'CIT', true),
  ('00000000-0000-0000-0000-0000000d0102', '00000000-0000-0000-0000-0000000d0a00', 'SUV', 'SUV', true);
-- Clio: e01 livre, e02 em reparação no período, e03 slot (nunca conta). Captur: e04 em reparação.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, is_slot) values
  ('00000000-0000-0000-0000-0000000d0e01', '00000000-0000-0000-0000-0000000d0a00', 'DA-01-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', false),
  ('00000000-0000-0000-0000-0000000d0e02', '00000000-0000-0000-0000-0000000d0a00', 'DA-02-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', false),
  ('00000000-0000-0000-0000-0000000d0e03', '00000000-0000-0000-0000-0000000d0a00', 'DA-03-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', true),
  ('00000000-0000-0000-0000-0000000d0e04', '00000000-0000-0000-0000-0000000d0a00', 'DA-04-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d02', '00000000-0000-0000-0000-0000000d0102', false);
-- Clio que viaturas_com_disponibilidade dá como livres mas o site não pode vender (salvo e06):
-- e05 com motorista TVDE sem data_fim, e06 com atribuição terminada antes do período,
-- e07 inactiva, e08 vendida antes do início (is_vendida ainda false), e09 vendida
-- durante o período (now()+12 dias cai sempre entre o dia do início e o do fim).
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, is_slot, status, data_venda) values
  ('00000000-0000-0000-0000-0000000d0e09', '00000000-0000-0000-0000-0000000d0a00', 'DA-09-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', false, 'disponivel', (now() + interval '12 days')::date),
  ('00000000-0000-0000-0000-0000000d0e05', '00000000-0000-0000-0000-0000000d0a00', 'DA-05-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', false, 'em_uso', null),
  ('00000000-0000-0000-0000-0000000d0e06', '00000000-0000-0000-0000-0000000d0a00', 'DA-06-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', false, 'em_uso', null),
  ('00000000-0000-0000-0000-0000000d0e07', '00000000-0000-0000-0000-0000000d0a00', 'DA-07-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', false, 'inativo', null),
  ('00000000-0000-0000-0000-0000000d0e08', '00000000-0000-0000-0000-0000000d0a00', 'DA-08-AA', '00000000-0000-0000-0000-0000000d0aa1', '00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0101', false, 'disponivel', (now() + interval '5 days')::date);
-- Um motorista por atribuição: o trigger fecha_anteriores fecha a anterior do mesmo motorista.
insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0a00', 'Motorista TVDE Um'),
  ('00000000-0000-0000-0000-0000000d0c02', '00000000-0000-0000-0000-0000000d0a00', 'Motorista TVDE Dois');
insert into public.motorista_viaturas (org_id, motorista_id, viatura_id, data_inicio, data_fim, status) values
  ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e05', (now() - interval '30 days')::date, null, 'ativo'),
  ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0c02', '00000000-0000-0000-0000-0000000d0e06', (now() - interval '30 days')::date, (now() + interval '5 days')::date, 'ativo');
-- descricao é NOT NULL; org_id explícito (o default get_current_org_id() é null no teste).
insert into public.viatura_reparacoes (org_id, viatura_id, descricao, data_entrada, data_saida) values
  ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0e02', 'Embraiagem', (now() - interval '1 day')::date, (now() + interval '60 days')::date),
  ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0e04', 'Chapa', (now() - interval '1 day')::date, (now() + interval '60 days')::date);
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site, valido_de, valido_ate) values
  ('00000000-0000-0000-0000-0000000d0f01', '00000000-0000-0000-0000-0000000d0a00', 'Geral', 'renting', true, true,
   (now() - interval '1 year')::date, (now() + interval '45 days')::date);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, franquia_valor, caucao_valor, km_mensal, km_adicional_valor) values
  ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0f01', '00000000-0000-0000-0000-0000000d0d01', 35.00, 800, 300, 3000, 0.20),
  ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0f01', '00000000-0000-0000-0000-0000000d0d02', 50.00, 1000, 400, 3000, 0.25);
insert into public.estacoes (id, org_id, nome, cidade, ativa) values
  ('00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0a00', 'Leiria', 'Leiria', true),
  ('00000000-0000-0000-0000-0000000d0302', '00000000-0000-0000-0000-0000000d0a00', 'Porto', 'Porto', true),
  ('00000000-0000-0000-0000-0000000d0303', '00000000-0000-0000-0000-0000000d0a00', 'Fechada', 'Faro', false),
  ('00000000-0000-0000-0000-0000000d03b1', '00000000-0000-0000-0000-0000000d0b00', 'Leiria B', 'Leiria', true);
insert into public.renting_extras (id, org_id, nome, preco_unidade, tipo_calculo, quantidade_maxima, ativo) values
  ('00000000-0000-0000-0000-0000000d0401', '00000000-0000-0000-0000-0000000d0a00', 'Cadeira bebé', 5, 'dia', 2, true),
  ('00000000-0000-0000-0000-0000000d0402', '00000000-0000-0000-0000-0000000d0a00', 'Limpeza', 20, 'fixo', 1, true),
  ('00000000-0000-0000-0000-0000000d04b1', '00000000-0000-0000-0000-0000000d0b00', 'Extra B', 9, 'fixo', 1, true);
insert into public.renting_coberturas (id, org_id, nome, preco_dia, franquia_valor, ativa) values
  ('00000000-0000-0000-0000-0000000d0501', '00000000-0000-0000-0000-0000000d0a00', 'Premium', 12, 0, true),
  ('00000000-0000-0000-0000-0000000d05b1', '00000000-0000-0000-0000-0000000d0b00', 'Premium B', 10, 0, true);

-- Período de referência: 3 dias a começar daqui a 10 dias, às 10h de Lisboa.
create temp table p as select
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '10 days 10 hours') at time zone 'Europe/Lisbon') as inicio,
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '13 days 10 hours') at time zone 'Europe/Lisbon') as fim;
grant select on p to public;

-- Clio (d0d01) fica com duas livres no período: e01 e e06.

create temp table ids (nome text primary key, id uuid);
grant select, insert on ids to public;

select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 2, 'sem reservas do site: duas Clio livres');

with r as (
  insert into public.reservas (org_id, modelo_id, data_inicio, data_fim)
  values ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p))
  returning id)
insert into ids select 'r1', id from r;

select is((select origem from public.reservas where id = (select id from ids where nome = 'r1')), 'app',
  'origem por omissão é app');
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 1, 'uma reserva sem viatura tira uma Clio');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301'))->'modelos'->0->>'quantidade_disponivel', '1',
  'api_disponibilidade desconta a procura');

with r as (
  insert into public.reservas (org_id, modelo_id, data_inicio, data_fim)
  values ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p))
  returning id)
insert into ids select 'r2', id from r;

select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 0, 'duas reservas sem viatura esgotam a Clio');
select is(jsonb_array_length((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301'))->'modelos'), 0,
  'modelo esgotado sai da disponibilidade');
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p), '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301',
  '[]'::jsonb))->'erro'->>'codigo', 'SEM_DISPONIBILIDADE', 'a cotação também vê a procura');

update public.reservas set deleted_at = now() where id = (select id from ids where nome = 'r1');
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 1, 'reserva apagada deixa de contar');

update public.reservas set estado = 'cancelada' where id = (select id from ids where nome = 'r2');
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 2, 'reserva cancelada deixa de contar');

insert into public.reservas (org_id, modelo_id, data_inicio, data_fim)
values ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
        (select fim from p) + interval '1 day', (select fim from p) + interval '3 days');
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 2, 'reserva fora do período não conta');

-- A org B com o seu próprio Clio (apontar para o modelo da org A é recusado: ver trg_reservas_api_mesma_org abaixo).
insert into public.reservas (org_id, modelo_id, data_inicio, data_fim)
values ('00000000-0000-0000-0000-0000000d0b00', '00000000-0000-0000-0000-0000000d0db1', (select inicio from p), (select fim from p));
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 2, 'reserva de outra organização não conta');

-- A equipa atribui a e01: a reserva passa a ocupar a viatura e sai da procura (não conta duas vezes).
with r as (
  insert into public.reservas (org_id, modelo_id, data_inicio, data_fim)
  values ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p))
  returning id)
insert into ids select 'r3', id from r;
update public.reservas set viatura_id = '00000000-0000-0000-0000-0000000d0e01' where id = (select id from ids where nome = 'r3');
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 1, 'viatura atribuída: conta uma vez, não duas');

select throws_ok(
  $$ insert into public.reservas (org_id, origem, data_inicio, data_fim)
     values ('00000000-0000-0000-0000-0000000d0a00', 'telefone', now() + interval '1 day', now() + interval '2 days') $$,
  '23514', null, 'origem fora de app/site é recusada');

insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-0000000d0901', '00000000-0000-0000-0000-0000000d0a00', 'Site', 'rent_a_car', '{reservas:write}');
insert into public.reservas (org_id, origem, api_chave_id, referencia_externa, data_inicio, data_fim)
values ('00000000-0000-0000-0000-0000000d0a00', 'site', '00000000-0000-0000-0000-0000000d0901', 'ref-1',
        now() + interval '20 days', now() + interval '21 days');
select throws_ok(
  $$ insert into public.reservas (org_id, origem, api_chave_id, referencia_externa, data_inicio, data_fim)
     values ('00000000-0000-0000-0000-0000000d0a00', 'site', '00000000-0000-0000-0000-0000000d0901', 'ref-1',
             now() + interval '22 days', now() + interval '23 days') $$,
  '23505', null, 'a mesma referencia_externa na mesma chave é única');

-- Chave e modelo têm de ser da organização da reserva.
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-0000000d09b1', '00000000-0000-0000-0000-0000000d0b00', 'Site B', 'rent_a_car', '{reservas:write}');
select throws_ok(
  $$ insert into public.reservas (org_id, origem, api_chave_id, referencia_externa, data_inicio, data_fim)
     values ('00000000-0000-0000-0000-0000000d0a00', 'site', '00000000-0000-0000-0000-0000000d09b1', 'ref-b',
             now() + interval '24 days', now() + interval '25 days') $$,
  '23503', null, 'chave de outra organização é recusada');
select throws_ok(
  $$ insert into public.reservas (org_id, modelo_id, data_inicio, data_fim)
     values ('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0db1',
             now() + interval '24 days', now() + interval '25 days') $$,
  '23503', null, 'modelo de outra organização é recusado');

select ok(not has_function_privilege('anon', 'public.api_procura_sem_viatura(uuid,timestamptz,timestamptz)', 'execute'),
  'anon não executa api_procura_sem_viatura');
select ok(not has_function_privilege('authenticated', 'public.api_procura_sem_viatura(uuid,timestamptz,timestamptz)', 'execute'),
  'authenticated não executa api_procura_sem_viatura');

select * from finish();
rollback;
