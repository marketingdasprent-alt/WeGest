-- ============================================================
-- Cobrança mensal de slots tolerante a uma reserva má — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- A 28-09-2026 07:00 o cron gerar-cobrancas-slot-mensais abortou para todas
-- as organizações porque UMA reserva (Premium Ride #24) tinha um motorista
-- cujo cliente_id aponta para um cliente de outra org: fn_ensure_cliente_condutor
-- levanta 42501 e o loop, sem savepoint, morria ali. A 20260928120000 põe cada
-- reserva no seu sub-bloco e regista a falhada em failed_jobs. As provas, por
-- ordem:
--   * a função termina sem excepção com uma reserva má no meio;
--   * devolve o número de cobranças criadas (1: só a reserva boa);
--   * a reserva boa tem a cobrança do mês corrente; a má não tem nenhuma;
--   * o motorista da reserva má fica como estava (o sub-bloco não deixa
--     meia escrita) e a reserva má fica em failed_jobs, uma linha;
--   * a segunda passagem é idempotente (0), continua a não travar e não
--     duplica a linha em failed_jobs;
--   * as grants ficam como estavam (só service_role executa).
--
-- Nada depende do dia do mês nem da semana: as duas reservas entraram há
-- 3 meses, por isso caem sempre no ramo "mês cheio" (v_meses >= 2).
-- Depende da 20260925120246 (endurecer_rpcs_auditoria_seguranca): é aí que
-- fn_ensure_cliente_condutor passou a recusar o cliente de outra org.
-- Sem admins no fixture, on_failed_job_notify (AFTER INSERT em failed_jobs)
-- não tem a quem avisar e não escreve nada; o aviso aos admins já está
-- provado em alerta_failed_jobs.test.sql.
-- ============================================================

begin;
select plan(12);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação" para o
-- trigger de signup não atribuir org+admin ao gestor de baixo.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c5aff', 'bootstrap@slot-tolerante.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000c5a00', 'Org Slot Boa', 'slot-tol-a'),
  ('00000000-0000-0000-0000-0000000c5b00', 'Org Slot Ma',  'slot-tol-b');

-- created_by: reserva_slot_evento cria o evento de calendário com criado_por
-- NOT NULL, e aqui não há auth.uid().
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c5a01', 'gestor@slot-tol-a.pt'),
  ('00000000-0000-0000-0000-0000000c5b01', 'gestor@slot-tol-b.pt');

-- trg_sync_viatura_marca_modelo preenche marca/modelo a partir do catálogo e
-- apaga o texto passado directamente; sem catálogo a coluna fica NULL e rebenta.
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000c5aa1', '00000000-0000-0000-0000-0000000c5a00', 'Opel'),
  ('00000000-0000-0000-0000-0000000c5ba1', '00000000-0000-0000-0000-0000000c5b00', 'Opel');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000c5ab1', '00000000-0000-0000-0000-0000000c5a00', '00000000-0000-0000-0000-0000000c5aa1', 'Corsa'),
  ('00000000-0000-0000-0000-0000000c5bb1', '00000000-0000-0000-0000-0000000c5b00', '00000000-0000-0000-0000-0000000c5ba1', 'Corsa');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000000c5ae1', '00000000-0000-0000-0000-0000000c5a00', 'ST-01-AA',
   '00000000-0000-0000-0000-0000000c5aa1', '00000000-0000-0000-0000-0000000c5ab1'),
  ('00000000-0000-0000-0000-0000000c5be1', '00000000-0000-0000-0000-0000000c5b00', 'ST-01-BB',
   '00000000-0000-0000-0000-0000000c5ba1', '00000000-0000-0000-0000-0000000c5bb1');

-- Cliente da org A que vai ficar (mal) ligado ao motorista da org B.
insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000c5ac1', '00000000-0000-0000-0000-0000000c5a00', 'Cliente Da Org A');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000c5ad1', '00000000-0000-0000-0000-0000000c5a00', 'Motorista Bom'),
  ('00000000-0000-0000-0000-0000000c5bd1', '00000000-0000-0000-0000-0000000c5b00', 'Motorista Cruzado');

-- trg_slot_cobranca_entrada gera a cobrança de M+1 ao inserir a reserva e,
-- pelo caminho, cria e liga o cliente condutor. Fica desligada só durante
-- estes INSERTs: o teste quer contar apenas o que o cron gera, e precisa do
-- motorista B ainda sem cliente próprio para o ligar ao da org A (o caso real).
alter table public.reservas disable trigger trg_slot_cobranca_entrada;

insert into public.reservas
  (id, org_id, codigo, regime, estado, data_inicio, viatura_id, condutor_id, slot_valor_mensal, created_by)
values
  -- Reserva boa: org A, motorista sem cliente — fn_ensure_cliente_condutor cria-o.
  ('00000000-0000-0000-0000-0000000c5a31', '00000000-0000-0000-0000-0000000c5a00', 980001,
   'slot', 'em_curso', now() - interval '3 months',
   '00000000-0000-0000-0000-0000000c5ae1', '00000000-0000-0000-0000-0000000c5ad1', 125,
   '00000000-0000-0000-0000-0000000c5a01'),
  -- Reserva má: org B, o motorista vai apontar para um cliente da org A.
  ('00000000-0000-0000-0000-0000000c5b31', '00000000-0000-0000-0000-0000000c5b00', 980001,
   'slot', 'em_curso', now() - interval '3 months',
   '00000000-0000-0000-0000-0000000c5be1', '00000000-0000-0000-0000-0000000c5bd1', 125,
   '00000000-0000-0000-0000-0000000c5b01');

alter table public.reservas enable trigger trg_slot_cobranca_entrada;

-- O caso real (reserva #24 da Premium Ride): motoristas_ativos.cliente_id a
-- apontar para um cliente de outra organização. Não há FK composta nem trigger
-- a impedir isto — só o RLS, que o postgres do teste ignora.
update public.motoristas_ativos
   set cliente_id = '00000000-0000-0000-0000-0000000c5ac1'
 where id = '00000000-0000-0000-0000-0000000c5bd1';

-- ── Grants ficam como estavam ──────────────────────────────

select ok(not has_function_privilege('anon', 'public.gerar_cobrancas_slot_mensais()', 'EXECUTE'),
  'anon não executa o cron');

select ok(not has_function_privilege('authenticated', 'public.gerar_cobrancas_slot_mensais()', 'EXECUTE'),
  'authenticated não executa o cron');

select ok(has_function_privilege('service_role', 'public.gerar_cobrancas_slot_mensais()', 'EXECUTE'),
  'service_role executa o cron');

-- ── Uma reserva má não trava as outras ─────────────────────

-- Guarda-se o valor devolvido numa tabela temporária: a segunda chamada já
-- seria idempotente (0) e perdia-se o "devolve 1".
select lives_ok(
  $$ create temporary table _cron as select public.gerar_cobrancas_slot_mensais() as criadas $$,
  'a função termina sem excepção com uma reserva má no meio'
);

select is(
  (select criadas from _cron),
  1,
  'devolve 1: só a reserva boa gerou cobrança'
);

select is(
  (select count(*)::int from public.contrato_cobrancas
    where reserva_id = '00000000-0000-0000-0000-0000000c5a31' and tipo_cobranca = 'slot_mensal'),
  1,
  'a reserva boa (org A) recebeu a cobrança de slot'
);

select is(
  (select periodo_de from public.contrato_cobrancas
    where reserva_id = '00000000-0000-0000-0000-0000000c5a31' and tipo_cobranca = 'slot_mensal'),
  date_trunc('month', current_date)::date,
  'e é a do mês corrente (ramo "mês cheio": a entrada foi há 3 meses)'
);

select is(
  (select count(*)::int from public.contrato_cobrancas
    where reserva_id = '00000000-0000-0000-0000-0000000c5b31' and tipo_cobranca = 'slot_mensal'),
  0,
  'a reserva má (motorista com cliente de outra org) não gera cobrança'
);

-- ── A falha fica registada, sem meia escrita ───────────────

select is(
  (select cliente_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000000c5bd1'),
  '00000000-0000-0000-0000-0000000c5ac1'::uuid,
  'o motorista B mantém o cliente_id da org A: o sub-bloco não deixou meia escrita'
);

select is(
  (select count(*)::int from public.failed_jobs
    where source_id = '00000000-0000-0000-0000-0000000c5b31'
      and job_type = 'cobranca.slot_mensal'
      and org_id = '00000000-0000-0000-0000-0000000c5b00'),
  1,
  'a reserva má fica em failed_jobs, uma linha, na org da reserva'
);

-- ── Segunda passagem ───────────────────────────────────────

select is(
  public.gerar_cobrancas_slot_mensais(),
  0,
  'segunda passagem: nada a criar, e a reserva má continua a não travar'
);

select is(
  (select count(*)::int from public.failed_jobs
    where source_id = '00000000-0000-0000-0000-0000000c5b31'
      and job_type = 'cobranca.slot_mensal'),
  1,
  'e a linha em failed_jobs não duplica enquanto não for resolvida'
);

select * from finish();
rollback;
