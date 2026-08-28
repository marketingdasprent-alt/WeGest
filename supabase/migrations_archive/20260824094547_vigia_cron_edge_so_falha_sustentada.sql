-- ⚠️ RECUPERADA de supabase_migrations.schema_migrations (2026-08-28).
-- Aplicada a produção a 2026-08-24 sem ficheiro no repositório. O SQL abaixo é
-- o original registado em `statements`.
--
-- Não confundir com 20260824093000_vigia_cron_edge_falha_sustentada.sql, que
-- está no repositório: os nomes diferem num "so_" e esta é a versão que
-- produção tem viva.
create or replace function public.vigiar_cron_edge()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_linha    record;
  v_alertas  integer := 0;
  v_job_type text;
  v_erro     text;
begin
  for v_linha in
    select l.id, l.jobname, l.url, l.request_id, l.invoked_at,
           r.id as resposta_id, r.status_code, r.error_msg,
           left(coalesce(r.content, ''), 500) as content
    from public.cron_http_log l
    left join net._http_response r on r.id = l.request_id
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

    -- SO FALHA SUSTENTADA. Um 502 do gateway da Supabase num drain de 5 em 5
    -- minutos resolve-se sozinho no ciclo seguinte; avisar sobre isso treina
    -- toda a gente a ignorar os emails, e entao o aviso a serio tambem passa
    -- despercebido. Se o mesmo job teve algum 2xx na ultima meia hora e tal,
    -- a falha ja passou: marca-se como vista e nao se avisa.
    --
    -- A mesma regra serve os jobs raros sem excepcao nenhuma: o
    -- bolt-weekly-enqueue so corre a segunda, portanto nao ha 2xx nenhum na
    -- janela e o aviso sai a primeira. E o que se queria nos dois casos.
    if exists (
      select 1
      from public.cron_http_log l2
      join net._http_response r2 on r2.id = l2.request_id
      where l2.jobname = v_linha.jobname
        and l2.invoked_at > now() - interval '45 minutes'
        and r2.status_code between 200 and 299
    ) then
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
$fn$;

comment on function public.vigiar_cron_edge() is
  'Regista em failed_jobs as invocacoes cron->edge que falharam E nao recuperaram (sem nenhum 2xx do mesmo job nos ultimos 45 min). Ignora blips transitorios para o alerta nao virar ruido.';

revoke all on function public.vigiar_cron_edge() from public, anon, authenticated;
