-- vigiar_cron_edge() liderava o pg_stat_statements: 283,8 M blocos lidos em 8 012
-- chamadas (~4,8 s cada). O join a net._http_response por id não tem índice e a
-- tabela está inchada (130 MB para ~400 linhas): cada linha do ciclo fazia um seq
-- scan completo. Filtrar por created usa o índice do pg_net e só lê páginas vivas.
-- Uma resposta nunca é anterior à invocação, por isso created > janela é seguro.

CREATE OR REPLACE FUNCTION public.vigiar_cron_edge()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_linha    record;
  v_alertas  integer := 0;
  v_job_type text;
  v_erro     text;
  v_jobs_ok  text[];
begin
  -- Jobs com algum 2xx nos últimos 45 min: falha já recuperada, não se avisa.
  -- Calculado uma vez em vez de um EXISTS por linha.
  select coalesce(array_agg(distinct l2.jobname), '{}')
    into v_jobs_ok
  from public.cron_http_log l2
  join net._http_response r2 on r2.id = l2.request_id
  where l2.invoked_at > now() - interval '45 minutes'
    and r2.created > now() - interval '45 minutes'
    and r2.status_code between 200 and 299;

  for v_linha in
    with resp as materialized (
      select r.id, r.status_code, r.error_msg,
             left(coalesce(r.content, ''), 500) as content
      from net._http_response r
      where r.created > now() - interval '3 hours'
    )
    select l.id, l.jobname, l.url, l.request_id, l.invoked_at,
           r.id as resposta_id, r.status_code, r.error_msg, r.content
    from public.cron_http_log l
    left join resp r on r.id = l.request_id
    where l.alertado_em is null
      and l.invoked_at < now() - interval '2 minutes'
      and l.invoked_at > now() - interval '3 hours'
    order by l.invoked_at
  loop
    if v_linha.resposta_id is null and v_linha.invoked_at > now() - interval '10 minutes' then
      continue;
    end if;

    if v_linha.resposta_id is null then
      v_erro := 'Sem resposta HTTP (timeout ou pedido perdido).';
    elsif v_linha.error_msg is not null then
      v_erro := 'Erro de rede: ' || v_linha.error_msg;
    elsif v_linha.status_code is null or v_linha.status_code >= 300 then
      v_erro := format('HTTP %s - %s',
                       coalesce(v_linha.status_code::text, '?'),
                       coalesce(nullif(v_linha.content, ''), 'sem corpo'));
    else
      update public.cron_http_log set alertado_em = now() where id = v_linha.id;
      continue;
    end if;

    -- Só falha sustentada: um 502 pontual num drain de 5 em 5 min resolve-se no
    -- ciclo seguinte. Jobs raros (bolt-weekly-enqueue) não têm 2xx na janela e
    -- avisam à primeira, como se quer.
    if v_linha.jobname = any (v_jobs_ok) then
      update public.cron_http_log set alertado_em = now() where id = v_linha.id;
      continue;
    end if;

    v_job_type := 'cron_edge:' || v_linha.jobname;

    if not exists (
      select 1 from public.failed_jobs f
      where f.job_type = v_job_type
        and f.resolved = false
        and f.failed_at > now() - interval '6 hours'
    ) then
      insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
      values (
        'cron_http_log',
        gen_random_uuid(),
        public.org_sistema(),
        v_job_type,
        jsonb_build_object(
          'cron_http_log_id', v_linha.id,
          'jobname',          v_linha.jobname,
          'url',              v_linha.url,
          'request_id',       v_linha.request_id,
          'invoked_at',       v_linha.invoked_at,
          'status_code',      v_linha.status_code
        ),
        1,
        format('Cron "%s" falhou a invocar a edge function, e nao recuperou: %s', v_linha.jobname, v_erro)
      );
      v_alertas := v_alertas + 1;
    end if;

    update public.cron_http_log set alertado_em = now() where id = v_linha.id;
  end loop;

  return v_alertas;
end;
$function$;

REVOKE ALL ON FUNCTION public.vigiar_cron_edge() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.vigiar_cron_edge() TO service_role;

NOTIFY pgrst, 'reload schema';
