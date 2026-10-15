-- ============================================================
-- API do site: reservada/em uso sem registo não é livre (20261015170000)
-- ============================================================
-- api_viaturas_livres passa a exigir um registo actual (contrato, reserva,
-- motorista, movimento) a quem está reservada ou em uso. Com registo nada
-- muda: mandam as datas dele. Datas relativas a now(), nunca ao dia da semana.
-- ============================================================
begin;
select plan(11);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000e5701ff', 'bootstrap@estado.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000e570a00', 'Org Estado', 'estado-a');
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e570aa1', '00000000-0000-0000-0000-00000e570a00', 'Fiat');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00000e570d01', '00000000-0000-0000-0000-00000e570a00', '00000000-0000-0000-0000-00000e570aa1', 'Tipo');

-- e01 reservada sem nada; e02 em uso sem nada; e03 em uso com motorista até +4 dias;
-- e04 reservada com reserva de +10 a +12 dias; e05 reservada só com uma reserva já
-- terminada; e06 disponível.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, is_slot) values
  ('00000000-0000-0000-0000-00000e570e01', '00000000-0000-0000-0000-00000e570a00', 'ES-01-AA', '00000000-0000-0000-0000-00000e570aa1', '00000000-0000-0000-0000-00000e570d01', false),
  ('00000000-0000-0000-0000-00000e570e02', '00000000-0000-0000-0000-00000e570a00', 'ES-02-AA', '00000000-0000-0000-0000-00000e570aa1', '00000000-0000-0000-0000-00000e570d01', false),
  ('00000000-0000-0000-0000-00000e570e03', '00000000-0000-0000-0000-00000e570a00', 'ES-03-AA', '00000000-0000-0000-0000-00000e570aa1', '00000000-0000-0000-0000-00000e570d01', false),
  ('00000000-0000-0000-0000-00000e570e04', '00000000-0000-0000-0000-00000e570a00', 'ES-04-AA', '00000000-0000-0000-0000-00000e570aa1', '00000000-0000-0000-0000-00000e570d01', false),
  ('00000000-0000-0000-0000-00000e570e05', '00000000-0000-0000-0000-00000e570a00', 'ES-05-AA', '00000000-0000-0000-0000-00000e570aa1', '00000000-0000-0000-0000-00000e570d01', false),
  ('00000000-0000-0000-0000-00000e570e06', '00000000-0000-0000-0000-00000e570a00', 'ES-06-AA', '00000000-0000-0000-0000-00000e570aa1', '00000000-0000-0000-0000-00000e570d01', false);

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e570c01', '00000000-0000-0000-0000-00000e570a00', 'Motorista Estado');
insert into public.motorista_viaturas (org_id, motorista_id, viatura_id, data_inicio, data_fim, status) values
  ('00000000-0000-0000-0000-00000e570a00', '00000000-0000-0000-0000-00000e570c01', '00000000-0000-0000-0000-00000e570e03',
   (now() - interval '30 days')::date, (now() + interval '4 days')::date, 'ativo');
insert into public.reservas (org_id, viatura_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-00000e570a00', '00000000-0000-0000-0000-00000e570e04', now() + interval '10 days', now() + interval '12 days'),
  ('00000000-0000-0000-0000-00000e570a00', '00000000-0000-0000-0000-00000e570e05', now() - interval '10 days', now() - interval '5 days');

-- O estado entra no fim: os triggers dos registos podiam mexer-lhe.
update public.viaturas set status = 'reservada' where id in ('00000000-0000-0000-0000-00000e570e01', '00000000-0000-0000-0000-00000e570e04', '00000000-0000-0000-0000-00000e570e05');
update public.viaturas set status = 'em_uso' where id in ('00000000-0000-0000-0000-00000e570e02', '00000000-0000-0000-0000-00000e570e03');
update public.viaturas set status = 'disponivel' where id = '00000000-0000-0000-0000-00000e570e06';

create function pg_temp.livre(p_viatura uuid, p_de interval, p_ate interval) returns boolean language sql as $$
  select exists (select 1 from public.api_viaturas_livres('00000000-0000-0000-0000-00000e570a00',
                   now() + p_de, now() + p_ate) l where l.viatura_id = p_viatura);
$$;

-- Sem registo: fora em qualquer data.
select ok(not pg_temp.livre('00000000-0000-0000-0000-00000e570e01', '1 day', '4 days'),
  'reservada sem registo não é livre já');
select ok(not pg_temp.livre('00000000-0000-0000-0000-00000e570e01', '20 days', '22 days'),
  'reservada sem registo também não é livre mais tarde');
select ok(not pg_temp.livre('00000000-0000-0000-0000-00000e570e02', '1 day', '4 days'),
  'em uso sem registo não é livre');
select ok(not pg_temp.livre('00000000-0000-0000-0000-00000e570e05', '1 day', '4 days'),
  'reserva já terminada não justifica o estado reservada');

-- Com registo: mandam as datas dele.
select ok(not pg_temp.livre('00000000-0000-0000-0000-00000e570e03', '1 day', '3 days'),
  'em uso com motorista até +4 dias: ocupada durante a atribuição');
select ok(pg_temp.livre('00000000-0000-0000-0000-00000e570e03', '6 days', '8 days'),
  'em uso com motorista até +4 dias: livre depois');
select ok(pg_temp.livre('00000000-0000-0000-0000-00000e570e04', '1 day', '3 days'),
  'reservada com reserva futura: livre antes da reserva');
select ok(not pg_temp.livre('00000000-0000-0000-0000-00000e570e04', '10 days', '12 days'),
  'reservada com reserva futura: ocupada nas datas dela');

-- Disponível sem nada continua livre.
select ok(pg_temp.livre('00000000-0000-0000-0000-00000e570e06', '1 day', '4 days'),
  'disponível sem registos é livre');

-- Privilégios inalterados.
select ok(not has_function_privilege('anon', 'public.api_viaturas_livres(uuid,timestamptz,timestamptz)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.api_viaturas_livres(uuid,timestamptz,timestamptz)', 'EXECUTE'),
  'anon e authenticated não executam api_viaturas_livres');
select ok(has_function_privilege('service_role', 'public.api_viaturas_livres(uuid,timestamptz,timestamptz)', 'EXECUTE'),
  'service_role executa api_viaturas_livres');

select * from finish();
rollback;
