-- Remove hardcoded Bolt cron jobs (will be recreated by UI via bolt-schedule)
SELECT cron.unschedule('bolt-sync-dosmiguel');
SELECT cron.unschedule('bolt-sync-distancia');
SELECT cron.unschedule('bolt-sync-propecas');
SELECT cron.unschedule('bolt-sync-decada');

-- Reset sync_automatico so users re-enable via UI (which now actually creates cron jobs)
UPDATE plataformas_configuracao 
SET sync_automatico = false 
WHERE plataforma = 'bolt' AND sync_automatico = true;