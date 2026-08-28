-- ============================================================
-- Barramento de eventos — claim, retry e eventos envenenados (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre a Fase 1 do hardening: reclamar eventos sem os duplicar, e um evento
-- que rebenta não levar consigo os que estão no mesmo lote.
--
-- ── O QUE ESTE FICHEIRO NÃO PROVA ───────────────────────────────────────────
-- O pgTAP corre numa única sessão, portanto NÃO é possível aqui pôr dois
-- workers a competir de verdade pelo mesmo evento. O que se testa é a garantia
-- OBSERVÁVEL: depois de reclamado, o evento sai do conjunto reclamável, logo
-- uma segunda chamada não o devolve.
--
-- O `for update skip locked` propriamente dito está a ser usado no mesmo
-- idioma de `automation_runs_claim()`, que corre em produção desde Julho. Uma
-- prova real de concorrência precisa de duas sessões — dblink ou um teste de
-- carga — e fica registada como lacuna conhecida em
-- docs/motor-automacao/reconstrucao-migracoes.md.
-- ============================================================

begin;
select plan(11);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000e0000', 'Org Barramento', 'barramento-a');

-- Regra que casa com todos os eventos de teste, para o caminho percorrido ser
-- o real (criar automation_runs) e não um atalho.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004e0001', '00000000-0000-0000-0000-0000000e0000',
   'teste.barramento', 'Regra Barramento', 'teste.barramento', 'notificacao',
   '{"template_codigo":"teste.template","titulo":"Titulo de Teste"}'::jsonb);

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0000', 'teste.barramento', 'viaturas', '00000000-0000-0000-0000-0000000e1001', 'manual', now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e0000', 'teste.barramento', 'viaturas', '00000000-0000-0000-0000-0000000e1002', 'manual', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e0000', 'teste.barramento', 'viaturas', '00000000-0000-0000-0000-0000000e1003', 'manual', now() - interval '1 minute');

-- ── Reclamar ────────────────────────────────────────────────
select is(
  (select count(*)::int from public.domain_events_claim(10)),
  3,
  'domain_events_claim devolve os eventos pendentes'
);

-- 2. Ficam em `processing` com a tentativa contada.
select is(
  (select count(*)::int from public.domain_events
    where org_id = '00000000-0000-0000-0000-0000000e0000' and status = 'processing' and attempt = 1),
  3,
  'os eventos reclamados ficam em processing com attempt = 1'
);

-- 3. A segunda chamada não devolve os mesmos — é a garantia que impede dois
--    ciclos sobrepostos de processar o mesmo evento duas vezes.
select is(
  (select count(*)::int from public.domain_events_claim(10)),
  0,
  'uma segunda reclamação não devolve eventos já reclamados'
);

-- ── Concluir e falhar ───────────────────────────────────────
select public.domain_events_complete('00000000-0000-0000-0000-0000000e0001');

select is(
  (select status || ':' || (processed_at is not null)::text from public.domain_events
    where id = '00000000-0000-0000-0000-0000000e0001'),
  'completed:true',
  'concluir marca completed e carimba processed_at'
);

-- 4. Falha com tentativas por esgotar → volta a pending, com backoff no futuro.
select public.domain_events_fail('00000000-0000-0000-0000-0000000e0002', 'erro de teste');

select is(
  (select status || ':' || (processed_at is null)::text || ':' || (next_attempt_at > now())::text
     from public.domain_events where id = '00000000-0000-0000-0000-0000000e0002'),
  'pending:true:true',
  'falhar com tentativas por esgotar volta a pending, sem carimbo e com backoff'
);

-- 5. Esgotadas as tentativas → failed, e vai para a dead-letter.
update public.domain_events set attempt = max_attempts
 where id = '00000000-0000-0000-0000-0000000e0003';
select public.domain_events_fail('00000000-0000-0000-0000-0000000e0003', 'erro final de teste');

select is(
  (select status from public.domain_events where id = '00000000-0000-0000-0000-0000000e0003'),
  'failed',
  'esgotadas as tentativas o evento fica failed'
);

select is(
  (select count(*)::int from public.failed_jobs
    where source_table = 'domain_events' and source_id = '00000000-0000-0000-0000-0000000e0003'),
  1,
  'o evento morto aparece na dead-letter'
);

-- 6. E carimba `processed_at` mesmo tendo morrido. É o ponto menos óbvio do
--    desenho: sete emitters deduplicam com `processed_at is null`, portanto um
--    evento morto sem carimbo calaria aquela entidade para sempre.
select ok(
  (select processed_at is not null from public.domain_events where id = '00000000-0000-0000-0000-0000000e0003'),
  'um evento morto carimba processed_at, libertando a deduplicação dos emitters'
);

-- ── Evento envenenado não leva os outros ────────────────────
-- Veneno determinístico: um trigger que rebenta só para um evento concreto,
-- no caminho real (o insert do run). Sem isto seria preciso esperar por um
-- erro genuíno, que por definição não se sabe provocar.
create function pg_temp.envenenar() returns trigger language plpgsql as $$
begin
  if NEW.trigger_event_id = '00000000-0000-0000-0000-0000000e0011' then
    raise exception 'veneno de teste';
  end if;
  return NEW;
end;
$$;

create trigger trg_veneno_teste
  before insert on public.automation_runs
  for each row execute function pg_temp.envenenar();

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-0000000e0000', 'teste.barramento', 'viaturas', '00000000-0000-0000-0000-0000000e2001', 'manual', now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-0000000e0012', '00000000-0000-0000-0000-0000000e0000', 'teste.barramento', 'viaturas', '00000000-0000-0000-0000-0000000e2002', 'manual', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000e0013', '00000000-0000-0000-0000-0000000e0000', 'teste.barramento', 'viaturas', '00000000-0000-0000-0000-0000000e2003', 'manual', now() - interval '1 minute');

select public.process_domain_events(10);

drop trigger trg_veneno_teste on public.automation_runs;

-- 7. A falha fica registada — e o evento conclui.
--
-- ATÉ AO MVP DAS ACÇÕES INTERNAS esta asserção era o inverso: o evento NÃO
-- podia ficar `completed`, porque uma excepção em qualquer regra abortava o
-- processamento inteiro do evento.
--
-- O MVP introduziu sub-transacção por REGRA, e isso muda de propósito o que é
-- correcto aqui: o veneno deste ficheiro dispara no insert de `automation_runs`,
-- ou seja é uma falha DE UMA REGRA. Sob o desenho novo ela não pode levar o
-- evento nem as outras regras — foi exactamente isso que se pediu.
--
-- O que a asserção protegia continua protegido, e é por isso que muda em vez
-- de desaparecer: uma falha não passa em silêncio. Deixa de se manifestar como
-- «o evento não concluiu» e passa a manifestar-se como uma linha
-- `regra_falhou` com o erro. É a mesma exigência, no sítio onde o desenho novo
-- a coloca.
select ok(
  (select detalhe->>'erro' from public.automation_logs
    where evento = 'regra_falhou'
      and detalhe->>'event_id' = '00000000-0000-0000-0000-0000000e0011')
    like '%veneno de teste%',
  'a falha da regra fica registada com o erro, em vez de derrubar o evento'
);

select is(
  (select status from public.domain_events where id = '00000000-0000-0000-0000-0000000e0011'),
  'completed',
  'e o evento conclui — a falha é da regra, não dele'
);

-- 8. ...e os que vinham a seguir no MESMO lote passaram à mesma.
select is(
  (select count(*)::int from public.domain_events
    where id in ('00000000-0000-0000-0000-0000000e0012', '00000000-0000-0000-0000-0000000e0013')
      and status = 'completed'),
  2,
  'um evento envenenado não impede os restantes do lote de serem processados'
);

select * from finish();
rollback;
