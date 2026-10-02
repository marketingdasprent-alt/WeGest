-- ============================================================
-- Reservas apagadas deixam de prender viaturas
-- ============================================================
-- viaturas_com_disponibilidade contava reservas com deleted_at preenchido:
-- a viatura ficava presa até ao fim da reserva apagada. O EXCLUDE
-- reservas_no_overbooking e reserva_tem_conflito já as ignoravam.
-- Datas relativas a now(): nunca dependem do dia da semana.
-- ============================================================
begin;
select plan(2);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000f01ff', 'bootstrap@apagadas.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0a00', 'Org Apagadas', 'apagadas');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0a00', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-0000000f0d01', '00000000-0000-0000-0000-0000000f0a00', '00000000-0000-0000-0000-0000000f0aa1', 'Clio', 'manual', 5, 5, 2);
-- e01: só uma reserva sobreposta, apagada. e02: a mesma reserva, viva.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, is_slot) values
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f0a00', 'AP-01-AA', '00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0d01', false),
  ('00000000-0000-0000-0000-0000000f0e02', '00000000-0000-0000-0000-0000000f0a00', 'AP-02-AA', '00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0d01', false);

insert into public.reservas (org_id, viatura_id, estado, data_inicio, data_fim, deleted_at) values
  ('00000000-0000-0000-0000-0000000f0a00', '00000000-0000-0000-0000-0000000f0e01', 'pendente',
   now() + interval '10 days', now() + interval '13 days', now()),
  ('00000000-0000-0000-0000-0000000f0a00', '00000000-0000-0000-0000-0000000f0e02', 'pendente',
   now() + interval '10 days', now() + interval '13 days', null);

select is((select disponivel from public.viaturas_com_disponibilidade(now() + interval '11 days', now() + interval '12 days',
            '00000000-0000-0000-0000-0000000f0a00') where viatura_id = '00000000-0000-0000-0000-0000000f0e01'),
  true, 'reserva pendente apagada não prende a viatura');
select is((select disponivel from public.viaturas_com_disponibilidade(now() + interval '11 days', now() + interval '12 days',
            '00000000-0000-0000-0000-0000000f0a00') where viatura_id = '00000000-0000-0000-0000-0000000f0e02'),
  false, 'reserva pendente viva continua a prender');

select * from finish();
rollback;
