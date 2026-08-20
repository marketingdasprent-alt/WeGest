-- ============================================================
-- Cascata contrato_renting → reserva no fecho
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Sentinela de 20260820140000_fecho_contrato_liberta_viatura.sql.
-- O bug que isto trava: fechar um contrato ainda em 'agendado' deixava a
-- reserva em 'confirmada', e 'confirmada' é um dos estados que ocupam a
-- viatura em useViaturasOcupacao — 39 carros ficaram indisponíveis em
-- produção sem nada na UI a explicar porquê.
--
-- Cobre também o que NÃO pode mudar: 'devolvido' preserva os eventos (é o que
-- alimenta o Relatório de Eventos) e versões substituídas não cascateiam.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Cascata Fecho', 'cascata-fecho');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0000', 'Cliente Cascata');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0000', 'CF-01-CF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0000', 'CF-02-CF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000f0a03', '00000000-0000-0000-0000-0000000f0000', 'CF-03-CF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000f0a04', '00000000-0000-0000-0000-0000000f0000', 'CF-04-CF', 'Toyota', 'Corolla');

insert into public.reservas (id, org_id, codigo, cliente_id, viatura_id, data_inicio, data_fim, estado) values
  ('00000000-0000-0000-0000-0000000f0r01', '00000000-0000-0000-0000-0000000f0000', 900001, '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a01', now(), now() + interval '10 days', 'confirmada'),
  ('00000000-0000-0000-0000-0000000f0r02', '00000000-0000-0000-0000-0000000f0000', 900002, '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a02', now(), now() + interval '10 days', 'em_curso'),
  ('00000000-0000-0000-0000-0000000f0r03', '00000000-0000-0000-0000-0000000f0000', 900003, '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a03', now(), now() + interval '10 days', 'em_curso'),
  ('00000000-0000-0000-0000-0000000f0r04', '00000000-0000-0000-0000-0000000f0000', 900004, '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a04', now(), now() + interval '10 days', 'em_curso');

insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, estado_operacional, regime) values
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f0000', 900001, '00000000-0000-0000-0000-0000000f0r01', '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a01', 'CF-01-CF', now(), now() + interval '10 days', 'agendado', 'rent_a_car'),
  ('00000000-0000-0000-0000-0000000f0e02', '00000000-0000-0000-0000-0000000f0000', 900002, '00000000-0000-0000-0000-0000000f0r02', '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a02', 'CF-02-CF', now(), now() + interval '10 days', 'em_curso', 'rent_a_car'),
  ('00000000-0000-0000-0000-0000000f0e03', '00000000-0000-0000-0000-0000000f0000', 900003, '00000000-0000-0000-0000-0000000f0r03', '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a03', 'CF-03-CF', now(), now() + interval '10 days', 'em_curso', 'rent_a_car'),
  ('00000000-0000-0000-0000-0000000f0e04', '00000000-0000-0000-0000-0000000f0000', 900004, '00000000-0000-0000-0000-0000000f0r04', '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a04', 'CF-04-CF', now(), now() + interval '10 days', 'em_curso', 'rent_a_car');

-- Eventos derivados nos contratos 2 (cancelado) e 3 (devolvido).
insert into public.calendario_eventos (id, org_id, titulo, tipo, data_inicio, origem_tipo, origem_id) values
  ('00000000-0000-0000-0000-0000000f0v02', '00000000-0000-0000-0000-0000000f0000', 'CF02CF', 'recolha', now(), 'contrato_renting', '00000000-0000-0000-0000-0000000f0e02'),
  ('00000000-0000-0000-0000-0000000f0v03', '00000000-0000-0000-0000-0000000f0000', 'CF03CF', 'recolha', now(), 'contrato_renting', '00000000-0000-0000-0000-0000000f0e03');

-- ------------------------------------------------------------
-- 1) agendado → cancelado: a reserva é cancelada e a viatura fica livre.
--    (Antes ficava 'confirmada' e continuava a ocupar o carro.)
-- ------------------------------------------------------------
update public.contratos_renting set estado_operacional = 'cancelado'
 where id = '00000000-0000-0000-0000-0000000f0e01';

select is(
  (select estado::text from public.reservas where id = '00000000-0000-0000-0000-0000000f0r01'),
  'cancelada',
  'agendado→cancelado cancela a reserva (liberta a viatura)'
);

-- ------------------------------------------------------------
-- 2 e 3) em_curso → cancelado: reserva cancelada e eventos apagados.
-- ------------------------------------------------------------
update public.contratos_renting set estado_operacional = 'cancelado'
 where id = '00000000-0000-0000-0000-0000000f0e02';

select is(
  (select estado::text from public.reservas where id = '00000000-0000-0000-0000-0000000f0r02'),
  'cancelada',
  'em_curso→cancelado cancela a reserva'
);

select is(
  (select count(*) from public.calendario_eventos
    where origem_tipo = 'contrato_renting'
      and origem_id = '00000000-0000-0000-0000-0000000f0e02'),
  0::bigint,
  'cancelado apaga os eventos derivados (compromisso que não se concretizou)'
);

-- ------------------------------------------------------------
-- 4 e 5) em_curso → devolvido: reserva concluída e eventos PRESERVADOS.
-- ------------------------------------------------------------
update public.contratos_renting set estado_operacional = 'devolvido'
 where id = '00000000-0000-0000-0000-0000000f0e03';

select is(
  (select estado::text from public.reservas where id = '00000000-0000-0000-0000-0000000f0r03'),
  'concluida',
  'em_curso→devolvido conclui a reserva'
);

select is(
  (select count(*) from public.calendario_eventos
    where origem_tipo = 'contrato_renting'
      and origem_id = '00000000-0000-0000-0000-0000000f0e03'),
  1::bigint,
  'devolvido preserva os eventos (histórico do Relatório de Eventos)'
);

-- ------------------------------------------------------------
-- 6) História é inerte: versão substituída não cascateia para a reserva,
--    que pertence agora ao contrato sucessor.
-- ------------------------------------------------------------
update public.contratos_renting
   set substituido_em = now()
 where id = '00000000-0000-0000-0000-0000000f0e04';

update public.contratos_renting set estado_operacional = 'cancelado'
 where id = '00000000-0000-0000-0000-0000000f0e04';

select is(
  (select estado::text from public.reservas where id = '00000000-0000-0000-0000-0000000f0r04'),
  'em_curso',
  'versão substituída não mexe na reserva do sucessor'
);

select * from finish();
rollback;
