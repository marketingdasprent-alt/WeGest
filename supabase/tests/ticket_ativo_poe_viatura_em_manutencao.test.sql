-- ============================================================
-- Ticket activo põe a viatura em manutenção: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261014100000. Provas:
--   (1) abrir um ticket põe a viatura em manutenção, venha de onde vier;
--   (2) com dois tickets activos, fechar um não liberta; fechar o último sim;
--   (3) ao libertar, viatura com motorista fica em uso; sem ninguém, disponível;
--   (4) um ticket pendente (por aprovar) não mexe; estados fora de operação
--       (inativo) nunca são tocados;
--   (5) mudar o ticket de viatura liberta a antiga e prende a nova;
--   (6) só o dono da base chama as funções.
-- ============================================================

begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000a5100ff', 'bootstrap@ticket-manut.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000a510000', 'Org Ticket Manutencao', 'ticket-manut-a');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000a510aa1', '00000000-0000-0000-0000-00000a510000', 'Fiat');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00000a510ab1', '00000000-0000-0000-0000-00000a510000',
   '00000000-0000-0000-0000-00000a510aa1', 'Panda');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, status) values
  ('00000000-0000-0000-0000-00000a510e01', '00000000-0000-0000-0000-00000a510000', 'TM-01-AA',
   '00000000-0000-0000-0000-00000a510aa1', '00000000-0000-0000-0000-00000a510ab1', 'disponivel'),
  ('00000000-0000-0000-0000-00000a510e02', '00000000-0000-0000-0000-00000a510000', 'TM-02-AA',
   '00000000-0000-0000-0000-00000a510aa1', '00000000-0000-0000-0000-00000a510ab1', 'em_uso'),
  ('00000000-0000-0000-0000-00000a510e03', '00000000-0000-0000-0000-00000a510000', 'TM-03-AA',
   '00000000-0000-0000-0000-00000a510aa1', '00000000-0000-0000-0000-00000a510ab1', 'inativo'),
  ('00000000-0000-0000-0000-00000a510e04', '00000000-0000-0000-0000-00000a510000', 'TM-04-AA',
   '00000000-0000-0000-0000-00000a510aa1', '00000000-0000-0000-0000-00000a510ab1', 'disponivel');

insert into public.motoristas_ativos (id, org_id, nome, status_ativo) values
  ('00000000-0000-0000-0000-00000a510d01', '00000000-0000-0000-0000-00000a510000', 'Motorista Com Carro', true);

insert into public.motorista_viaturas (org_id, motorista_id, viatura_id, status, data_inicio) values
  ('00000000-0000-0000-0000-00000a510000', '00000000-0000-0000-0000-00000a510d01',
   '00000000-0000-0000-0000-00000a510e02', 'ativo', date '2026-10-01');

-- ── (1) Abrir um ticket ────────────────────────────────────

insert into public.assistencia_tickets (id, org_id, viatura_id, titulo, status) values
  ('00000000-0000-0000-0000-00000a510001', '00000000-0000-0000-0000-00000a510000',
   '00000000-0000-0000-0000-00000a510e01', 'Carente de passar na oficina', 'aberto');

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e01'),
  'manutencao',
  'ticket aberto põe a viatura disponível em manutenção'
);

-- Segundo ticket na mesma viatura, em andamento.
insert into public.assistencia_tickets (id, org_id, viatura_id, titulo, status) values
  ('00000000-0000-0000-0000-00000a510002', '00000000-0000-0000-0000-00000a510000',
   '00000000-0000-0000-0000-00000a510e01', 'Luz de motor acesa', 'em_andamento');

-- ── (2) Dois activos: fechar um não liberta ───────────────

update public.assistencia_tickets set status = 'resolvido'
 where id = '00000000-0000-0000-0000-00000a510002';

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e01'),
  'manutencao',
  'com outro ticket ainda aberto a viatura continua em manutenção'
);

update public.assistencia_tickets set status = 'resolvido'
 where viatura_id = '00000000-0000-0000-0000-00000a510e01' and status = 'aberto';

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e01'),
  'disponivel',
  'fechado o último ticket, a viatura sem ninguém volta a disponível'
);

-- ── (3) Viatura com motorista ─────────────────────────────

insert into public.assistencia_tickets (id, org_id, viatura_id, titulo, status) values
  ('00000000-0000-0000-0000-00000a510003', '00000000-0000-0000-0000-00000a510000',
   '00000000-0000-0000-0000-00000a510e02', 'Barulho no motor', 'aberto');

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e02'),
  'manutencao',
  'ticket aberto numa viatura em uso também a põe em manutenção'
);

update public.assistencia_tickets set status = 'fechado'
 where id = '00000000-0000-0000-0000-00000a510003';

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e02'),
  'em_uso',
  'ao fechar, a viatura com motorista volta a em uso'
);

-- ── (4) Pendente não mexe; inativo nunca é tocado ─────────

insert into public.assistencia_tickets (id, org_id, viatura_id, titulo, status) values
  ('00000000-0000-0000-0000-00000a510004', '00000000-0000-0000-0000-00000a510000',
   '00000000-0000-0000-0000-00000a510e04', 'Por aprovar', 'pendente');

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e04'),
  'disponivel',
  'ticket pendente de aprovação não mexe na viatura'
);

update public.assistencia_tickets set status = 'aberto'
 where id = '00000000-0000-0000-0000-00000a510004';

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e04'),
  'manutencao',
  'aprovado (passa a aberto), a viatura vai para manutenção'
);

insert into public.assistencia_tickets (id, org_id, viatura_id, titulo, status) values
  ('00000000-0000-0000-0000-00000a510005', '00000000-0000-0000-0000-00000a510000',
   '00000000-0000-0000-0000-00000a510e03', 'Carro parado', 'aberto');

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e03'),
  'inativo',
  'uma viatura inativa não é tocada'
);

update public.assistencia_tickets set status = 'resolvido'
 where id = '00000000-0000-0000-0000-00000a510005';

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e03'),
  'inativo',
  'nem ao fechar'
);

-- ── (5) Mudar o ticket de viatura ─────────────────────────

update public.assistencia_tickets
   set viatura_id = '00000000-0000-0000-0000-00000a510e01'
 where id = '00000000-0000-0000-0000-00000a510004';

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e04'),
  'disponivel',
  'a viatura antiga fica livre'
);

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-00000a510e01'),
  'manutencao',
  'e a nova fica em manutenção'
);

-- ── (6) Grants ─────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.viatura_libertar_sem_tickets(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.viatura_libertar_sem_tickets(uuid)', 'EXECUTE'),
  'só o dono da base liberta viaturas por fora do gatilho'
);

select ok(
  exists (select 1 from pg_trigger where tgname = 'trg_ticket_sincroniza_estado_viatura'),
  'o gatilho existe'
);

select * from finish();
rollback;
