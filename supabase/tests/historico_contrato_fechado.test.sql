-- ============================================================
-- Histórico do contrato: "Contrato fechado por" no estado 'fechado': pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261125120000.
--   (1) ir para 'fechado' grava o marco contrato_fechado com o autor;
--   (2) o resumo mostra o marco com o contrato em 'fechado' (antes ficava
--       "sem registo"), incluindo o caso #753: cancelado e depois fechado;
--   (3) cancelar um contrato já fechado continua a ser registado;
--   (4) uma alteração que não fecha não grava marco de fecho.
-- ============================================================

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003f00ff', 'bootstrap@hist-fechado.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003f0000', 'Org Histórico Fechado', 'hist-fechado');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003f0a01', 'gestor@hist-fechado.pt');
insert into public.profiles (id, nome) values
  ('00000000-0000-0000-0000-0000003f0a01', 'Gestor Fecho')
  on conflict (id) do update set nome = excluded.nome;
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000003f0a01', '00000000-0000-0000-0000-0000003f0000');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000003f0aa1', '00000000-0000-0000-0000-0000003f0000', 'Toyota');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000003f0ab1', '00000000-0000-0000-0000-0000003f0000',
   '00000000-0000-0000-0000-0000003f0aa1', 'Yaris');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select ('00000000-0000-0000-0000-0000003f0e0' || n)::uuid, '00000000-0000-0000-0000-0000003f0000',
       'HF-0' || n || '-AA', '00000000-0000-0000-0000-0000003f0aa1', '00000000-0000-0000-0000-0000003f0ab1'
  from generate_series(1, 4) as n;

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000003f0c01', '00000000-0000-0000-0000-0000003f0000', 'Cliente Histórico');

insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado)
select ('00000000-0000-0000-0000-0000003f0f0' || n)::uuid, '00000000-0000-0000-0000-0000003f0000',
       991200 + n, timestamptz '2026-07-01 10:00+00', ('00000000-0000-0000-0000-0000003f0e0' || n)::uuid,
       '00000000-0000-0000-0000-0000003f0c01', 'concluida'
  from generate_series(1, 4) as n;

-- 1: em curso, vai ser fechado. 2: agendado, cancelado e depois fechado (#753).
-- 3: em curso, fechado e depois cancelado. 4: em curso, só muda observações.
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
select ('00000000-0000-0000-0000-0000003f0b0' || n)::uuid, '00000000-0000-0000-0000-0000003f0000',
       991200 + n, ('00000000-0000-0000-0000-0000003f0f0' || n)::uuid,
       '00000000-0000-0000-0000-0000003f0c01', ('00000000-0000-0000-0000-0000003f0e0' || n)::uuid,
       'HF-0' || n || '-AA', timestamptz '2026-07-01 10:00+00', timestamptz '2026-07-10 10:00+00',
       eo::contrato_estado_operacional_enum, 'pendente', 'rent_a_car', 23,
       '00000000-0000-0000-0000-0000003f0a01'
  from (values (1, 'em_curso'), (2, 'agendado'), (3, 'em_curso'), (4, 'em_curso')) as x(n, eo);

-- O gestor fecha, cancela e edita (auth.uid() = gestor).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000003f0a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000003f0a01","role":"authenticated"}', true);

update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000003f0b01';
update public.contratos_renting set estado_operacional = 'cancelado'
 where id = '00000000-0000-0000-0000-0000003f0b02';
update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000003f0b02';
update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000003f0b03';
update public.contratos_renting set estado_operacional = 'cancelado'
 where id = '00000000-0000-0000-0000-0000003f0b03';
update public.contratos_renting set observacoes = 'nota'
 where id = '00000000-0000-0000-0000-0000003f0b04';

-- (1)
select is(
  (select ator_id::text || ' | ' || detalhe from public.contrato_historico
    where contrato_id = '00000000-0000-0000-0000-0000003f0b01' and evento_tipo = 'contrato_fechado'),
  '00000000-0000-0000-0000-0000003f0a01 | em_curso → fechado',
  'ir para fechado grava o marco contrato_fechado com o autor'
);

-- (2)
select is(
  (select ator_nome from public.contrato_historico_resumo('00000000-0000-0000-0000-0000003f0b01')
    where evento_tipo = 'contrato_fechado'),
  'Gestor Fecho',
  'o resumo mostra "fechado por" com o contrato em fechado'
);

select is(
  (select count(*)::int from public.contrato_historico
    where contrato_id = '00000000-0000-0000-0000-0000003f0b02' and evento_tipo = 'contrato_fechado'),
  1,
  'cancelado e depois fechado: um só marco de fecho (o do cancelamento)'
);

select is(
  (select detalhe from public.contrato_historico_resumo('00000000-0000-0000-0000-0000003f0b02')
    where evento_tipo = 'contrato_fechado'),
  'agendado → cancelado',
  'cancelado e depois fechado: o resumo mostra o fecho (caso #753)'
);

select is(
  (select count(*)::int from public.contrato_historico_resumo('00000000-0000-0000-0000-0000003f0b02')
    where evento_tipo = 'contrato_aberto'),
  0,
  'nunca entregue: "aberto por" continua sem registo'
);

-- (3) Na transacção do teste os dois eventos têm a mesma hora (now()), por
-- isso confere-se a tabela e não qual dos dois o resumo escolhe.
select is(
  (select string_agg(detalhe, ' ; ' order by detalhe) from public.contrato_historico
    where contrato_id = '00000000-0000-0000-0000-0000003f0b03' and evento_tipo = 'contrato_fechado'),
  'em_curso → fechado ; fechado → cancelado',
  'cancelar um contrato já fechado continua registado'
);

-- (4)
select is(
  (select count(*)::int from public.contrato_historico
    where contrato_id = '00000000-0000-0000-0000-0000003f0b04' and evento_tipo = 'contrato_fechado'),
  0,
  'alterar sem fechar não grava marco de fecho'
);

select is(
  (select count(*)::int from public.contrato_historico_resumo('00000000-0000-0000-0000-0000003f0b04')
    where evento_tipo = 'contrato_fechado'),
  0,
  'em curso: "fechado por" fica vazio'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
