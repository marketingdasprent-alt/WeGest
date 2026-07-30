-- Recuperada de supabase_migrations.schema_migrations (versão 20260729105451).
-- Foi aplicada em produção sem ficheiro correspondente no repositório, pelo que
-- um clone novo ficava sem o helper E sem os dois agendamentos.
--
-- Seguimento de 20260729170000_crons_outbox_acordos_observabilidade.sql, que
-- criou a tabela cron_http_log e a vista cron_edge_health. Esta acrescenta o
-- helper que os crons chamam e agenda os dois que faltavam.

create or replace function public.cron_invocar_edge(
  p_jobname    text,
  p_funcao     text,
  p_body       jsonb   default '{}'::jsonb,
  p_timeout_ms integer default 60000
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url        text := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/' || p_funcao;
  v_jwt        text;
  v_request_id bigint;
begin
  -- Reutiliza o JWT anonimo que os 9 crons de edge function existentes ja usam,
  -- lendo-o do comando de um deles em vez de o duplicar aqui em texto. Assim ha
  -- uma unica copia no sistema, e rodar a chave nesses crons propaga para aqui.
  select (regexp_match(j.command, 'Bearer (ey[A-Za-z0-9._-]+)'))[1]
  into v_jwt
  from cron.job j
  where j.command like '%Bearer ey%'
  order by j.jobid
  limit 1;

  if v_jwt is null then
    raise exception 'cron_invocar_edge: nao foi possivel resolver o JWT a partir dos crons existentes';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt
    ),
    body := p_body,
    timeout_milliseconds := p_timeout_ms
  ) into v_request_id;

  insert into public.cron_http_log (jobname, url, request_id)
  values (p_jobname, v_url, v_request_id);

  delete from public.cron_http_log where invoked_at < now() - interval '7 days';

  return v_request_id;
end;
$$;

revoke all on function public.cron_invocar_edge(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.cron_invocar_edge(text, text, jsonb, integer) to service_role;

select cron.unschedule('faturacao-outbox-drain')
where exists (select 1 from cron.job where jobname = 'faturacao-outbox-drain');

select cron.schedule(
  'faturacao-outbox-drain',
  '*/5 * * * *',
  $$select public.cron_invocar_edge('faturacao-outbox-drain', 'faturacao-outbox-drain', '{}'::jsonb, 60000)$$
);

select cron.unschedule('acordos-parcelas-diario')
where exists (select 1 from cron.job where jobname = 'acordos-parcelas-diario');

select cron.schedule(
  'acordos-parcelas-diario',
  '0 6 * * *',
  $$select public.cron_invocar_edge('acordos-parcelas-diario', 'acordos-parcelas-diario', '{}'::jsonb, 120000)$$
);
