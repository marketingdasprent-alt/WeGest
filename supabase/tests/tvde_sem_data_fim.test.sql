-- ============================================================
-- TVDE sem data de fim — também em UPDATE e ao renovar (20260924100000)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Um TVDE vivo não tem data_fim: cobra-se à semana até fechar. O aluguer é
-- calculado ao vivo a partir de data_fim, por isso as provas defendem, por
-- ordem de importância:
--   * apagar uma data_fim de legado de uma semana já fechada NÃO passa —
--     cobrava o retroactivo;
--   * escrever uma data_fim num TVDE vivo vai para proxima_renovacao_em;
--   * fechar/substituir continua a gravar data_fim (é o fim real);
--   * renovar um TVDE com legado antigo reabre numa versão nova a partir de
--     hoje, com a data antiga intacta na versão que sai.
--
-- Nada aqui depende do dia da semana: o legado "antigo" é de Janeiro de 2026
-- e o "corrente" é now() + 2 horas, sempre depois da segunda-feira corrente.
-- ============================================================

begin;
select plan(22);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000d0000', 'Org TVDE Sem Fim', 'tvde-sem-fim');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0a01', 'gestor@tvde-sem-fim.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000d0a01', '00000000-0000-0000-0000-0000000d0000', true);

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000d0a01', '00000000-0000-0000-0000-0000000d0000');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0000', 'Cliente TVDE Sem Fim');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000d0e01', '00000000-0000-0000-0000-0000000d0000', 'TS-01-TS', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d0e02', '00000000-0000-0000-0000-0000000d0000', 'TS-02-TS', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d0e03', '00000000-0000-0000-0000-0000000d0000', 'TS-03-TS', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d0e04', '00000000-0000-0000-0000-0000000d0000', 'TS-04-TS', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d0e05', '00000000-0000-0000-0000-0000000d0000', 'TS-05-TS', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d0e06', '00000000-0000-0000-0000-0000000d0000', 'TS-06-TS', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d0e07', '00000000-0000-0000-0000-0000000d0000', 'TS-07-TS', 'Toyota', 'Corolla');

-- T1: TVDE normal, criado com uma data_fim (o formulário antigo fazia-o).
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias)
values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e01', 'TS-01-TS',
   '2026-09-01T10:00:00Z', '2026-10-01T10:00:00Z',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30);

-- R: rent-a-car — a regra não lhe toca.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao)
values
  ('00000000-0000-0000-0000-0000000d0009', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e07', 'TS-07-TS',
   '2026-09-01T10:00:00Z', '2026-10-01T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false);

-- Os de legado só existem porque nasceram antes de 20260908092000: para os
-- montar, desliga-se a trigger só durante estes INSERTs.
alter table public.contratos_renting disable trigger trg_a_tvde_nasce_sem_data_fim;

insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, proxima_renovacao_em,
   estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias)
values
  -- T2: legado ANTIGO — terminou em Janeiro, semanas já fechadas.
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e02', 'TS-02-TS',
   '2025-12-10T10:00:00Z', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- T3: legado CORRENTE — termina daqui a 2 horas.
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e03', 'TS-03-TS',
   '2026-08-25T10:00:00Z', now() + interval '2 hours', now() + interval '2 hours',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- T4: legado CORRENTE, para renovar.
  ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e04', 'TS-04-TS',
   '2026-08-25T10:00:00Z', now() + interval '2 hours', now() + interval '2 hours',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- T5: legado ANTIGO, para renovar — o motorista continua com o carro.
  ('00000000-0000-0000-0000-0000000d0005', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e05', 'TS-05-TS',
   '2025-12-10T10:00:00Z', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- T6: legado ANTIGO cuja viatura já está noutro contrato (o caso #441↔#842).
  ('00000000-0000-0000-0000-0000000d0006', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e06', 'TS-06-TS',
   '2025-12-10T10:00:00Z', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30);

alter table public.contratos_renting enable trigger trg_a_tvde_nasce_sem_data_fim;

-- T7: o contrato que tem hoje a viatura do T6.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio,
   estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias)
values
  ('00000000-0000-0000-0000-0000000d0007', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d0e06', 'TS-06-TS',
   '2026-08-26T08:00:00Z',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30);

-- ── INSERT, como antes ─────────────────────────────────────

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0001'),
  null,
  'um TVDE criado com data_fim nasce sem ela'
);

-- ── UPDATE num TVDE vivo ───────────────────────────────────

update public.contratos_renting
   set data_fim = '2026-11-01T10:00:00Z'
 where id = '00000000-0000-0000-0000-0000000d0001';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0001'),
  null,
  'escrever uma data_fim num TVDE vivo não a grava'
);

select is(
  (select proxima_renovacao_em from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0001'),
  '2026-11-01T10:00:00Z'::timestamptz,
  'a data escrita vai para proxima_renovacao_em'
);

update public.contratos_renting
   set data_fim = '2026-12-01T10:00:00Z',
       proxima_renovacao_em = '2026-11-15T10:00:00Z'
 where id = '00000000-0000-0000-0000-0000000d0001';

select is(
  (select proxima_renovacao_em from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0001'),
  '2026-11-15T10:00:00Z'::timestamptz,
  'se a próxima renovação vier escrita à parte, é essa que manda'
);

-- ── Legado ─────────────────────────────────────────────────

-- O formulário de TVDE manda data_fim = NULL em qualquer gravação.
update public.contratos_renting
   set data_fim = null, observacoes = 'só corrigi uma observação'
 where id = '00000000-0000-0000-0000-0000000d0002';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0002'),
  '2026-01-10T10:00:00Z'::timestamptz,
  'apagar uma data_fim de legado de semana já fechada não passa — cobrava o retroactivo'
);

select is(
  (select observacoes from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0002'),
  'só corrigi uma observação',
  'e o resto da gravação passa, o gestor não fica bloqueado'
);

update public.contratos_renting
   set data_fim = '2026-02-10T10:00:00Z'
 where id = '00000000-0000-0000-0000-0000000d0002';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0002'),
  '2026-01-10T10:00:00Z'::timestamptz,
  'nem mudar a data de legado para outra: mudava o que já se cobrou'
);

update public.contratos_renting
   set data_fim = null
 where id = '00000000-0000-0000-0000-0000000d0003';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0003'),
  null,
  'legado desta semana ou futuro pode ser limpo — só estende a semana corrente'
);

-- ── Fechar e rent-a-car ────────────────────────────────────

update public.contratos_renting
   set estado_operacional = 'fechado', data_fim = '2026-09-20T10:00:00Z'
 where id = '00000000-0000-0000-0000-0000000d0001';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0001'),
  '2026-09-20T10:00:00Z'::timestamptz,
  'ao fechar um TVDE a data_fim grava-se: é ela que pára o aluguer'
);

update public.contratos_renting
   set data_fim = '2026-10-15T10:00:00Z'
 where id = '00000000-0000-0000-0000-0000000d0009';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0009'),
  '2026-10-15T10:00:00Z'::timestamptz,
  'rent-a-car não é tocado'
);

-- ── Renovar ────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d0a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d0a01","role":"authenticated"}', true);

select is(
  public.renovar_contrato_renting('00000000-0000-0000-0000-0000000d0004'),
  '00000000-0000-0000-0000-0000000d0004'::uuid,
  'renovar um TVDE com legado corrente devolve o mesmo contrato'
);

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0004'),
  null,
  'e limpa-lhe a data_fim'
);

create temp table renovado on commit drop as
  select public.renovar_contrato_renting('00000000-0000-0000-0000-0000000d0005') as novo_id;

select isnt(
  (select novo_id from renovado),
  '00000000-0000-0000-0000-0000000d0005'::uuid,
  'renovar um TVDE com legado antigo abre uma versão nova'
);

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0005'),
  '2026-01-10T10:00:00Z'::timestamptz,
  'a versão que sai guarda a data_fim antiga — o que já se cobrou não muda'
);

select ok(
  (select substituido_em is not null and estado_operacional = 'fechado'
     from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0005'),
  'e fica substituída'
);

select ok(
  (select n.data_inicio = now() and n.data_fim is null
     from public.contratos_renting n where n.id = (select novo_id from renovado)),
  'a versão nova começa agora e não tem data_fim — as semanas do meio ficam sem aluguer'
);

select ok(
  (select n.codigo = o.codigo and n.versao = o.versao + 1 and n.contrato_anterior_id = o.id
          and n.estado_operacional = 'em_curso' and n.regime = 'tvde'
     from public.contratos_renting n, public.contratos_renting o
    where n.id = (select novo_id from renovado) and o.id = '00000000-0000-0000-0000-0000000d0005'),
  'mesmo código, versão seguinte, em curso'
);

select ok(
  (select n.proxima_renovacao_em > now()
     from public.contratos_renting n where n.id = (select novo_id from renovado)),
  'a próxima renovação conta a partir de hoje'
);

select throws_like(
  $$ select public.renovar_contrato_renting('00000000-0000-0000-0000-0000000d0006') $$,
  '%a viatura já está no contrato%',
  'não se reabre um contrato antigo por cima de quem tem hoje a viatura'
);

select is(
  (select substituido_em from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d0006'),
  null,
  'e o contrato recusado fica como estava'
);

-- ── Sem org activa ─────────────────────────────────────────
-- get_current_org_id() devolve NULL, e "org_id <> NULL" não disparava a
-- guarda. Qualquer autenticado podia apagar a sua linha em user_org_ativa
-- e renovar contratos de outra organização.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0a02', 'intruso@outra-org.pt');

-- O signup pode ter-lhe criado uma org activa; o ataque começa por apagá-la.
delete from public.user_org_ativa where user_id = '00000000-0000-0000-0000-0000000d0a02';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d0a02', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d0a02","role":"authenticated"}', true);

select throws_ok(
  $$ select public.renovar_contrato_renting('00000000-0000-0000-0000-0000000d0003') $$,
  'Sem permissão sobre este contrato.',
  'sem org activa não se renova contrato de ninguém'
);

select ok(
  (select c.substituido_em is null
          and not exists (select 1 from public.contrato_extras e where e.contrato_id = c.id)
     from public.contratos_renting c where c.id = '00000000-0000-0000-0000-0000000d0003'),
  'e a tentativa não deixou rasto: nem versão nova, nem extras'
);

select * from finish();
rollback;
