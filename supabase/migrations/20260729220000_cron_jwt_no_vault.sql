-- ============================================================
-- cron_invocar_edge passa a resolver o JWT do Vault
-- ============================================================
-- PORQUE ISTO É NECESSÁRIO ANTES DE MAIS NADA
-- A versão anterior de cron_invocar_edge resolvia o JWT lendo-o do comando de um
-- dos crons que ainda o tinham inline:
--
--   select (regexp_match(j.command, 'Bearer (ey[...]+)'))[1] from cron.job ...
--
-- Isso foi deliberado (evitava duplicar o token), mas cria uma dependência
-- circular perigosa: os 8 crons com o JWT inline são a ÚNICA fonte de onde o
-- helper o lê. No momento em que esses 8 fossem migrados para usar o helper,
-- nenhum comando teria `Bearer ey...`, a resolução falhava, e os 11 crons de
-- edge function paravam todos ao mesmo tempo — com um erro que só apareceria na
-- primeira execução seguinte.
--
-- Ou seja: dar observabilidade aos 8 crons antigos era impossível sem primeiro
-- cortar esta dependência.
--
-- O QUE MUDA
-- O JWT passa a vir do Vault (`cron_edge_jwt`), com a leitura do comando de um
-- cron a ficar como FALLBACK. Enquanto os 8 crons antigos ainda tiverem o token
-- inline, o comportamento é idêntico ao de antes; depois de migrados, o Vault
-- passa a ser a única fonte e continua a funcionar.
--
-- O segredo é semeado A PARTIR do token que já está em uso, dentro do próprio
-- SQL: o valor não passa por ficheiro nenhum, nem por logs, nem pelas mãos de
-- quem aplica a migração.

-- ── 1. Semear o segredo a partir do que já existe ──────────────────────────
do $$
declare
  v_jwt text;
begin
  if exists (select 1 from vault.secrets where name = 'cron_edge_jwt') then
    raise notice 'cron_edge_jwt já existe no Vault — nada a semear.';
    return;
  end if;

  select (regexp_match(j.command, 'Bearer (ey[A-Za-z0-9._-]+)'))[1]
  into v_jwt
  from cron.job j
  where j.command like '%Bearer ey%'
  order by j.jobid
  limit 1;

  if v_jwt is null then
    raise exception
      'Não foi possível semear cron_edge_jwt: nenhum cron tem o token inline. '
      'Criar o segredo à mão com vault.create_secret(<jwt>, ''cron_edge_jwt'').';
  end if;

  perform vault.create_secret(
    v_jwt,
    'cron_edge_jwt',
    'JWT usado pelos crons para invocar edge functions. Semeado a partir do token que já estava inline nos comandos dos crons.'
  );

  raise notice 'cron_edge_jwt semeado no Vault.';
end;
$$;

-- ── 2. Helper resolve do Vault, com o comportamento antigo como fallback ───
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
  -- Fonte primária: Vault.
  select decrypted_secret into v_jwt
  from vault.decrypted_secrets
  where name = 'cron_edge_jwt';

  -- Fallback: o comando de um cron que ainda tenha o token inline. Mantido para
  -- a transição não ter um instante em que nada resolve; quando os últimos crons
  -- inline forem migrados, este ramo deixa de encontrar nada e o Vault fica a
  -- ser a única fonte.
  if v_jwt is null then
    select (regexp_match(j.command, 'Bearer (ey[A-Za-z0-9._-]+)'))[1]
    into v_jwt
    from cron.job j
    where j.command like '%Bearer ey%'
    order by j.jobid
    limit 1;
  end if;

  if v_jwt is null then
    raise exception
      'cron_invocar_edge: JWT não resolvido. Esperava o segredo cron_edge_jwt no '
      'Vault (nenhum cron tem o token inline para servir de fallback).';
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

comment on function public.cron_invocar_edge(text, text, jsonb, integer) is
  'Invoca uma edge function a partir de um cron, registando a invocação em cron_http_log para poder ser cruzada com net._http_response (ver a vista cron_edge_health). Resolve o JWT do segredo cron_edge_jwt no Vault, com leitura do comando de um cron inline como fallback de transição.';
