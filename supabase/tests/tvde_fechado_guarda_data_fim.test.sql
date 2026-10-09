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

-- Autor dos contratos: a cascata cria eventos de calendário com criado_por
-- obrigatório, e aqui não há auth.uid().
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000fda01', 'gestor@tvde-fechado.pt');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000fdaa1', '00000000-0000-0000-0000-0000000fd000', 'Toyota');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000fdab1', '00000000-0000-0000-0000-0000000fd000',
   '00000000-0000-0000-0000-0000000fdaa1', 'Corolla');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select ('00000000-0000-0000-0000-0000000fde0' || n)::uuid, '00000000-0000-0000-0000-0000000fd000',
       'TF-0' || n || '-TF', '00000000-0000-0000-0000-0000000fdaa1', '00000000-0000-0000-0000-0000000fdab1'
  from generate_series(1, 6) as n;

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000fdc01', '00000000-0000-0000-0000-0000000fd000', 'Cliente TVDE Fechado');

-- Contratos de teste: (n, viatura, início, regime, data_fim).
--   1 fechado só com o estado
--   2 fechado pelo diálogo, com data
--   3 fechado pelo formulário (estado "Fechado" + data_fim NULL)
--   4 TVDE vivo: a regra nova não lhe toca
--   5 agendado para daqui a dois dias
--   9 rent-a-car: a regra é só de TVDE
create temp table fixture on commit drop as
select * from (values
  (1, 1, timestamptz '2026-09-01 10:00+00', 'tvde',       null::timestamptz),
  (2, 2, timestamptz '2026-09-01 10:00+00', 'tvde',       null::timestamptz),
  (3, 3, timestamptz '2026-09-01 10:00+00', 'tvde',       null::timestamptz),
  (4, 4, timestamptz '2026-09-01 10:00+00', 'tvde',       null::timestamptz),
  (5, 6, now() + interval '2 days',         'tvde',       null::timestamptz),
  (9, 5, timestamptz '2026-09-01 10:00+00', 'rent_a_car', timestamptz '2026-10-01 10:00+00')
) as f(n, v, inicio, regime, fim);

-- reserva_id é obrigatório; 'concluida' porque já virou contrato.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado, regime)
select ('00000000-0000-0000-0000-0000000fdf0' || n)::uuid, '00000000-0000-0000-0000-0000000fd000',
       990800 + n, inicio, ('00000000-0000-0000-0000-0000000fde0' || v)::uuid,
       '00000000-0000-0000-0000-0000000fdc01', 'concluida', regime::public.contrato_regime_enum
  from fixture;

insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias, created_by)
select ('00000000-0000-0000-0000-0000000fd00' || n)::uuid, '00000000-0000-0000-0000-0000000fd000',
       990800 + n, ('00000000-0000-0000-0000-0000000fdf0' || n)::uuid,
       '00000000-0000-0000-0000-0000000fdc01', ('00000000-0000-0000-0000-0000000fde0' || v)::uuid,
       'TF-0' || v || '-TF', inicio, fim,
       case when n = 5 then 'agendado' else 'em_curso' end::public.contrato_estado_operacional_enum,
       'pendente', regime::public.contrato_regime_enum, 23,
       regime = 'tvde',
       case when regime = 'tvde' then 'intervalo_dias' end::public.contrato_renovacao_opcao_enum,
       case when regime = 'tvde' then 30 end,
       '00000000-0000-0000-0000-0000000fda01'
  from fixture;

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
