-- Hardening do Motor de Automações (pré-produção) — Prioridade 1.
-- Não redesenha nada: reutiliza 100% as funções e tabelas existentes
-- (automation_runs_fail, notification_queue_fail, failed_jobs,
-- automation_logs, notification_delivery, executar_jobs_automacao_manualmente).

-- ============================================================
-- 1) Falhas silenciosas: o sweep de execuções presas em automation_runs_claim()
--    e notification_queue_claim() marcava status='failed' com um UPDATE
--    direto — sem passar por automation_runs_fail()/notification_queue_fail(),
--    logo sem entrada em automation_logs nem em failed_jobs. Essas execuções
--    ficavam invisíveis no separador "Falhas" do dashboard.
--
--    Fix: o sweep passa a chamar a própria função de falha de cada fila,
--    reaproveitando o retry/backoff/dead-letter já existentes — uma execução
--    presa agora é tratada exatamente como qualquer outra falha.
-- ============================================================

create or replace function public.automation_runs_claim(p_max integer default 10)
returns setof public.automation_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stale record;
begin
  for v_stale in
    select id from public.automation_runs
    where status = 'running' and started_at < now() - interval '15 minutes'
  loop
    perform public.automation_runs_fail(v_stale.id, 'timeout: running há mais de 15 minutos');
  end loop;

  return query
  update public.automation_runs r
  set status = 'running',
      started_at = now(),
      attempt = r.attempt + 1
  from (
    select id
    from public.automation_runs
    where status = 'pending'
      and next_attempt_at <= now()
    order by priority asc, created_at asc
    limit p_max
    for update skip locked
  ) claimed
  where r.id = claimed.id
  returning r.*;
end;
$$;

create or replace function public.notification_queue_claim(p_canal text, p_max integer default 10)
returns setof public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stale record;
begin
  for v_stale in
    select id from public.notification_queue
    where status = 'running' and canal = p_canal and started_at < now() - interval '15 minutes'
  loop
    perform public.notification_queue_fail(v_stale.id, 'timeout: running há mais de 15 minutos');
  end loop;

  return query
  update public.notification_queue q
  set status = 'running',
      started_at = now(),
      attempt = q.attempt + 1
  from (
    select id
    from public.notification_queue
    where status = 'pending'
      and canal = p_canal
      and next_attempt_at <= now()
    order by priority asc, created_at asc
    limit p_max
    for update skip locked
  ) claimed
  where q.id = claimed.id
  returning q.*;
end;
$$;

revoke all on function public.automation_runs_claim(integer) from public, anon, authenticated;
revoke all on function public.notification_queue_claim(text, integer) from public, anon, authenticated;
grant execute on function public.automation_runs_claim(integer) to service_role;
grant execute on function public.notification_queue_claim(text, integer) to service_role;

-- ------------------------------------------------------------
-- 1b) Dívida técnica relacionada: automation_runs_complete(uuid) (sem
--     detalhe/duracao_ms) nunca foi removida quando
--     automation_runs_complete(uuid, jsonb default '{}') a substituiu —
--     as duas assinaturas coexistiam. Uma chamada com 1 argumento
--     resolve para a versão antiga (sem detalhe nem duração), o que
--     silenciosamente empobrece os logs desse caminho (ex.: regras com
--     acao_tipo <> 'notificacao'). Remove-se a sombra; a versão com
--     jsonb default cobre os mesmos call-sites sem quebrar nada.
drop function if exists public.automation_runs_complete(uuid);

-- ============================================================
-- 2) Ciclo de entrega Brevo: notification_delivery já existe com o
--    desenho certo (status + *_em por marco), só faltava alguém
--    escrever lá a partir do webhook. Alarga o vocabulário de status
--    para cobrir os estados reais do Brevo que ainda não tinham
--    representação (diferido/devolvido/spam/bloqueado) — sem criar
--    tabela nova nem colunas novas.
-- ============================================================

alter table public.notification_delivery drop constraint if exists notification_delivery_status_check;
alter table public.notification_delivery add constraint notification_delivery_status_check
  check (status in ('enviado', 'entregue', 'aberto', 'clicado', 'falhado', 'diferido', 'devolvido', 'spam', 'bloqueado'));

-- ============================================================
-- 3) "Correr Agora": executar_jobs_automacao_manualmente() só chamava
--    3 dos 9 emitters existentes (ficou desatualizado a cada emitter
--    novo). Passa a descobrir TODOS os emitters por convenção de nome
--    (emit_...) via introspecção do catálogo do Postgres, em vez de uma
--    lista hardcoded — um emitter novo fica automaticamente incluído,
--    sem precisar de tocar nesta função outra vez. Lock de 5 min e
--    verificação de permissão mantidos tal e qual.
-- ============================================================

create or replace function public.executar_jobs_automacao_manualmente()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock public.automacao_execucao_manual_lock;
  v_intervalo constant interval := interval '5 minutes';
  v_restante interval;
  v_func record;
  v_emitters_executados text[] := '{}';
begin
  if not (is_current_user_admin() or can_edit(auth.uid(), 'automacoes')) then
    raise exception 'Sem permissão para correr as automações manualmente.';
  end if;

  select * into v_lock from public.automacao_execucao_manual_lock for update;

  if v_lock.ultima_execucao_em is not null and now() - v_lock.ultima_execucao_em < v_intervalo then
    v_restante := v_intervalo - (now() - v_lock.ultima_execucao_em);
    raise exception 'Já correu há pouco — aguarda mais % antes de repetir.', to_char(v_restante, 'MI:SS');
  end if;

  update public.automacao_execucao_manual_lock
  set ultima_execucao_em = now(), executado_por = auth.uid()
  where id = true;

  for v_func in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'emit\_%'
      and p.pronargs = 0
    order by p.proname
  loop
    execute format('select public.%I()', v_func.proname);
    v_emitters_executados := array_append(v_emitters_executados, v_func.proname);
  end loop;

  perform public.process_domain_events();
  perform public.execute_automation_runs();
  perform public.enviar_digests_diarios();

  return jsonb_build_object(
    'success', true,
    'executado_em', now(),
    'emitters_executados', to_jsonb(v_emitters_executados)
  );
end;
$$;

revoke all on function public.executar_jobs_automacao_manualmente() from public, anon;
grant execute on function public.executar_jobs_automacao_manualmente() to authenticated;
