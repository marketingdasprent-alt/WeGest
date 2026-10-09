-- ============================================================
-- TVDE fechado guarda a data_fim (20261008160000)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O aluguer pára em data_fim, não no estado. Um TVDE fechado sem data_fim
-- cobrava semanas inteiras depois de o motorista sair (78 contratos a
-- 2026-10-08). As provas defendem as portas por onde isso acontecia:
--   * o formulário manda data_fim = NULL em qualquer gravação de TVDE;
--   * "Fechado" escolhido no estado do formulário, sem data;
--   * um UPDATE que só muda o estado.
-- ============================================================

begin;
select plan(11);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000fd000', 'Org TVDE Fechado', 'tvde-fechado');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fd000', 'Cliente TVDE Fechado');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000fde01', '00000000-0000-0000-0000-0000000fd000', 'TF-01-TF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000fde02', '00000000-0000-0000-0000-0000000fd000', 'TF-02-TF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000fde03', '00000000-0000-0000-0000-0000000fd000', 'TF-03-TF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000fde04', '00000000-0000-0000-0000-0000000fd000', 'TF-04-TF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000fde05', '00000000-0000-0000-0000-0000000fd000', 'TF-05-TF', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000fde06', '00000000-0000-0000-0000-0000000fd000', 'TF-06-TF', 'Toyota', 'Corolla');

insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio,
   estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias)
values
  -- F1: fechado só com o estado.
  ('00000000-0000-0000-0000-0000000fd001', '00000000-0000-0000-0000-0000000fd000',
   '00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fde01', 'TF-01-TF',
   '2026-09-01T10:00:00Z', 'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- F2: fechado pelo diálogo, com data.
  ('00000000-0000-0000-0000-0000000fd002', '00000000-0000-0000-0000-0000000fd000',
   '00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fde02', 'TF-02-TF',
   '2026-09-01T10:00:00Z', 'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- F3: fechado pelo formulário (estado "Fechado" + data_fim NULL).
  ('00000000-0000-0000-0000-0000000fd003', '00000000-0000-0000-0000-0000000fd000',
   '00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fde03', 'TF-03-TF',
   '2026-09-01T10:00:00Z', 'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- F5: agendado para daqui a dois dias.
  ('00000000-0000-0000-0000-0000000fd005', '00000000-0000-0000-0000-0000000fd000',
   '00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fde06', 'TF-06-TF',
   now() + interval '2 days', 'agendado', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30),
  -- F4: TVDE vivo — a regra nova não lhe toca.
  ('00000000-0000-0000-0000-0000000fd004', '00000000-0000-0000-0000-0000000fd000',
   '00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fde04', 'TF-04-TF',
   '2026-09-01T10:00:00Z', 'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30);

-- R: rent-a-car — a regra é só de TVDE.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao)
values
  ('00000000-0000-0000-0000-0000000fd009', '00000000-0000-0000-0000-0000000fd000',
   '00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fde05', 'TF-05-TF',
   '2026-09-01T10:00:00Z', '2026-10-01T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false);

-- ── Fechar ─────────────────────────────────────────────────

update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000000fd001';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd001'),
  now(),
  'fechar só pelo estado grava a data de agora — sem ela cobrava para sempre'
);

update public.contratos_renting
   set estado_operacional = 'fechado', data_fim = '2026-09-20T10:00:00Z'
 where id = '00000000-0000-0000-0000-0000000fd002';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd002'),
  '2026-09-20T10:00:00Z'::timestamptz,
  'fechar com data (o diálogo) grava essa data'
);

update public.contratos_renting
   set estado_operacional = 'fechado', data_fim = null
 where id = '00000000-0000-0000-0000-0000000fd003';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd003'),
  now(),
  'fechar pelo formulário (estado Fechado, data vazia) grava a data de agora'
);

update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000000fd005';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd005'),
  now() + interval '2 days 1 second',
  'fechar um contrato que ainda não começou dá fim = início + 1 s (a base exige fim > início)'
);

-- ── Editar um fechado ──────────────────────────────────────

-- O formulário de TVDE manda data_fim = NULL em qualquer gravação.
update public.contratos_renting
   set data_fim = null, observacoes = 'só corrigi uma observação'
 where id = '00000000-0000-0000-0000-0000000fd002';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd002'),
  '2026-09-20T10:00:00Z'::timestamptz,
  'gravar o formulário de um TVDE fechado não apaga a data_fim — voltava a cobrar'
);

select is(
  (select observacoes from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd002'),
  'só corrigi uma observação',
  'e o resto da gravação passa'
);

update public.contratos_renting
   set data_fim = '2026-09-18T10:00:00Z'
 where id = '00000000-0000-0000-0000-0000000fd002';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd002'),
  '2026-09-18T10:00:00Z'::timestamptz,
  'corrigir a data do fecho para outra continua a poder-se'
);

-- ── Reverter o fecho (patchContratoAoReverterFecho) ───────

update public.contratos_renting
   set estado_operacional = 'em_curso', tipo_fecho = null, dua_devolvida_em = null
 where id = '00000000-0000-0000-0000-0000000fd002';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd002'),
  '2026-09-18T10:00:00Z'::timestamptz,
  'reverter o fecho não mexe na data_fim (comportamento anterior, inalterado)'
);

-- ── O que não muda ─────────────────────────────────────────

update public.contratos_renting
   set data_fim = null, observacoes = 'vivo'
 where id = '00000000-0000-0000-0000-0000000fd004';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd004'),
  null,
  'um TVDE vivo continua sem data_fim'
);

update public.contratos_renting
   set estado_operacional = 'fechado', data_fim = null
 where id = '00000000-0000-0000-0000-0000000fd009';

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000fd009'),
  null,
  'rent-a-car não é tocado'
);

select ok(
  exists (select 1 from pg_trigger t
           where t.tgname = 'trg_a_tvde_nasce_sem_data_fim'
             and t.tgrelid = 'public.contratos_renting'::regclass
             and pg_get_triggerdef(t.oid) like '%UPDATE OF data_fim, regime, estado_operacional%'),
  'a trigger corre também quando só muda o estado'
);

select * from finish();
rollback;
