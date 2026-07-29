-- ============================================================
-- Crons: toda a edge function com consumidor tem de ter cron (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Incidente de origem (2026-07-29): três workers entregues sem nada a invocá-los.
--   • faturacao-outbox-drain   — fila de retry da emissão de faturas. Enquanto
--                                ninguém a drena, tudo o que lá entra fica
--                                indefinidamente, sem erro visível.
--   • acordos-parcelas-diario  — ciclo de vida das parcelas (avisos, vencimentos).
--   • cartrack-scheduled-sync  — pior caso: a migração do cron existia no
--                                repositório mas nunca foi aplicada, E a função
--                                nunca foi deployada (respondia HTTP 404). 250
--                                viaturas sem sincronização automática nenhuma,
--                                e o interruptor `sync_automatico` na UI não
--                                fazia nada por não haver cron a lê-lo.
--
-- É o mesmo padrão do incidente TVDE de 14/07 (migração entregue, consumidor
-- nunca ligado) e a razão pela qual `failed_jobs` está permanentemente vazia:
-- não é ausência de falhas, é ausência de quem as registe.
--
-- Este teste fixa a existência dos três agendamentos. Não testa a cadência
-- exacta de propósito — essa é uma decisão de negócio que pode mudar; o que não
-- pode voltar a acontecer é um worker ficar sem consumidor nenhum.
-- ============================================================

begin;
select plan(8);

-- ------------------------------------------------------------
-- 1–3. Os três crons existem e estão activos
-- ------------------------------------------------------------
select ok(
  exists (select 1 from cron.job where jobname = 'faturacao-outbox-drain' and active),
  'cron faturacao-outbox-drain existe e está activo'
);
select ok(
  exists (select 1 from cron.job where jobname = 'acordos-parcelas-diario' and active),
  'cron acordos-parcelas-diario existe e está activo'
);
select ok(
  exists (select 1 from cron.job where jobname = 'cartrack-scheduled-sync' and active),
  'cron cartrack-scheduled-sync existe e está activo'
);

-- ------------------------------------------------------------
-- 4. Passam todos pelo helper (senão o resultado real é invisível)
-- ------------------------------------------------------------
-- net.http_post devolve um request_id imediatamente, por isso
-- cron.job_run_details marca 'succeeded' assim que o pedido é enfileirado —
-- medido a 29/07: 66% das invocações falhavam e 100% eram reportadas como
-- sucesso. cron_invocar_edge guarda o request_id para a vista cron_edge_health
-- poder mostrar o status HTTP verdadeiro.
select is(
  (select count(*)::int from cron.job
   where jobname in ('faturacao-outbox-drain','acordos-parcelas-diario','cartrack-scheduled-sync')
     and command like '%cron_invocar_edge%'),
  3,
  'os 3 crons invocam via cron_invocar_edge (resultado real observável)'
);

-- ------------------------------------------------------------
-- 5. Timeout explícito — o default de 5000 ms do pg_net é a causa dos timeouts
-- ------------------------------------------------------------
select is(
  (select count(*)::int from cron.job
   where jobname in ('faturacao-outbox-drain','acordos-parcelas-diario','cartrack-scheduled-sync')
     and command ~ ',\s*\d{5,}\s*\)'),
  3,
  'os 3 crons passam um timeout explícito >= 10000 ms'
);

-- ------------------------------------------------------------
-- 6–8. A infraestrutura de observabilidade existe e não é pública
-- ------------------------------------------------------------
select ok(
  exists (select 1 from pg_class where relname = 'cron_http_log' and relrowsecurity),
  'cron_http_log existe com RLS activa'
);
select ok(
  not (has_table_privilege('anon', 'public.cron_http_log', 'SELECT')
    or has_table_privilege('anon', 'public.cron_http_log', 'INSERT')),
  'anon não tem grant nenhum em cron_http_log'
);
select ok(
  not has_function_privilege('anon', 'public.cron_invocar_edge(text,text,jsonb,integer)', 'EXECUTE'),
  'anon não pode executar cron_invocar_edge'
);

select finish();
rollback;
