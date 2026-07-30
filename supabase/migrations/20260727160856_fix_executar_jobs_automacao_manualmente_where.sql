-- Recuperada de supabase_migrations.schema_migrations (versão 20260727160856).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Fix: o UPDATE em automacao_execucao_manual_lock não tinha WHERE — o
-- projeto tem a extensão safeupdate ativa, que bloqueia isso com
-- SQLSTATE 21000 ("UPDATE requires a WHERE clause"). A tabela só tem uma
-- linha (id boolean primary key), mas precisa de ser qualificada mesmo
-- assim.
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
