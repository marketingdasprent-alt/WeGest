-- Voltar a importar a mesma semana substitui, nunca soma.
--
-- Os importadores Uber e Bolt gravam por cima as linhas que voltam a vir, mas
-- deixavam ficar as que já não vêm no ficheiro novo. A 28/09 o ficheiro da
-- Urbango entrou na conta Uber Açores; importar depois o ficheiro certo da
-- Açores não tirava as 18 linhas erradas, e o resumo somava-as.
--
-- Estas funções correm no fim de cada importação (uber-webhook,
-- bolt-import-csv) e apagam, para essa conta e semana, o que veio de ficheiro
-- e não está no ficheiro novo. O que veio da API nunca é tocado.

create or replace function public.uber_substituir_semana_csv(
  p_integracao_id uuid,
  p_periodo text,          -- 'YYYYMMDD-YYYYMMDD', o sufixo das chaves do CSV
  p_uber_driver_ids text[] -- motoristas do ficheiro novo
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_inicio     date;
  v_transacoes int;
  v_resumos    int;
begin
  if p_periodo is null or p_periodo !~ '^\d{8}-\d{8}$' then
    raise exception 'Período inválido: %', p_periodo;
  end if;
  v_inicio := date_trunc('week', to_date(left(p_periodo, 8), 'YYYYMMDD'))::date;

  delete from public.uber_transactions t
   where t.integracao_id = p_integracao_id
     and t.fonte = 'csv'
     and t.uber_transaction_id like ('%-' || p_periodo)
     and not (coalesce(t.uber_driver_id, '') = any (coalesce(p_uber_driver_ids, '{}')));
  get diagnostics v_transacoes = row_count;

  -- O resumo semanal é derivado das transacções, mas o recálculo só insere e
  -- actualiza: a linha de quem saiu tem de sair à mão.
  delete from public.uber_resumos_semanais r
   where r.integracao_id = p_integracao_id
     and r.periodo_inicio = v_inicio
     and r.fonte = 'csv'
     and not (coalesce(r.uber_driver_id, '') = any (coalesce(p_uber_driver_ids, '{}')));
  get diagnostics v_resumos = row_count;

  return jsonb_build_object('transacoes', v_transacoes, 'resumos', v_resumos);
end $$;

create or replace function public.bolt_substituir_semana_csv(
  p_integracao_id uuid,
  p_periodo text,   -- 'YYYY-MM-DD a YYYY-MM-DD', como o importador grava
  p_chaves text[]   -- chave_motorista das linhas gravadas do ficheiro novo
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_apagadas int;
begin
  delete from public.bolt_resumos_semanais b
   where b.integracao_id = p_integracao_id
     and b.periodo = p_periodo
     and b.api_sincronizado_em is null
     and not (coalesce(b.chave_motorista, '') = any (coalesce(p_chaves, '{}')));
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end $$;

revoke all on function public.uber_substituir_semana_csv(uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.bolt_substituir_semana_csv(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.uber_substituir_semana_csv(uuid, text, text[]) to service_role;
grant execute on function public.bolt_substituir_semana_csv(uuid, text, text[]) to service_role;

notify pgrst, 'reload schema';
