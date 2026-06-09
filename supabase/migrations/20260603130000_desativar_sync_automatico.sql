-- ============================================================
-- Desativar a sincronização automática (cron + Apify + enqueue)
-- ============================================================
-- Decisão: deixar APENAS o import manual por CSV funcional.
-- Reversível — não apaga tokens/config; só desliga os gatilhos.
-- Para reativar: re-correr as migrações de cron e pôr sync_automatico=true.
-- ============================================================

-- 1) Nenhuma integração entra no enqueue semanal
UPDATE public.plataformas_configuracao SET sync_automatico = false;

-- 2) Parar os cron jobs de sincronização (manter alertas e cobranças TVDE).
--    Idempotente: ignora erro se o job já não existir.
DO $$ BEGIN PERFORM cron.unschedule('sync-weekly-enqueue-summer'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync-weekly-enqueue-winter'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync-drain');                 EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- Variantes/nomes antigos, por segurança:
DO $$ BEGIN PERFORM cron.unschedule('sync-weekly-enqueue'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync_orchestrator');   EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3) Esvaziar a fila pendente (nada para drenar)
DELETE FROM public.sync_queue WHERE status IN ('pending', 'running');
