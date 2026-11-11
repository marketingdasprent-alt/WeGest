-- ============================================================
-- Desativar a ficha fecha cartão, condutor e viatura e passa o login — pgTAP
-- ============================================================
-- Ver a migração 20261111120000.
--   (1) cartão de combustível fica com data de fim;
--   (2) condutor do contrato fica com data de fim;
--   (3) viatura fica encerrada;
--   (4) o login passa para a ficha ativa da mesma pessoa noutra empresa;
--   (5) frota parceira só no cliente Premium das outras empresas.
-- ============================================================

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003d00aa', 'motorista@ficha-inativa.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003d0001', 'Org Antiga', 'fi-antiga'),
  ('00000000-0000-0000-0000-0000003d0002', 'Org Nova', 'fi-nova');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000003d00aa', '00000000-0000-0000-0000-0000003d0001', false);
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000003d00aa', '00000000-0000-0000-0000-0000003d0001');

insert into public.motoristas_ativos (id, org_id, nome, nif, user_id, status_ativo) values
  ('00000000-0000-0000-0000-0000003d0b01', '00000000-0000-0000-0000-0000003d0001', 'Motorista', '123456789',
   '00000000-0000-0000-0000-0000003d00aa', true),
  ('00000000-0000-0000-0000-0000003d0b02', '00000000-0000-0000-0000-0000003d0002', 'Motorista', '123456789',
   null, true);

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000003d0a01', '00000000-0000-0000-0000-0000003d0001', 'Marca FI');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000003d0a02', '00000000-0000-0000-0000-0000003d0001', '00000000-0000-0000-0000-0000003d0a01', 'Modelo FI');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, marca, modelo) values
  ('00000000-0000-0000-0000-0000003d0c01', '00000000-0000-0000-0000-0000003d0001', 'ZZ-00-ZZ',
   '00000000-0000-0000-0000-0000003d0a01', '00000000-0000-0000-0000-0000003d0a02', 'Marca FI', 'Modelo FI');
insert into public.motorista_viaturas (motorista_id, viatura_id, data_inicio, status, org_id) values
  ('00000000-0000-0000-0000-0000003d0b01', '00000000-0000-0000-0000-0000003d0c01', current_date - 10, 'ativo',
   '00000000-0000-0000-0000-0000003d0001');

insert into public.cartoes_frota (id, org_id, tipo, numero, ativo) values
  ('00000000-0000-0000-0000-0000003d0d01', '00000000-0000-0000-0000-0000003d0001', 'bp', '9990001', true);
insert into public.cartao_atribuicoes (org_id, cartao_id, motorista_id, de) values
  ('00000000-0000-0000-0000-0000003d0001', '00000000-0000-0000-0000-0000003d0d01',
   '00000000-0000-0000-0000-0000003d0b01', current_date - 10);

insert into public.clientes (id, org_id, nome, tipo_cliente) values
  ('00000000-0000-0000-0000-0000003d0e01', '00000000-0000-0000-0000-0000003d0001', 'Cliente Teste', 'empresa');
insert into public.reservas (id, org_id, viatura_id, data_inicio, data_fim, cliente_id) values
  ('00000000-0000-0000-0000-0000003d0f00', '00000000-0000-0000-0000-0000003d0001', '00000000-0000-0000-0000-0000003d0c01',
   now() - interval '10 days', now() + interval '20 days', '00000000-0000-0000-0000-0000003d0e01');
insert into public.contratos_renting (id, org_id, reserva_id, cliente_id, viatura_id, data_inicio, data_fim, created_by) values
  ('00000000-0000-0000-0000-0000003d0f01', '00000000-0000-0000-0000-0000003d0001', '00000000-0000-0000-0000-0000003d0f00',
   '00000000-0000-0000-0000-0000003d0e01', '00000000-0000-0000-0000-0000003d0c01', now() - interval '10 days', now() + interval '20 days',
   '00000000-0000-0000-0000-0000003d00aa');
insert into public.contrato_condutores (org_id, contrato_id, motorista_id, is_principal, data_inicio) values
  ('00000000-0000-0000-0000-0000003d0001', '00000000-0000-0000-0000-0000003d0f01',
   '00000000-0000-0000-0000-0000003d0b01', true, now() - interval '10 days');

update public.motoristas_ativos set status_ativo = false where id = '00000000-0000-0000-0000-0000003d0b01';

select ok(
  (select ate is not null from public.cartao_atribuicoes where motorista_id = '00000000-0000-0000-0000-0000003d0b01'),
  'cartão de combustível fecha (1)'
);
select ok(
  (select data_fim is not null from public.contrato_condutores where motorista_id = '00000000-0000-0000-0000-0000003d0b01'),
  'condutor do contrato fecha (2)'
);
select is(
  (select status from public.motorista_viaturas where motorista_id = '00000000-0000-0000-0000-0000003d0b01'),
  'encerrado',
  'viatura fica encerrada (3)'
);
select is(
  (select user_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000003d0b02'),
  '00000000-0000-0000-0000-0000003d00aa'::uuid,
  'o login passa para a ficha ativa noutra empresa (4)'
);
select is(
  (select org_id from public.user_org_ativa where user_id = '00000000-0000-0000-0000-0000003d00aa'),
  '00000000-0000-0000-0000-0000003d0002'::uuid,
  'a app passa a abrir na empresa da ficha ativa (4)'
);

-- (5) frota parceira
select has_column('public', 'clientes', 'frota_parceira', 'clientes tem frota_parceira (5)');
select ok(
  not exists (
    select 1 from public.clientes c join public.organizacoes o on o.id = c.org_id
     where c.frota_parceira and o.nome ilike 'premium ride%'
  ),
  'o cliente Premium da própria Premium não é frota parceira (5)'
);

select * from finish();
rollback;
