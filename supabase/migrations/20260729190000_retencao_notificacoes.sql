-- ============================================================
-- Retenção de notificações — nada apagava nada
-- ============================================================
-- Verificado a 2026-07-29 em produção: zero crons de limpeza, zero funções de
-- limpeza. As duas tabelas crescem sem limite:
--
--   notificacoes (legada)  7171 linhas · 2026-06-08 → hoje · 1991 resolvidas
--   notifications (nova)   8786 linhas · 2026-07-27 → hoje ·    0 resolvidas
--
-- A nova cresce ~2900/dia (≈1M/ano) e tem ZERO resolvidas porque nenhum
-- componente do frontend a lê — o dual-write escreve lá, o utilizador resolve
-- na legada. Enquanto o cutover não estiver feito, é acumulação write-only.
--
-- O QUE ESTA MIGRAÇÃO FAZ, E O QUE DELIBERADAMENTE NÃO FAZ
-- Apaga apenas notificações **resolvidas** com mais de 30 dias. Uma notificação
-- resolvida é, por definição, um assunto tratado — o histórico de quem resolveu
-- o quê continua em contrato_historico/automation_logs, que têm outra função e
-- outra retenção.
--
-- NÃO apaga notificações não-resolvidas, a nenhuma idade. Um aviso de seguro a
-- expirar que ninguém tratou é precisamente o que o sistema existe para não
-- deixar cair; apagá-lo por ser antigo seria esconder a falha em vez de a
-- mostrar. O volume de não-resolvidas resolve-se na origem, agrupando na
-- criação (migração seguinte) — não a apagar depois.
--
-- Hoje isto remove 16 linhas. É preventivo: sem ele, a tabela nunca deixa de
-- crescer, e a limpeza torna-se um problema quando já for grande.
-- ============================================================

create or replace function public.limpar_notificacoes_antigas(
  p_dias_resolvidas integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corte        timestamptz := now() - make_interval(days => p_dias_resolvidas);
  v_legadas      integer;
  v_novas        integer;
begin
  -- Só resolvidas. O `not resolvida` nunca é tocado — ver cabeçalho.
  delete from public.notificacoes
  where resolvida = true and created_at < v_corte;
  get diagnostics v_legadas = row_count;

  delete from public.notifications
  where resolvida = true and created_at < v_corte;
  get diagnostics v_novas = row_count;

  return jsonb_build_object(
    'notificacoes_apagadas', v_legadas,
    'notifications_apagadas', v_novas,
    'corte', v_corte,
    'dias', p_dias_resolvidas
  );
end;
$$;

comment on function public.limpar_notificacoes_antigas(integer) is
  'Apaga notificações RESOLVIDAS com mais de N dias (default 30). Nunca apaga não-resolvidas — o volume dessas resolve-se agrupando na criação, não apagando.';

-- Só o cron (service_role) corre isto. Um utilizador autenticado não apaga
-- notificações em massa, nem por acidente nem de propósito.
revoke all on function public.limpar_notificacoes_antigas(integer) from public, anon, authenticated;
grant execute on function public.limpar_notificacoes_antigas(integer) to service_role;

-- 04:00 UTC: fora do bloco de emissão de eventos (08:00), do digest (09:00) e
-- do worker de acordos (06:00), para a limpeza nunca competir com escritas.
select cron.unschedule('limpar-notificacoes-antigas')
where exists (select 1 from cron.job where jobname = 'limpar-notificacoes-antigas');

select cron.schedule(
  'limpar-notificacoes-antigas',
  '0 4 * * *',
  $$select public.limpar_notificacoes_antigas()$$
);
