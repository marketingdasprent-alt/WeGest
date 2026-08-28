-- ============================================================================
-- PUBLICAÇÃO REALTIME — arranque de uma base de dados nova
-- ============================================================================
--
-- Corre a seguir a `00000000000002_privilegios_anon.sql`.
--
-- ── PORQUE ISTO EXISTE ──────────────────────────────────────────────────────
--
-- Terceiro caso da mesma família: `supabase db dump --schema public` exporta o
-- SCHEMA, não a BASE DE DADOS. Já tinham ficado de fora as extensões
-- (00000000000000, no topo do baseline), os dados de catálogo
-- (00000000000001) e os privilégios (00000000000002). Faltavam as
-- **publicações** — que são objectos ao nível da base, não do schema.
--
-- Encontrado a 2026-08-28 pelo pgTAP `notifications.test.sql`, na primeira vez
-- que os testes de notificações correram contra uma base reconstruída:
--
--     # Failed test 8: "notifications está na publicação supabase_realtime"
--     #         have: 0   want: 1
--
-- Produção tem 10 tabelas em `supabase_realtime`. Uma base reconstruída tinha
-- zero.
--
-- ── PORQUE ISTO IMPORTA MAIS DO QUE PARECE ──────────────────────────────────
--
-- A falha é SILENCIOSA. Sem a publicação não há erro nenhum: as subscrições do
-- browser ligam-se, ficam à espera, e não chega evento nenhum. O que se vê é
-- uma aplicação que "às vezes não actualiza".
--
-- Três sítios que dependem disto, confirmados no código:
--
--   src/hooks/useNotificacoes.ts    → o sino de notificações
--   src/pages/Calendario.tsx        → o calendário de movimentações
--   src/hooks/useRealTimeLeads.ts   → o quadro de leads do CRM
--
-- ── FORMA ───────────────────────────────────────────────────────────────────
--
-- O guarda `IF NOT EXISTS` segue o idioma que o projecto já usava nas
-- migrações históricas (ver 20260602000003 e 20260727130000 no arquivo):
-- `alter publication ... add table` dá erro se a tabela já lá estiver, e este
-- ficheiro tem de poder correr sobre uma base que já a tem.
-- ============================================================================

do $$
declare
  r record;
  -- Espelha `pg_publication_tables` de produção a 2026-08-28. Acrescentar aqui
  -- exige nomear a subscrição do frontend que passa a precisar dela.
  tabelas text[] := array[
    'calendario_eventos',   -- src/pages/Calendario.tsx
    'email_comandos',
    'email_mensagens',
    'email_pastas',
    'email_rascunhos',
    'lead_status_history',
    'leads_dasprent',       -- src/hooks/useRealTimeLeads.ts
    'notificacoes',         -- src/hooks/useNotificacoes.ts (o sino)
    'notifications',        -- registo-pai do pipeline de email
    'ti_tickets'
  ];
  nome text;
  adicionadas int := 0;
begin
  -- O stack local do Supabase já cria a publicação, vazia. Uma base Postgres
  -- nua não a tem, e sem ela o `alter` abaixo falharia com "does not exist".
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
    raise notice 'publicação supabase_realtime criada';
  end if;

  foreach nome in array tabelas
  loop
    -- Uma tabela que não exista neste ponto da cadeia é um erro de ordenação,
    -- não algo a ignorar: avisa-se em vez de saltar em silêncio.
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relname = nome and c.relkind = 'r'
    ) then
      raise warning 'realtime: tabela public.% não existe — não foi publicada', nome;
      continue;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = nome
    ) then
      execute format('alter publication supabase_realtime add table public.%I', nome);
      adicionadas := adicionadas + 1;
    end if;
  end loop;

  raise notice 'realtime: % tabelas acrescentadas à publicação', adicionadas;
end $$;
