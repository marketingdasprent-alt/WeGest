-- Item 12/13 da lista do chefe: "Alerta de falha de sincronização Via
-- Verde". A própria migração do item 1 (20260728140000_alerta_failed_jobs.sql)
-- já dizia explicitamente: "Sync do Bolt/Uber/Repsol/EDP e Via Verde
-- ficam fora deste MVP (item separado da lista)" — este é esse item.
--
-- A integração Via Verde já existe por completo (via-verde-scheduled-sync,
-- via-verde-sync-drain, robot-execute/robot-webhook), com falhas
-- rastreadas em via_verde_sync_queue.status='failed' + error_message —
-- mas sem NENHUM aviso, exatamente o mesmo buraco que o item 1 fechou
-- para failed_jobs. Reutiliza-se 100% o mecanismo do item 1: um
-- trigger insere em failed_jobs quando uma linha da fila Via Verde
-- passa a 'failed', e o handle_failed_job_notify() já existente trata
-- do resto (notificação aos admins da org + email técnico), sem
-- precisar de mexer no motor de regras/cargo (mesma razão do item 1:
-- é um alerta técnico, não configurável por grupo).

create or replace function public.handle_via_verde_sync_failed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'failed' and old.status is distinct from 'failed' then
    insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
    values (
      'via_verde_sync_queue',
      new.id,
      new.org_id,
      'via_verde_sync',
      jsonb_build_object(
        'integracao_id', new.integracao_id,
        'periodo_inicio', new.periodo_inicio,
        'periodo_fim', new.periodo_fim
      ),
      1,
      coalesce(new.error_message, 'Sem detalhe')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_via_verde_sync_failed on public.via_verde_sync_queue;
create trigger on_via_verde_sync_failed
after update on public.via_verde_sync_queue
for each row execute function public.handle_via_verde_sync_failed();
