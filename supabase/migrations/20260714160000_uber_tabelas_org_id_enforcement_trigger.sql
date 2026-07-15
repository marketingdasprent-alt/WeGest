-- ============================================================
-- Trigger de enforcement: org_id NULL nas tabelas Uber
-- ============================================================
-- 3º incidente do padrão "org_id NULL escapa à RLS" em 4 dias (depois de
-- cargos e cargo_permissoes). Ao contrário de cargo_permissoes, o
-- histórico destas 4 tabelas não pode ser 100% backfilled (integracao_id
-- nullable / ON DELETE SET NULL em uber_sync_logs e uber_webhook_events),
-- por isso NOT NULL na coluna partiria contra dados reais. Em vez disso:
-- um trigger recusa qualquer INSERT/UPDATE novo com org_id NULL — a
-- edge function uber-webhook já define org_id explicitamente desde
-- 20260713150000 (fix da mesma sessão), este trigger é a rede de
-- segurança contra regressão futura, não a correcção principal.
-- Nota: em UPDATE, só rejeita se org_id estava preenchido e passaria a
-- NULL (regressão activa); uma linha histórica já com org_id NULL pode
-- continuar a ser actualizada noutras colunas sem ficar presa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reject_null_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL AND (TG_OP = 'INSERT' OR OLD.org_id IS NOT NULL) THEN
    RAISE EXCEPTION
      '% : org_id não pode ser NULL (linha rejeitada — evita fuga silenciosa de RLS)',
      TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uber_transactions_org_id_not_null ON public.uber_transactions;
CREATE TRIGGER trg_uber_transactions_org_id_not_null
  BEFORE INSERT OR UPDATE ON public.uber_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_null_org_id();

DROP TRIGGER IF EXISTS trg_uber_drivers_org_id_not_null ON public.uber_drivers;
CREATE TRIGGER trg_uber_drivers_org_id_not_null
  BEFORE INSERT OR UPDATE ON public.uber_drivers
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_null_org_id();

DROP TRIGGER IF EXISTS trg_uber_sync_logs_org_id_not_null ON public.uber_sync_logs;
CREATE TRIGGER trg_uber_sync_logs_org_id_not_null
  BEFORE INSERT OR UPDATE ON public.uber_sync_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_null_org_id();

DROP TRIGGER IF EXISTS trg_uber_webhook_events_org_id_not_null ON public.uber_webhook_events;
CREATE TRIGGER trg_uber_webhook_events_org_id_not_null
  BEFORE INSERT OR UPDATE ON public.uber_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_null_org_id();
