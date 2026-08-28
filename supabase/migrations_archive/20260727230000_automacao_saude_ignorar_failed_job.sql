-- Motor de Automação — saúde por canal (para a tab Visão Geral/Saúde do
-- Sistema) e ação "Ignorar" na tab Falhas (marca resolvido sem reexecutar,
-- ao contrário de retry_failed_job). Mesmo padrão de permissão de
-- 20260727170000_retry_failed_job.sql — SECURITY DEFINER chamado
-- diretamente pelo browser, por isso verifica permissão e organização
-- explicitamente no corpo.
-- Ver docs/superpowers/plans/2026-07-27-automacao-dashboard-redesign.md.

create view public.automacao_saude_canais
with (security_invoker = true) as
select
  nq.org_id,
  nq.canal,
  count(*) filter (where nq.status = 'failed' and nq.created_at > now() - interval '1 hour') as falhas_ultima_hora,
  count(*) filter (where nq.status = 'sent' and nq.created_at > now() - interval '1 hour') as enviados_ultima_hora,
  avg(extract(epoch from (nd.enviado_em - nq.created_at)) * 1000)
    filter (where nq.created_at > now() - interval '24 hours' and nd.enviado_em is not null) as tempo_resposta_medio_ms
from public.notification_queue nq
left join public.notification_delivery nd on nd.notification_queue_id = nq.id
group by nq.org_id, nq.canal;

comment on view public.automacao_saude_canais is 'Saúde por canal de envio nas últimas 1h/24h — falhas, envios, tempo médio de resposta. Para a tab Visão Geral do dashboard admin.';

create or replace function public.ignorar_failed_job(p_id uuid)
returns public.failed_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.failed_jobs;
begin
  if not (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes')) then
    raise exception 'sem permissão para ignorar jobs falhados';
  end if;

  select * into v_job from public.failed_jobs where id = p_id for update;

  if v_job.id is null then
    raise exception 'failed_job % não encontrado', p_id;
  end if;

  if v_job.org_id <> public.get_current_org_id() then
    raise exception 'sem permissão para ignorar jobs falhados de outra organização';
  end if;

  update public.failed_jobs
  set resolved = true, resolved_by = auth.uid(), resolved_at = now(), resolution_note = 'ignorado manualmente'
  where id = p_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.ignorar_failed_job(uuid) from public, anon;
grant execute on function public.ignorar_failed_job(uuid) to authenticated;
