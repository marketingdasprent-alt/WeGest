-- ============================================================
-- Bolt: os ganhos do ficheiro importado mandam sobre a API (pgTAP)
-- ============================================================
-- Paga-se pelo ficheiro (Thiago, 2026-10-21). Numa conta ligada pela API o
-- ficheiro escreve os ganhos, e a sincronização da API (que volta a correr à
-- quinta) já não os pisa. Ver a migração 20261021100000.
-- ============================================================

begin;
select plan(14);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000004c0000', 'Org Bolt Ficheiro', 'bolt-ficheiro-teste');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma, auth_mode) values
  ('00000000-0000-0000-0000-0000004c0e01', '00000000-0000-0000-0000-0000004c0000', 'Bolt API', 'bolt', 'oauth');

create temp table semana as select
  '00000000-0000-0000-0000-0000004c0e01'::uuid as integ,
  '00000000-0000-0000-0000-0000004c0000'::uuid as org,
  '2026-10-12'::date as ini, '2026-10-18'::date as fim;

-- Linha da semana de um motorista, para os asserts.
create function pg_temp.r(p_chave text) returns public.bolt_resumos_semanais
language sql as $$
  select * from public.bolt_resumos_semanais
   where integracao_id = '00000000-0000-0000-0000-0000004c0e01' and chave_motorista = p_chave
$$;

-- ── 1. API primeiro, ficheiro depois: manda o ficheiro ────────────────────

select public.bolt_resumo_merge_api(
  (select integ from semana), (select org from semana), (select ini from semana), (select fim from semana),
  p_identificador_motorista => 'drv-a', p_motorista_nome => 'Motorista A',
  p_ganhos_brutos_app => 100, p_comissoes => 25, p_viagens_terminadas => 10,
  p_api_net_earnings => 75);

select is((pg_temp.r('drv-a')).ganhos_liquidos, 75::numeric, 'sem ficheiro, o líquido é o da API');

select public.bolt_resumo_merge_csv(
  (select integ from semana), (select org from semana), (select ini from semana), (select fim from semana),
  jsonb_build_object('identificador_motorista', 'drv-a', 'motorista_nome', 'Motorista A',
    'ganhos_brutos_app', 110, 'ganhos_brutos_dinheiro', 0, 'gorjetas', 2, 'comissoes', 28,
    'total_taxas', 28, 'ganhos_liquidos', 84, 'ganhos_campanha', 0, 'reembolsos_despesas', 0));

select is((pg_temp.r('drv-a')).ganhos_liquidos, 84::numeric, 'o ficheiro escreve o líquido numa conta oauth');
select is((pg_temp.r('drv-a')).fonte_viagens, 'csv', 'a linha fica marcada como do ficheiro');
select is((pg_temp.r('drv-a')).liquido_a_pagar, 84::numeric, 'a pagar = líquido do ficheiro');
select is((pg_temp.r('drv-a')).ganhos_brutos_total, 112::numeric, 'bruto total recalculado com os valores do ficheiro');

-- ── 2. A API volta a correr (quinta): não pisa o ficheiro ─────────────────

select public.bolt_resumo_merge_api(
  (select integ from semana), (select org from semana), (select ini from semana), (select fim from semana),
  p_identificador_motorista => 'drv-a', p_motorista_nome => 'Motorista A',
  p_ganhos_brutos_app => 100, p_comissoes => 25, p_viagens_terminadas => 11,
  p_api_net_earnings => 75);

select is((pg_temp.r('drv-a')).ganhos_liquidos, 84::numeric, 'a API não pisa o líquido do ficheiro');
select is((pg_temp.r('drv-a')).ganhos_brutos_app, 110::numeric, 'a API não pisa o bruto do ficheiro');
select is((pg_temp.r('drv-a')).api_net_earnings, 75::numeric, 'o valor da API fica guardado à parte');
select is((pg_temp.r('drv-a')).viagens_terminadas, 11, 'contagem de viagens continua a vir da API');

-- ── 3. Ficheiro com campanha: não conta a campanha duas vezes ─────────────
-- No ficheiro, o líquido já inclui a campanha (bruto − taxas, bruto com campanha).

select public.bolt_resumo_merge_csv(
  (select integ from semana), (select org from semana), (select ini from semana), (select fim from semana),
  jsonb_build_object('identificador_motorista', 'drv-b', 'motorista_nome', 'Motorista B',
    'ganhos_brutos_app', 100, 'comissoes', 25, 'total_taxas', 25, 'viagens_terminadas', 8,
    'ganhos_campanha', 10, 'ganhos_liquidos', 85, 'reembolsos_despesas', 0));

select is((pg_temp.r('drv-b')).liquido_a_pagar, 85::numeric, 'campanha não é somada outra vez ao líquido do ficheiro');

-- ── 4. Ficheiro primeiro, API depois ──────────────────────────────────────

select public.bolt_resumo_merge_api(
  (select integ from semana), (select org from semana), (select ini from semana), (select fim from semana),
  p_identificador_motorista => 'drv-b', p_motorista_nome => 'Motorista B',
  p_ganhos_brutos_app => 90, p_viagens_terminadas => 7, p_api_net_earnings => 60);

select is((pg_temp.r('drv-b')).ganhos_liquidos, 85::numeric, 'API depois do ficheiro não mexe no líquido');

-- ── 5. Motorista que só está na API ───────────────────────────────────────

select public.bolt_resumo_merge_api(
  (select integ from semana), (select org from semana), (select ini from semana), (select fim from semana),
  p_identificador_motorista => 'drv-c', p_motorista_nome => 'Motorista C',
  p_ganhos_brutos_app => 40, p_viagens_terminadas => 3, p_api_net_earnings => 30);

select is((pg_temp.r('drv-c')).liquido_a_pagar, 30::numeric, 'sem ficheiro, a API continua a preencher');

-- ── 6. Números do ficheiro ────────────────────────────────────────────────

select is(
  array[public.bolt_csv_numero('663.68'), public.bolt_csv_numero('1.234,56'), public.bolt_csv_numero('12,5')],
  array[663.68, 1234.56, 12.5]::numeric[],
  'lê ponto decimal, milhares com vírgula decimal e vírgula decimal'
);

select is(
  array[public.bolt_csv_numero(''), public.bolt_csv_numero('-'), public.bolt_csv_numero(null), public.bolt_csv_numero('abc')],
  array[0, 0, 0, 0]::numeric[],
  'vazio, traço, nulo ou lixo valem 0'
);

select * from finish();
rollback;
