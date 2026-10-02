-- ============================================================
-- Reservas da API externa (Fase C): criar, consultar, cancelar
-- ============================================================
-- Fixture copiada de api_disponibilidade.test.sql (do auth.users à temp table p).
-- ============================================================
begin;
select plan(40);

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

-- Clio (d0d01): duas livres no período (e01, e06). Cotação de referência = 234,93 com IVA.

insert into public.clientes (id, org_id, nome, tipo_cliente, is_emissora) values
  ('00000000-0000-0000-0000-0000000d0910', '00000000-0000-0000-0000-0000000d0a00', 'Emissora RAC', 'empresa', true);
insert into public.clientes (id, org_id, nome, nif, email) values
  ('00000000-0000-0000-0000-0000000d0911', '00000000-0000-0000-0000-0000000d0a00', 'Ana Antiga', '123456789', 'ana@antiga.pt'),
  ('00000000-0000-0000-0000-0000000d0912', '00000000-0000-0000-0000-0000000d0a00', 'Bruno Antigo', null, 'Bruno@Exemplo.pt');
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-0000000d0901', '00000000-0000-0000-0000-0000000d0a00', 'Site', 'rent_a_car', '{reservas:write,reservas:read}'),
  ('00000000-0000-0000-0000-0000000d0902', '00000000-0000-0000-0000-0000000d0a00', 'Site 2', 'rent_a_car', '{reservas:write}');

create temp table q as select jsonb_build_object(
  'modelo_id', '00000000-0000-0000-0000-0000000d0d01',
  'inicio', (select inicio from p), 'fim', (select fim from p),
  'entrega', '00000000-0000-0000-0000-0000000d0301', 'recolha', '00000000-0000-0000-0000-0000000d0302',
  'extras', '[{"extra_id":"00000000-0000-0000-0000-0000000d0401","quantidade":2},{"extra_id":"00000000-0000-0000-0000-0000000d0402","quantidade":1}]'::jsonb,
  'cobertura_id', '00000000-0000-0000-0000-0000000d0501',
  'cliente', jsonb_build_object('nome', 'Carla Nova', 'email', 'carla@novo.pt', 'telefone', '+351912345678',
                                'data_nascimento', '1990-05-01', 'pais', 'Portugal'),
  'carta_conducao', jsonb_build_object('numero', 'L-123', 'validade', '2030-01-01', 'pais', 'Portugal'),
  'total_esperado', 234.93,
  'referencia_externa', 'site-001',
  'mensagem', 'Chego no voo TP123') as pedido;
grant select on q to public;
create temp table res (nome text primary key, r jsonb);
grant select, insert on res to public;

-- Sem emissora configurada
select is((public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0901',
  (select pedido from q)))->'erro'->>'codigo', 'CONFIG_EM_FALTA', 'sem emissora rent-a-car → CONFIG_EM_FALTA');
select is((select count(*)::int from public.reservas where origem = 'site'), 0, 'nada gravado sem emissora');

update public.org_definicoes set emissor_rent_a_car_id = '00000000-0000-0000-0000-0000000d0910'
 where org_id = '00000000-0000-0000-0000-0000000d0a00';

-- Criar
insert into res select 'r1', public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00',
  '00000000-0000-0000-0000-0000000d0901', (select pedido from q));
create temp view r1 as select * from public.reservas where id = ((select r from res where nome = 'r1')->>'id')::uuid;
grant select on r1 to public;

select is((select r->>'estado' from res where nome = 'r1'), 'pendente', 'entra como pendente');
select is((select r->'total'->>'com_iva' from res where nome = 'r1'), '234.93', 'total com IVA = cotação');
select ok((select viatura_id is null and modelo_id = '00000000-0000-0000-0000-0000000d0d01' and origem = 'site'
            and api_chave_id = '00000000-0000-0000-0000-0000000d0901' and regime = 'rent_a_car'
            and emissor_id = '00000000-0000-0000-0000-0000000d0910' and grupo_id = '00000000-0000-0000-0000-0000000d0101'
           from r1), 'sem viatura, com modelo, origem site, chave, emissora e grupo');
select ok((select valor_total = 105.00 and valor_total_manual = 105.00 from r1),
  'valor_total é só o aluguer sem IVA, congelado em valor_total_manual');
select ok((select cobertura_nome = 'Premium' and cobertura_preco_dia = 12 and franquia_valor = 0 from r1),
  'cobertura congelada e franquia da cobertura');
select is((select sum(total) from public.reserva_extras where reserva_id = (select id from r1)), 50.00::numeric,
  'extras congelados: cadeira 2×5×3 + limpeza 20');
select is((select count(*)::int from public.reserva_coberturas where reserva_id = (select id from r1) and preco_dia = 12), 1,
  'reserva_coberturas com o preço do dia');
select ok(exists (select 1 from public.reserva_condutores rc join r1 on rc.reserva_id = r1.id
                   where rc.is_principal and rc.cliente_id = r1.cliente_id), 'o cliente é o condutor principal');
select is((select count(*)::int from public.clientes where org_id = '00000000-0000-0000-0000-0000000d0a00'
            and email = 'carla@novo.pt' and tipo_cliente = 'particular'), 1, 'cliente novo criado como particular');
select is((select dados_site->'carta_conducao'->>'numero' from r1), 'L-123', 'carta de condução em dados_site');
select is((select count(*)::int from public.domain_events where event_type = 'reserva.site_recebida'
            and entity_id = (select id from r1) and org_id = '00000000-0000-0000-0000-0000000d0a00'), 1, 'um evento para o sino');
select is(public.api_quantidade_disponivel('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p)), 1, 'a reserva tira uma Clio');

-- Idempotência
insert into res select 'r1bis', public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00',
  '00000000-0000-0000-0000-0000000d0901', (select pedido from q));
select ok((select (b.r->>'id') = (a.r->>'id') and (b.r->>'repetida') = 'true' from res a, res b
            where a.nome = 'r1' and b.nome = 'r1bis'), 'mesma referência → a mesma reserva, marcada repetida');
select is((select count(*)::int from public.reservas where referencia_externa = 'site-001'
            and api_chave_id = '00000000-0000-0000-0000-0000000d0901'), 1, 'não criou segunda reserva');
select is((select count(*)::int from public.domain_events where event_type = 'reserva.site_recebida'
            and entity_id = (select id from r1)), 1, 'não criou segundo evento');

-- A mesma referência noutra chave é outra reserva: esgota a Clio
insert into res select 'r2', public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00',
  '00000000-0000-0000-0000-0000000d0902', (select pedido from q));
select isnt((select r->>'id' from res where nome = 'r2'), (select r->>'id' from res where nome = 'r1'),
  'outra chave, a mesma referência → reserva nova');
select is((public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0901',
  (select pedido || '{"referencia_externa":"site-009"}'::jsonb from q)))->'erro'->>'codigo', 'SEM_DISPONIBILIDADE',
  'Clio esgotada → SEM_DISPONIBILIDADE');

-- Cancelar (liberta) e cancelar de novo (idempotente)
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-0000000d0a00',
  ((select r from res where nome = 'r2')->>'codigo')::bigint))->>'estado', 'cancelada', 'pendente → cancelada');
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-0000000d0a00',
  ((select r from res where nome = 'r2')->>'codigo')::bigint))->>'estado', 'cancelada', 'cancelar outra vez devolve cancelada');

-- Preço alterado
create temp table pa as select public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00',
  '00000000-0000-0000-0000-0000000d0901',
  (select pedido || '{"referencia_externa":"site-002","total_esperado":200}'::jsonb from q)) as r;
grant select on pa to public;
select is((select r->'erro'->>'codigo' from pa), 'PRECO_ALTERADO', 'total_esperado diferente → PRECO_ALTERADO');
select is((select r->'erro'->'detalhes'->'subtotal'->>'com_iva' from pa), '234.93', 'traz a cotação nova em detalhes');
select is((select count(*)::int from public.reservas where referencia_externa = 'site-002'), 0, 'nada gravado');

-- Cliente existente por NIF: não é alterado
insert into res select 'r3', public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00',
  '00000000-0000-0000-0000-0000000d0901',
  (select jsonb_set(pedido || '{"referencia_externa":"site-003"}'::jsonb, '{cliente}',
     '{"nome":"Ana Nova","email":"outra@x.pt","telefone":"912345678","nif":"123456789","data_nascimento":"1985-01-01","pais":"Portugal"}') from q));
select is((select cliente_id from public.reservas where id = ((select r from res where nome = 'r3')->>'id')::uuid),
  '00000000-0000-0000-0000-0000000d0911'::uuid, 'encontrado por NIF');
select is((select nome::text from public.clientes where id = '00000000-0000-0000-0000-0000000d0911'), 'Ana Antiga',
  'cliente existente não é alterado');
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-0000000d0a00',
  ((select r from res where nome = 'r3')->>'codigo')::bigint))->>'estado', 'cancelada', 'r3 cancelada (liberta a Clio)');

-- Cliente existente por email, sem diferenciar maiúsculas
insert into res select 'r4', public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00',
  '00000000-0000-0000-0000-0000000d0901',
  (select jsonb_set(pedido || '{"referencia_externa":"site-004"}'::jsonb, '{cliente}',
     '{"nome":"Bruno","email":"bruno@exemplo.pt","telefone":"912345678","data_nascimento":"1980-01-01","pais":"Portugal"}') from q));
select is((select cliente_id from public.reservas where id = ((select r from res where nome = 'r4')->>'id')::uuid),
  '00000000-0000-0000-0000-0000000d0912'::uuid, 'encontrado por email, maiúsculas à parte');
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-0000000d0a00',
  ((select r from res where nome = 'r4')->>'codigo')::bigint))->>'estado', 'cancelada', 'r4 cancelada (liberta a Clio)');

-- NIF que não é português
select is((public.api_criar_reserva('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0901',
  (select jsonb_set(pedido || '{"referencia_externa":"site-005"}'::jsonb, '{cliente}',
     '{"nome":"Mau","email":"nif@mau.pt","telefone":"912345678","nif":"123456780","data_nascimento":"1980-01-01","pais":"Portugal"}') from q)))
  ->'erro'->>'codigo', 'PARAMETRO_INVALIDO', 'NIF inválido → 400, nunca 500');
select is((select count(*)::int from public.clientes where email = 'nif@mau.pt'), 0, 'nenhum cliente criado');

-- Consultar
select is((public.api_obter_reserva('00000000-0000-0000-0000-0000000d0a00',
  ((select r from res where nome = 'r1')->>'codigo')::bigint))->>'id', (select r->>'id' from res where nome = 'r1'),
  'GET devolve a reserva');
select is((public.api_obter_reserva('00000000-0000-0000-0000-0000000d0b00',
  ((select r from res where nome = 'r1')->>'codigo')::bigint))->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'outra organização não vê a reserva');
insert into public.reservas (org_id, codigo, data_inicio, data_fim)
values ('00000000-0000-0000-0000-0000000d0a00', 900001, now() + interval '30 days', now() + interval '31 days');
select is((public.api_obter_reserva('00000000-0000-0000-0000-0000000d0a00', 900001))->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'reserva do balcão não se vê pela API');
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-0000000d0a00', 900001))->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'nem se cancela pela API');

-- Cancelar depois de confirmada
update public.reservas set estado = 'confirmada' where id = (select id from r1);
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-0000000d0a00',
  ((select r from res where nome = 'r1')->>'codigo')::bigint))->'erro'->>'codigo', 'ESTADO_INVALIDO',
  'confirmada não se cancela pela API');
select is((public.api_cancelar_reserva('00000000-0000-0000-0000-0000000d0a00', 999999))->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'código inexistente');

-- Permissões
select ok(not has_function_privilege('anon', 'public.api_criar_reserva(uuid,uuid,jsonb)', 'execute'), 'anon não cria');
select ok(not has_function_privilege('authenticated', 'public.api_criar_reserva(uuid,uuid,jsonb)', 'execute'), 'authenticated não cria');
select ok(not has_function_privilege('authenticated', 'public.api_cancelar_reserva(uuid,bigint)', 'execute'), 'authenticated não cancela');

select * from finish();
rollback;
