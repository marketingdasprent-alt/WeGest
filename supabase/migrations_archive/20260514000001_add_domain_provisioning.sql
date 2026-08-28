-- ============================================================
-- Subdomínios automáticos: colunas de estado + trigger
-- ============================================================

-- Colunas de estado na tabela organizacoes
ALTER TABLE public.organizacoes
  ADD COLUMN IF NOT EXISTS dominio_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS dominio_erro text;

ALTER TABLE public.organizacoes
  ADD CONSTRAINT chk_dominio_status
  CHECK (dominio_status IN ('pendente', 'provisionando', 'ativo', 'erro'));

-- ============================================================
-- Trigger que chama a edge function provision-domain
-- via pg_net (fire-and-forget) quando uma org é criada
-- ou quando o codigo muda.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_provision_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _supabase_url text;
  _service_role_key text;
BEGIN
  -- Só disparar para novas orgs ou quando o codigo muda
  -- Ignorar a org "decada" (usa wegest.pt diretamente, sem subdomínio)
  IF NEW.codigo = 'decada' THEN
    NEW.dominio_status := 'ativo';
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.codigo IS DISTINCT FROM NEW.codigo) THEN
    -- Marcar como provisionando
    NEW.dominio_status := 'provisionando';
    NEW.dominio_erro := NULL;

    -- Buscar config do Supabase (definidos via ALTER DATABASE ... SET app.settings.xxx)
    _supabase_url := current_setting('app.settings.supabase_url', true);
    _service_role_key := current_setting('app.settings.service_role_key', true);

    -- Se as settings existem, chamar a edge function
    IF _supabase_url IS NOT NULL AND _service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := _supabase_url || '/functions/v1/provision-domain',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || _service_role_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'org_id', NEW.id::text,
          'codigo', NEW.codigo
        )
      );
    ELSE
      -- Sem config → marcar como pendente para retry manual
      NEW.dominio_status := 'pendente';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger BEFORE para poder modificar NEW
CREATE TRIGGER on_org_provision_domain
  BEFORE INSERT OR UPDATE ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_provision_domain();
