-- ============================================================
-- Slot sem motorista não gera alertas de viatura (pgTAP)
-- ============================================================
-- O ecrã mostra-o como "Inativo"; o cron emit_expiry_events() tem de o
-- tratar igual. Slot com atribuição activa e viatura normal continuam.
-- ============================================================

begin;
select plan(5);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000ee0000', 'Org Slots', 'slots-alertas');

-- data_matricula a 3 anos menos 5 dias: IUC cai daqui a 5 dias.
insert into public.viaturas (id, org_id, matricula, marca, modelo, is_slot, status, seguro_validade, data_matricula) values
  ('00000000-0000-0000-0000-000000ee0010', '00000000-0000-0000-0000-000000ee0000', 'SL-00-AA', 'Toyota', 'Corolla', true, 'disponivel', current_date + 5, (current_date + 5 - interval '3 years')::date),
  ('00000000-0000-0000-0000-000000ee0011', '00000000-0000-0000-0000-000000ee0000', 'SL-00-BB', 'Toyota', 'Corolla', true, 'em_uso', current_date + 5, (current_date + 5 - interval '3 years')::date),
  ('00000000-0000-0000-0000-000000ee0012', '00000000-0000-0000-0000-000000ee0000', 'FR-00-CC', 'Toyota', 'Corolla', false, 'disponivel', current_date + 5, null);

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0000', 'Motorista Slot');

insert into public.motorista_viaturas (org_id, motorista_id, viatura_id, data_inicio, data_fim, status) values
  ('00000000-0000-0000-0000-000000ee0000', '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0011', current_date - 30, null, 'ativo');

select public.emit_expiry_events();

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000ee0010' and event_type = 'viatura.seguro_expirando'),
  0,
  'slot sem motorista não gera alerta de seguro'
);

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000ee0010' and event_type = 'viatura.iuc_a_pagar'),
  0,
  'slot sem motorista não gera alerta de IUC'
);

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000ee0011' and event_type = 'viatura.seguro_expirando'),
  1,
  'slot com motorista activo continua a gerar alerta de seguro'
);

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000ee0011' and event_type = 'viatura.iuc_a_pagar'),
  1,
  'slot com motorista activo continua a gerar alerta de IUC'
);

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000ee0012' and event_type = 'viatura.seguro_expirando'),
  1,
  'viatura normal sem motorista continua a gerar alerta de seguro'
);

select * from finish();
rollback;
