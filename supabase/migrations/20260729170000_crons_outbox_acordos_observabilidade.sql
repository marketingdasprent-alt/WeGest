-- ============================================================
-- Crons em falta (faturacao-outbox-drain, acordos-parcelas-diario)
-- + observabilidade real das invocações de edge functions
-- ============================================================
-- PROBLEMA 1 — duas funções entregues sem consumidor.
-- `faturacao-outbox-drain` e `acordos-parcelas-diario` foram deployadas a
-- 2026-07-28 e nunca tiveram cron nenhum. A primeira é a fila de retry com
-- chave de idempotência da emissão de faturas: enquanto ninguém a drena, tudo
-- o que lá entrar fica indefinidamente, sem erro visível. Está vazia hoje —
-- é a janela certa para ligar o consumidor, antes de custar dinheiro.
-- É o mesmo padrão do incidente TVDE de 14/07 (migração entregue, consumidor
-- nunca actualizado), apanhado antes de ter consequência.
--
-- Cadência: a documentada no cabeçalho de cada função, não inventada.
--   faturacao-outbox-drain   "Corre a cada 5 minutos (pg_cron)"  → */5 * * * *
--   acordos-parcelas-diario  "Worker diário", 5 passos idempotentes
--                            derivados do estado actual → 0 6 * * *
-- Ambas validadas manualmente antes de agendar: HTTP 200, ~0,5 s, sem erros.
--
-- PROBLEMA 2 — as invocações de edge function são invisíveis.
-- `net.http_post` devolve um request_id imediatamente, por isso
-- `cron.job_run_details` marca 'succeeded' assim que o pedido é enfileirado.
-- Medido a 2026-07-29: de 194 invocações, 126 bateram no timeout de 5000 ms
-- por omissão e 2 devolveram 502 — 66% de falhas, todas registadas como
-- sucesso. E não há como saber quais: `cron.job_run_details.return_message` é
-- só "1 row" (não guarda o request_id) e `net.http_request_queue`, a única
-- tabela com o url, é drenada quando o pedido termina. As 194 respostas em
-- `net._http_response` são órfãs.
--
-- Solução: registar o request_id no momento da invocação, o que permite juntar
-- mais tarde à resposta real. Aplicado APENAS aos dois crons novos — os 9
-- existentes ficam intactos de propósito (são crons de produção a funcionar;
-- migrá-los é uma alteração à parte, revisível por si).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Registo de invocações
-- ------------------------------------------------------------
-- Sem org_id de propósito: é infraestrutura global (qual cron chamou qual
-- função, quando), não dado de tenant. Acrescentada à allowlist da PARTE 2 de
-- supabase/tests/rls_org_audit.sql para a auditoria não a sinalizar.
create table if not exists public.cron_http_log (
  id           bigserial primary key,
  jobname      text        not null,
  url          text        not null,
  request_id   bigint      not null,
  invoked_at   timestamptz not null default now()
);

create index if not exists idx_cron_http_log_invoked_at
  on public.cron_http_log (invoked_at desc);

comment on table public.cron_http_log is
  'Request_id de cada invocação de edge function por cron, para correlacionar com net._http_response. Sem isto, cron.job_run_details reporta sucesso mesmo quando a função falha (ver migração 20260729170000).';

-- Infraestrutura, não dado de tenant: ninguém lê isto pela app excepto admins
-- no diagnóstico. RLS activa com política admin-only — nunca alcançável por
-- anon (a PARTE 3 de rls_org_audit.sql falha se alguma vez o for).
alter table public.cron_http_log enable row level security;

drop policy if exists cron_http_log_select_admin on public.cron_http_log;
create policy cron_http_log_select_admin on public.cron_http_log
  for select
  to authenticated
  using (public.is_current_user_admin());

-- O Supabase dá automaticamente grants a anon/authenticated em toda a tabela
-- nova de `public`. A RLS acima já bloqueia a leitura anónima (verificado: 0
-- linhas), mas deixar o GRANT é precisamente o padrão "arma carregada" que
-- causou a fuga de 20260729160000 — bastava uma política permissiva mal escrita
-- para abrir. Esta tabela nunca tem público: retira-se o grant.
revoke all on public.cron_http_log from anon;

-- ------------------------------------------------------------
-- 2. Helper de invocação
-- ------------------------------------------------------------
-- Faz o net.http_post, guarda o request_id e devolve-o. O timeout é explícito
-- porque o valor por omissão do pg_net (5000 ms) é a causa dos 126 timeouts
-- medidos — estas funções fazem trabalho sequencial e não respondem em 5 s.
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
  -- As funções têm verify_jwt=true, por isso a chamada precisa de um JWT. Os 9
  -- crons de edge function existentes têm o JWT anónimo escrito em texto no
  -- próprio comando — algo que esta auditoria aponta como defeito (11 ocorrências).
  -- Em vez de acrescentar uma 12.ª cópia, resolve-se a partir de um deles: há uma
  -- única cópia no sistema, e rodar a chave nesses crons propaga-se para aqui.
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

  -- Retenção: o pg_net também limpa net._http_response periodicamente, por isso
  -- guardar mais do que isso não acrescenta nada. Barato — a tabela nunca passa
  -- de alguns milhares de linhas e invoked_at está indexado.
  delete from public.cron_http_log where invoked_at < now() - interval '7 days';

  return v_request_id;
end;
$$;

revoke all on function public.cron_invocar_edge(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.cron_invocar_edge(text, text, jsonb, integer) to service_role;

-- ------------------------------------------------------------
-- 3. Vista de diagnóstico
-- ------------------------------------------------------------
-- Responde à pergunta que hoje não tem resposta: "os meus crons estão a
-- funcionar?". `security_invoker` para a RLS de cron_http_log continuar a
-- aplicar-se (mesmo padrão das vistas de automacao_timeline_views).
create or replace view public.cron_edge_health
with (security_invoker = true) as
select
  l.jobname,
  l.invoked_at,
  l.url,
  r.status_code,
  r.timed_out,
  r.error_msg,
  case
    when r.id is null       then 'sem resposta registada'
    when r.timed_out        then 'TIMEOUT'
    when r.status_code between 200 and 299 then 'ok'
    else 'ERRO HTTP ' || r.status_code::text
  end as resultado
from public.cron_http_log l
left join net._http_response r on r.id = l.request_id
order by l.invoked_at desc;

comment on view public.cron_edge_health is
  'Resultado REAL das invocações de edge function por cron. cron.job_run_details reporta sempre sucesso porque net.http_post é assíncrono; esta vista mostra o status HTTP e os timeouts.';

-- ------------------------------------------------------------
-- 4. Os dois crons
-- ------------------------------------------------------------
select cron.unschedule('faturacao-outbox-drain')
where exists (select 1 from cron.job where jobname = 'faturacao-outbox-drain');

select cron.schedule(
  'faturacao-outbox-drain',
  '*/5 * * * *',
  $$select public.cron_invocar_edge('faturacao-outbox-drain', 'faturacao-outbox-drain', '{}'::jsonb, 60000)$$
);

select cron.unschedule('acordos-parcelas-diario')
where exists (select 1 from cron.job where jobname = 'acordos-parcelas-diario');

-- 06:00 UTC: antes do bloco das 08:00 (8 emitters de automação) e das 09:00
-- (digest), para os avisos de vencimento saírem no início da manhã.
select cron.schedule(
  'acordos-parcelas-diario',
  '0 6 * * *',
  $$select public.cron_invocar_edge('acordos-parcelas-diario', 'acordos-parcelas-diario', '{}'::jsonb, 120000)$$
);
