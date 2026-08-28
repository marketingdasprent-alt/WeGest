-- ============================================================================
-- Barramento de eventos: locking concorrente e eventos envenenados
-- ============================================================================
--
-- Fase 1 do hardening do motor. Fecha os dois problemas mais graves que a
-- auditoria de 2026-08-27 identificou no barramento, ambos confirmados na
-- definição viva de `process_domain_events()`.
--
-- ── PROBLEMA 1: sem locking ─────────────────────────────────────────────────
--
--     for v_event in
--       select * from public.domain_events
--       where processed_at is null
--       order by occurred_at asc
--       limit p_max
--
-- Não há `for update skip locked`. Dois ciclos sobrepostos — e `pg_cron` NÃO
-- serializa execuções do mesmo job — lêem o mesmo lote e processam-no os dois.
-- O índice único de `automation_runs` absorve a duplicação enquanto o run está
-- pendente, mas não depois de concluído, e nada impede logs duplicados em
-- `automation_logs`.
--
-- ── PROBLEMA 2: um evento mau leva o lote inteiro ───────────────────────────
--
-- A função não tem bloco `exception`. Só o insert de `automation_runs` tem, e
-- apenas para `unique_violation`. Qualquer outro erro aborta a transação toda:
-- nenhum dos 50 eventos fica marcado, e como a selecção é
-- `order by occurred_at asc limit 50`, o ciclo seguinte escolhe exactamente o
-- mesmo lote. Um evento envenenado bloqueia o barramento para sempre, sem
-- alarme nenhum.
--
-- ── PORQUE `processed_at` PASSA A SER "TERMINAL" E NÃO "COM SUCESSO" ────────
--
-- Esta é a decisão menos óbvia deste ficheiro, e vem de um facto do sistema:
-- SETE emitters deduplicam com `processed_at is null` — emit_expiry_events,
-- emit_candidaturas_paradas_events, emit_contrato_renting_renovacao_events,
-- emit_faturas_nao_enviadas_events, emit_motoristas_ficha_incompleta_events,
-- emit_reservas_sem_checkin_events e emit_tickets_atrasados_events.
--
-- Se um evento morresse na dead-letter com `processed_at` a NULL, esses
-- emitters continuariam a vê-lo como pendente e **nunca mais emitiriam um
-- evento para aquela entidade**. O evento envenenado deixaria de bloquear o
-- lote para passar a calar a entidade em silêncio — trocar um problema por um
-- pior.
--
-- Por isso `processed_at` é carimbado nos DOIS estados terminais. O que
-- distingue sucesso de morte é a coluna `status` nova. Enquanto o evento ainda
-- vai ser tentado outra vez (pending com backoff), `processed_at` fica NULL e a
-- deduplicação continua a suprimir — que é o correcto: o evento ainda está
-- vivo.
--
-- Efeito lateral aceite: `useAutomationQueueOps.ts` conta processados por
-- `processed_at !== null` e passa a incluir os que morreram. É defensável — o
-- barramento acabou mesmo de os tratar — e as falhas têm o seu próprio sítio,
-- o separador "Falhas" alimentado por `failed_jobs`.
--
-- ── O QUE ESTE FICHEIRO NÃO MUDA ────────────────────────────────────────────
--
-- A lógica de casamento de regras, condições, supressão por aviso em aberto e
-- cooldown é copiada tal e qual da função viva. Este ficheiro muda COMO os
-- eventos são reclamados e o que acontece quando um falha — não o que o motor
-- decide. Reescrever as duas coisas ao mesmo tempo tornaria impossível saber
-- qual delas partiu alguma coisa.
-- ============================================================================

-- ── Estado por evento ───────────────────────────────────────────────────────
alter table public.domain_events
  add column if not exists status          text        not null default 'pending',
  add column if not exists attempt         smallint    not null default 0,
  add column if not exists max_attempts    smallint    not null default 5,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists started_at      timestamptz,
  add column if not exists error_message   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.domain_events'::regclass and conname = 'domain_events_status_check'
  ) then
    alter table public.domain_events
      add constraint domain_events_status_check
      check (status in ('pending', 'processing', 'completed', 'failed'));
  end if;
end $$;

-- Os eventos que já existem e foram tratados nascem como concluídos. Sem isto
-- seriam todos reclamados de novo no primeiro ciclo depois desta migração.
update public.domain_events set status = 'completed' where processed_at is not null and status = 'pending';

create index if not exists idx_domain_events_claimable
  on public.domain_events (next_attempt_at)
  where status = 'pending';

comment on column public.domain_events.status is
  'pending → processing → completed | failed. `processed_at` é carimbado nos dois estados terminais, porque sete emitters deduplicam por `processed_at is null` e um evento morto sem carimbo calaria a entidade para sempre.';

-- ── Reclamar em concorrência ────────────────────────────────────────────────
-- Mesmo idioma de `automation_runs_claim()`, que já está provado em produção:
-- varrimento dos presos primeiro, depois `for update skip locked`.
create or replace function public.domain_events_claim(p_max integer default 50)
returns setof public.domain_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stale record;
begin
  -- Um evento que ficou em `processing` é um worker que morreu a meio. Passa
  -- pela função de falha como qualquer outro, para contar a tentativa e acabar
  -- na dead-letter se insistir.
  for v_stale in
    select id from public.domain_events
    where status = 'processing' and started_at < now() - interval '15 minutes'
  loop
    perform public.domain_events_fail(v_stale.id, 'timeout: processing há mais de 15 minutos');
  end loop;

  return query
  update public.domain_events e
  set status = 'processing',
      started_at = now(),
      attempt = e.attempt + 1
  from (
    select id
    from public.domain_events
    where status = 'pending'
      and next_attempt_at <= now()
    -- `occurred_at`, não `created_at`: preserva a ordem em que os factos
    -- aconteceram, que é a que a função original já usava.
    order by occurred_at asc
    limit p_max
    for update skip locked
  ) reclamados
  where e.id = reclamados.id
  returning e.*;
end;
$$;

create or replace function public.domain_events_complete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.domain_events
  set status = 'completed',
      processed_at = now(),
      error_message = null
  where id = p_id;
end;
$$;

create or replace function public.domain_events_fail(p_id uuid, p_erro text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.domain_events;
begin
  select * into v_ev from public.domain_events where id = p_id for update;
  if not found then
    return;
  end if;

  if v_ev.attempt >= v_ev.max_attempts then
    -- Terminal. `processed_at` é carimbado para libertar a deduplicação dos
    -- emitters — ver o cabeçalho.
    update public.domain_events
    set status = 'failed',
        processed_at = now(),
        error_message = p_erro
    where id = p_id;

    insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
    values ('domain_events', v_ev.id, v_ev.org_id, 'domain_event:' || v_ev.event_type,
            jsonb_build_object(
              'event_type',   v_ev.event_type,
              'entity_table', v_ev.entity_table,
              'entity_id',    v_ev.entity_id,
              'occurred_at',  v_ev.occurred_at,
              'payload',      v_ev.payload
            ),
            v_ev.attempt, p_erro);
  else
    update public.domain_events
    set status = 'pending',
        started_at = null,
        error_message = p_erro,
        next_attempt_at = now() + (power(2, v_ev.attempt) * interval '1 minute')
    where id = p_id;
  end if;
end;
$$;

revoke all on function public.domain_events_claim(integer)    from public, anon, authenticated;
revoke all on function public.domain_events_complete(uuid)    from public, anon, authenticated;
revoke all on function public.domain_events_fail(uuid, text)  from public, anon, authenticated;
grant execute on function public.domain_events_claim(integer)   to service_role;
grant execute on function public.domain_events_complete(uuid)   to service_role;
grant execute on function public.domain_events_fail(uuid, text) to service_role;

-- ── O motor de regras, agora sobre a fila ───────────────────────────────────
create or replace function public.process_domain_events(p_max integer default 50)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event        public.domain_events;
  v_rule         record;
  v_condicao     jsonb;
  v_matches      boolean;
  v_cooldown_ok  boolean;
  v_tipo_legado  text;
  v_link         text;
begin
  for v_event in select * from public.domain_events_claim(p_max)
  loop
    -- Uma sub-transação por evento. É isto que impede um evento envenenado de
    -- levar os outros: o que ele escreveu é revertido, os anteriores ficam.
    begin
      select m.tipo_legado into v_tipo_legado
      from public.notificacao_tipo_map m
      where m.event_type = v_event.event_type;

      v_link := public.notificacao_link_entidade(v_event.entity_table, v_event.entity_id);

      for v_rule in
        select * from public.automation_rules
        where ativo = true
          and org_id = v_event.org_id
          and event_type = v_event.event_type
      loop
        v_matches := true;

        if jsonb_typeof(v_rule.condicoes) = 'array' then
          for v_condicao in select * from jsonb_array_elements(v_rule.condicoes)
          loop
            if v_condicao->>'operador' = '=' then
              if (v_event.payload->>(v_condicao->>'campo')) is distinct from (v_condicao->>'valor') then
                v_matches := false;
              end if;
            elsif v_condicao->>'operador' = '!=' then
              if (v_event.payload->>(v_condicao->>'campo')) is not distinct from (v_condicao->>'valor') then
                v_matches := false;
              end if;
            end if;
          end loop;
        end if;

        if not v_matches then
          insert into public.automation_logs (rule_id, org_id, evento, detalhe)
          values (v_rule.id, v_rule.org_id, 'condicao_nao_satisfeita', jsonb_build_object('event_id', v_event.id));
          continue;
        end if;

        if v_tipo_legado is not null and v_link is not null then
          if exists (
            select 1
            from public.notificacoes n
            where n.org_id = v_event.org_id
              and n.tipo = v_tipo_legado
              and not n.resolvida
              and (n.link = v_link or n.itens @> jsonb_build_array(jsonb_build_object('link', v_link)))
          ) then
            insert into public.automation_logs (rule_id, org_id, evento, detalhe)
            values (v_rule.id, v_rule.org_id, 'ignorada_aviso_em_aberto',
                    jsonb_build_object('event_id', v_event.id, 'tipo', v_tipo_legado, 'link', v_link));
            continue;
          end if;
        end if;

        v_cooldown_ok := true;
        if v_rule.cooldown_minutos > 0 then
          select not exists (
            select 1
            from public.automation_runs r
            where r.rule_id = v_rule.id
              and r.entity_table = v_event.entity_table
              and r.entity_id = v_event.entity_id
              and r.created_at > now() - (v_rule.cooldown_minutos * interval '1 minute')
          ) into v_cooldown_ok;
        end if;

        if not v_cooldown_ok then
          insert into public.automation_logs (rule_id, org_id, evento, detalhe)
          values (v_rule.id, v_rule.org_id, 'ignorada_cooldown', jsonb_build_object('event_id', v_event.id));
          continue;
        end if;

        begin
          insert into public.automation_runs (rule_id, org_id, trigger_event_id, entity_table, entity_id, payload)
          values (v_rule.id, v_rule.org_id, v_event.id, v_event.entity_table, v_event.entity_id, v_event.payload);
        exception when unique_violation then
          null; -- já há um run ativo para esta regra+entidade — nada a fazer.
        end;
      end loop;

      perform public.domain_events_complete(v_event.id);

    exception when others then
      -- Fora da sub-transação revertida: o registo da falha tem de sobreviver.
      perform public.domain_events_fail(v_event.id, sqlerrm);
    end;
  end loop;
end;
$$;

revoke all on function public.process_domain_events(integer) from public, anon, authenticated;
grant execute on function public.process_domain_events(integer) to service_role;
