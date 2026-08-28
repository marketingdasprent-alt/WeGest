-- ============================================================
-- O vigia dos crons passa a avisar só quando a falha não recupera
-- ============================================================
-- A versão de 20260824090000 avisava a qualquer resposta != 2xx. Depois de a
-- pôr a correr, os números do próprio dia mostraram porque é que isso não
-- serve: sete 502 do gateway da Supabase em 24 horas, todos em drains que
-- correm de 5 em 5 minutos e que recuperaram sozinhos no ciclo seguinte.
--
-- Cada um desses teria mandado notificação e email aos admins por um problema
-- já resolvido. É assim que um sistema de alertas morre: as pessoas habituam-se
-- a ignorá-lo, e o dia em que chega o aviso a sério também passa despercebido.
-- Seria repetir a falha que este vigia existe para evitar.
--
-- REGRA NOVA
-- Só avisa se o mesmo job não teve NENHUM 2xx nos últimos 45 minutos.
--
-- Uma regra serve os dois casos, sem excepções:
--   · drain de 5 em 5 min — um 502 isolado é seguido de um 2xx dentro da
--     janela, logo cala-se. Uma avaria a sério dura mais de 45 min e avisa.
--   · bolt-weekly-enqueue, que corre só à segunda — não há 2xx nenhum na
--     janela, logo avisa à primeira. Era o que faltava quando a 401 passou
--     dez dias sem ninguém dar por ela.
--
-- Verificado contra o histórico antes de aplicar: os 6 blips em drains ficam
-- ignorados, a 401 de 24/08 às 06:00 avisa.

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

    -- Recuperou? Então não é problema de ninguém. Marca-se como vista e segue.
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

    -- Arrefecimento de 6 h por job, para uma avaria prolongada não render um
    -- email a cada passagem do vigia.
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
