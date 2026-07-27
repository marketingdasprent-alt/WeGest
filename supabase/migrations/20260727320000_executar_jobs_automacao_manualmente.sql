-- Botão "Correr agora" na página de Automação: permite a um admin/gestor
-- disparar manualmente os scans/executor do motor, em vez de esperar o
-- próximo ciclo do cron (diário às 8h para os scans, 5 em 5 min para o
-- Rule Engine/Executor). Inclui um rate limit global (não é por
-- organização — os próprios scans já são globais) para impedir cliques
-- repetidos de sobrecarregar o sistema.

create table if not exists public.automacao_execucao_manual_lock (
  id boolean primary key default true check (id),
  ultima_execucao_em timestamptz,
  executado_por uuid references auth.users(id) on delete set null
);

insert into public.automacao_execucao_manual_lock (id)
values (true)
on conflict (id) do nothing;

-- RLS ativa, sem nenhuma policy: ninguém lê/escreve esta tabela
-- diretamente pelo cliente — só a RPC abaixo (SECURITY DEFINER) lhe toca.
alter table public.automacao_execucao_manual_lock enable row level security;

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

  perform public.emit_expiry_events();
  perform public.emit_contrato_renting_renovacao_events();
  perform public.emit_lembretes_cobranca_atrasada();
  perform public.process_domain_events();
  perform public.execute_automation_runs();

  return jsonb_build_object('success', true, 'executado_em', now());
end;
$$;

revoke all on function public.executar_jobs_automacao_manualmente() from public, anon;
grant execute on function public.executar_jobs_automacao_manualmente() to authenticated;
