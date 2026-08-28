-- uber-webhook's CSV import used a service-role client, so org_id relied on
-- get_current_org_id() (auth.uid()-based) which is NULL for service-role and
-- silently defaulted to NULL. RLS then hid every imported row from everyone.
-- Code fix threads org_id explicitly now; this backfills rows already stuck.

UPDATE public.uber_transactions t
SET org_id = pc.org_id
FROM public.plataformas_configuracao pc
WHERE t.integracao_id = pc.id
  AND t.org_id IS NULL;

UPDATE public.uber_drivers t
SET org_id = pc.org_id
FROM public.plataformas_configuracao pc
WHERE t.integracao_id = pc.id
  AND t.org_id IS NULL;

UPDATE public.uber_sync_logs t
SET org_id = pc.org_id
FROM public.plataformas_configuracao pc
WHERE t.integracao_id = pc.id
  AND t.org_id IS NULL;

UPDATE public.uber_webhook_events t
SET org_id = pc.org_id
FROM public.plataformas_configuracao pc
WHERE t.integracao_id = pc.id
  AND t.org_id IS NULL;
