-- Motor de Automação — Fase 2, Sub-projeto 8: RPC de retry manual para o
-- dashboard admin. Primeira função do motor de automação chamada
-- diretamente pelo browser (authenticated), não pelo service_role — por
-- isso verifica permissão e organização explicitamente no corpo, já que
-- SECURITY DEFINER não herda as RLS policies do chamador nas suas
-- próprias leituras internas.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-dashboard-admin.md.

create or replace function public.retry_failed_job(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.failed_jobs;
begin
  if not (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes')) then
    raise exception 'sem permissão para reagendar jobs falhados';
  end if;

  select * into v_job from public.failed_jobs where id = p_id for update;

  if v_job.id is null then
    raise exception 'failed_job % não encontrado', p_id;
  end if;

  if v_job.org_id is not null and v_job.org_id <> public.get_current_org_id() then
    raise exception 'sem permissão para reagendar jobs falhados de outra organização';
  end if;

  if v_job.source_table = 'automation_runs' then
    update public.automation_runs
    set status = 'pending', attempt = 0, next_attempt_at = now(), error_message = null
    where id = v_job.source_id;
  elsif v_job.source_table = 'notification_queue' then
    update public.notification_queue
    set status = 'pending', attempt = 0, next_attempt_at = now(), error_message = null
    where id = v_job.source_id;
  else
    raise exception 'source_table % desconhecido', v_job.source_table;
  end if;

  update public.failed_jobs
  set resolved = true, resolved_by = auth.uid(), resolved_at = now(), resolution_note = 'reagendado manualmente'
  where id = p_id;
end;
$$;

grant execute on function public.retry_failed_job(uuid) to authenticated;
