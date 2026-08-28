-- ============================================================
-- Vigia dos crons de edge function: uma falha HTTP passa a avisar
-- ============================================================
-- O QUE CORREU MAL
-- O cron `bolt-weekly-enqueue` corre à segunda às 06:00 desde 5 de Agosto e
-- NUNCA enfileirou nada. A edge function respondia 401 "Sessão inválida." e
-- ninguém soube: o pg_cron marcava o job como `succeeded` (o job correu, de
-- facto — o que falhou foi o pedido HTTP que ele dispara) e o 401 ficava
-- enterrado em net._http_response. As 343 linhas que a fila do Bolt tem até
-- hoje são TODAS `origem = 'manual'` — alguém a carregar em "Atualizar".
--
-- A causa da 401 é outra e resolve-se fora daqui (ver nota no fim): o Vault só
-- tem `cron_edge_jwt`, que é a chave ANON — semeada em 20260729220000 a partir
-- do token que estava inline nos crons antigos. O bolt-sync-agendado exige
-- service-role. Esta migração não corrige isso; corrige o facto de termos
-- levado dez dias a descobrir.
--
-- O QUE ESTA MIGRAÇÃO FAZ
-- A migração 20260729230000 já dava observabilidade (cron_http_log + vista
-- cron_edge_health), mas era um ecrã que alguém tinha de ir espreitar. Aqui
-- fecha-se o ciclo: um vigia de 10 em 10 minutos cruza cron_http_log com
-- net._http_response e, perante um estado != 2xx, escreve em public.failed_jobs
-- — que já tem trigger a avisar os admins por notificação e email
-- (20260728140000). Essa migração deixou explicitamente os syncs de fora do
-- MVP; é essa lacuna que se fecha agora.
--
-- Idempotente e aditiva: pode correr-se de novo sem efeito.
--
-- COMO APLICAR: colar no SQL Editor. Este projeto não tem o CLI da Supabase
-- instalado e o histórico de migrações foi sempre aplicado à mão — um
-- `supabase db push` tentaria reconciliar a pasta inteira contra a produção.

-- ── 1. Marca de "já visto" ────────────────────────────────────────────────
-- Sem isto o vigia re-analisava as mesmas linhas a cada passagem e voltava a
-- alertar sobre a mesma falha de dez em dez minutos.
alter table public.cron_http_log
  add column if not exists alertado_em timestamptz;

create index if not exists idx_cron_http_log_por_alertar
  on public.cron_http_log (invoked_at)
  where alertado_em is null;

-- ── 2. Org que recebe os alertas técnicos ─────────────────────────────────
-- failed_jobs.org_id é NOT NULL, mas uma falha de cron→edge é da plataforma,
-- não de um inquilino. Vai para a org dona da instalação. Isolado numa função
-- para haver um único sítio a mudar quando isto deixar de ser verdade.
create or replace function public.org_sistema()
returns uuid
language sql
immutable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

comment on function public.org_sistema() is
  'Org que recebe alertas técnicos da plataforma (falhas de cron, etc.). Não é um inquilino como os outros.';

-- ── 3. O vigia ────────────────────────────────────────────────────────────
create or replace function public.vigiar_cron_edge()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha    record;
  v_alertas  integer := 0;
  v_job_type text;
  v_erro     text;
begin
  for v_linha in
    select l.id,
           l.jobname,
           l.url,
           l.request_id,
           l.invoked_at,
           r.id           as resposta_id,
           r.status_code,
           r.error_msg,
           left(coalesce(r.content, ''), 500) as content
    from public.cron_http_log l
    left join net._http_response r on r.id = l.request_id
    where l.alertado_em is null
      -- Margem de 2 min: o pg_net é assíncrono, a resposta ainda pode estar a
      -- caminho. E limite de 3 h porque o pg_net limpa _http_response ao fim
      -- de ~6 h — passado esse ponto "sem resposta" deixa de querer dizer
      -- "falhou" e passa a querer dizer "já não sabemos".
      and l.invoked_at < now() - interval '2 minutes'
      and l.invoked_at > now() - interval '3 hours'
    order by l.invoked_at
  loop
    -- Ainda sem linha de resposta e recente: deixa para a próxima passagem,
    -- sem marcar. Só ao fim de 10 min é que a ausência conta como falha.
    if v_linha.resposta_id is null and v_linha.invoked_at > now() - interval '10 minutes' then
      continue;
    end if;

    if v_linha.resposta_id is null then
      v_erro := 'Sem resposta HTTP (timeout ou pedido perdido).';
    elsif v_linha.error_msg is not null then
      v_erro := 'Erro de rede: ' || v_linha.error_msg;
    elsif v_linha.status_code is null or v_linha.status_code >= 300 then
      v_erro := format('HTTP %s — %s',
                       coalesce(v_linha.status_code::text, '?'),
                       coalesce(nullif(v_linha.content, ''), 'sem corpo'));
    else
      -- Correu bem: marca e segue.
      update public.cron_http_log set alertado_em = now() where id = v_linha.id;
      continue;
    end if;

    v_job_type := 'cron_edge:' || v_linha.jobname;

    -- Arrefecimento de 6 h por job. Um cron de 5 em 5 minutos que parta
    -- geraria 288 alertas por dia; o primeiro chega, os seguintes ficam
    -- registados no cron_http_log e caem na vista cron_edge_health.
    if not exists (
      select 1 from public.failed_jobs f
      where f.job_type = v_job_type
        and f.resolved = false
        and f.failed_at > now() - interval '6 hours'
    ) then
      insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
      values (
        'cron_http_log',
        gen_random_uuid(),   -- cron_http_log.id é bigint; o valor real vai no payload
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
        format('Cron "%s" falhou a invocar a edge function: %s', v_linha.jobname, v_erro)
      );
      v_alertas := v_alertas + 1;
    end if;

    update public.cron_http_log set alertado_em = now() where id = v_linha.id;
  end loop;

  return v_alertas;
end;
$$;

comment on function public.vigiar_cron_edge() is
  'Cruza cron_http_log com net._http_response e regista em failed_jobs cada invocação de edge function que não devolveu 2xx. O trigger de failed_jobs avisa os admins.';

revoke all on function public.vigiar_cron_edge() from public, anon, authenticated;

-- ── 4. Agendar ────────────────────────────────────────────────────────────
select cron.unschedule('vigia-cron-edge')
where exists (select 1 from cron.job where jobname = 'vigia-cron-edge');

select cron.schedule(
  'vigia-cron-edge',
  '*/10 * * * *',
  $$select public.vigiar_cron_edge()$$
);

-- ── 5. Não alertar sobre o passado ────────────────────────────────────────
-- As linhas anteriores a esta migração já foram diagnosticadas à mão. Sem
-- isto, a primeira passagem despejava o histórico das últimas 3 h em cima dos
-- admins.
update public.cron_http_log
set alertado_em = now()
where alertado_em is null;

-- ============================================================
-- A 401 em si — resolvida a 24/08/2026, fora desta migração
-- ============================================================
-- O Vault tinha só `cron_edge_jwt` (chave anon) e faltava-lhe
-- `cron_service_role_jwt`, que é o que o bolt-sync-agendado exige. Criado à
-- mão no SQL Editor nesse dia:
--
--   select vault.create_secret('<chave>', 'cron_service_role_jwt', '...');
--
-- A chave não está em ficheiro nenhum do repositório — vive cifrada no Vault e
-- o cron_invocar_edge lê-a de vault.decrypted_secrets já dentro do Postgres.
-- Prefere-a ao anon automaticamente; não foi preciso mexer em mais nada.
--
-- Confirmado: invocação de teste a 24/08 devolveu 200 com "enfileiradas: 1",
-- onde às 06:00 desse mesmo dia tinha devolvido 401.
--
-- Se algum dia esta chave for rodada, o segredo tem de ser reescrito — e é
-- agora o vigia acima que dá pelo problema no mesmo dia, não dez dias depois.
