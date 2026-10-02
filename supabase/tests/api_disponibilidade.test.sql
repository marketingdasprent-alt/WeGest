-- ============================================================
-- Disponibilidade e cotação da API externa (Fase B)
-- ============================================================
-- Regras: período no futuro, até 30 dias, dias no calendário de Lisboa;
-- livre = viaturas_com_disponibilidade; cotação = aluguer + cobertura + extras.
-- Datas relativas a now(): nunca dependem do dia da semana.
-- ============================================================
begin;
select plan(54);

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

-- api_dias
select is(public.api_dias(timestamptz '2026-11-02 10:00+00', timestamptz '2026-11-03 11:00+00'), 2, '25 h contam 2 dias');
select is(public.api_dias(timestamptz '2026-11-02 10:00+00', timestamptz '2026-11-02 12:00+00'), 1, 'menos de um dia conta 1');
select is(public.api_dias(timestamptz '2026-10-24 10:00+01', timestamptz '2026-10-27 10:00+00'), 3,
  'cruzar a mudança de hora (25-10-2026) não acrescenta um dia');

-- validações do período
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select fim from p), (select inicio from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301'))->'erro'->>'codigo', 'PERIODO_INVALIDO', 'fim antes do início');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', now() - interval '1 day', now() + interval '1 day',
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301'))->'erro'->>'codigo', 'PERIODO_INVALIDO', 'início no passado');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select inicio from p) + interval '31 days',
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301'))->'erro'->>'codigo', 'PERIODO_EXCEDE_MAXIMO', 'mais de 30 dias');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0303', '00000000-0000-0000-0000-0000000d0301'))->'erro'->>'codigo', 'NAO_ENCONTRADO', 'estação inactiva');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d03b1', '00000000-0000-0000-0000-0000000d0301'))->'erro'->>'codigo', 'NAO_ENCONTRADO', 'estação de outra organização');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0b00', (select inicio from p) , (select fim from p),
  '00000000-0000-0000-0000-0000000d03b1', '00000000-0000-0000-0000-0000000d03b1'))->'erro'->>'codigo', 'CONFIG_EM_FALTA', 'organização sem tarifa do site');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', now() + interval '50 days', now() + interval '52 days',
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301'))->'erro'->>'codigo', 'TARIFA_INDISPONIVEL', 'início fora da validade da tarifa');

-- disponibilidade
create temp table d as select public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0302') as r;
grant select on d to public;
select is((select r->'periodo'->>'dias' from d), '3', 'três dias');
select is((select jsonb_array_length(r->'modelos') from d), 1, 'só o Clio tem viatura livre (Captur em reparação)');
select is((select r->'modelos'->0->>'modelo' from d), 'Clio', 'o modelo livre é o Clio');
select is((select r->'modelos'->0->>'quantidade_disponivel' from d), '2',
  'duas livres (e01 e e06): reparação, slot, motorista activo, inactiva e vendida não contam');

-- api_viaturas_livres, caso a caso
create temp table l as select viatura_id from public.api_viaturas_livres('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select fim from p));
grant select on l to public;
select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-0000000d0e05'), 'motorista TVDE activo sem data_fim tira a viatura');
select ok(exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-0000000d0e06'), 'atribuição que acaba antes do período não tira a viatura');
select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-0000000d0e07'), 'viatura inactiva não conta');
select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-0000000d0e08'), 'viatura vendida antes do início não conta');
select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-0000000d0e09'), 'viatura vendida durante o período não conta');
select is((select r->'modelos'->0->'cotacao'->'aluguer'->>'sem_iva' from d), '105.00', '3 × 35,00');
select is((select r->'modelos'->0->'cotacao'->'aluguer'->>'com_iva' from d), '129.15', 'com IVA a 23%');
select is(jsonb_array_length(public.api_disponibilidade('00000000-0000-0000-0000-0000000d0a00', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0102')->'modelos'), 0, 'filtro por categoria');

-- cotação: aluguer 105 + cobertura 36 + cadeira 2×5×3 = 30 + limpeza 20 → 191,00; com IVA 234,93
create temp table c as select public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01',
  (select inicio from p), (select fim from p), '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0302',
  '[{"extra_id":"00000000-0000-0000-0000-0000000d0401","quantidade":2},{"extra_id":"00000000-0000-0000-0000-0000000d0402","quantidade":1}]'::jsonb,
  '00000000-0000-0000-0000-0000000d0501') as r;
grant select on c to public;
select is((select jsonb_array_length(r->'linhas') from c), 4, 'aluguer, cobertura e dois extras');
select is((select r->'subtotal'->>'sem_iva' from c), '191.00', 'subtotal sem IVA');
select is((select r->'subtotal'->>'com_iva' from c), '234.93', 'total com IVA');
select is((select r->'franquia'->>'sem_iva' from c), '0.00', 'a cobertura escolhida substitui a franquia do modelo');

-- erros da cotação
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301',
  '[{"extra_id":"00000000-0000-0000-0000-0000000d0401","quantidade":1},{"extra_id":"00000000-0000-0000-0000-0000000d0401","quantidade":1}]'::jsonb))->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'extra repetido');
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301',
  '[{"extra_id":"00000000-0000-0000-0000-0000000d0401","quantidade":3}]'::jsonb))->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'acima da quantidade máxima');
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d02', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301', '[]'::jsonb))->'erro'->>'codigo',
  'SEM_DISPONIBILIDADE', 'Captur sem viatura livre');
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301',
  (select jsonb_agg(jsonb_build_object('extra_id', '00000000-0000-0000-0000-0000000d0401', 'quantidade', 1)) from generate_series(1, 21))))->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'mais de 20 extras');

-- isolamento: nada da org B entra numa cotação da org A
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0db1', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301', '[]'::jsonb))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'modelo da org B');
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301',
  '[{"extra_id":"00000000-0000-0000-0000-0000000d04b1","quantidade":1}]'::jsonb))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'extra da org B');
select is((public.api_cotacao('00000000-0000-0000-0000-0000000d0a00', '00000000-0000-0000-0000-0000000d0d01', (select inicio from p), (select fim from p),
  '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0301', '[]'::jsonb,
  '00000000-0000-0000-0000-0000000d05b1'))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'cobertura da org B');

-- privilégios: só service_role executa (uma linha TAP por função)
create temp table fns as select unnest(array[
  'public.api_erro(text,text)',
  'public.api_dias(timestamptz,timestamptz)',
  'public.api_validar_periodo(uuid,timestamptz,timestamptz,uuid,uuid)',
  'public.api_viaturas_livres(uuid,timestamptz,timestamptz)',
  'public.api_quantidade_disponivel(uuid,uuid,timestamptz,timestamptz)',
  'public.api_disponibilidade(uuid,timestamptz,timestamptz,uuid,uuid,uuid,text)',
  'public.api_cotacao(uuid,uuid,timestamptz,timestamptz,uuid,uuid,jsonb,uuid)']) as f;
grant select on fns to public;
select ok(not has_function_privilege('anon', f, 'EXECUTE'), 'anon não executa ' || f) from fns;
select ok(not has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated não executa ' || f) from fns;
select ok(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role executa ' || f) from fns;

select * from finish();
rollback;
