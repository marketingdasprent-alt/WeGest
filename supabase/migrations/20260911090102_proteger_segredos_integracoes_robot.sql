-- As credenciais Apify partilhadas são segredos de infraestrutura WeGest e não
-- podem ser copiadas para linhas multi-tenant visíveis aos administradores das orgs.
UPDATE public.plataformas_configuracao
SET apify_api_token = NULL
WHERE robot_target_platform IS NOT NULL
  AND apify_api_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.proteger_segredos_integracoes_robot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.robot_target_platform IS NOT NULL THEN
    NEW.apify_api_token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_segredos_integracoes_robot
ON public.plataformas_configuracao;

CREATE TRIGGER trg_proteger_segredos_integracoes_robot
BEFORE INSERT OR UPDATE OF apify_api_token, robot_target_platform
ON public.plataformas_configuracao
FOR EACH ROW
EXECUTE FUNCTION public.proteger_segredos_integracoes_robot();

REVOKE ALL ON FUNCTION public.proteger_segredos_integracoes_robot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proteger_segredos_integracoes_robot() TO service_role;

REVOKE ALL ON TABLE public.apify_credenciais_partilhadas FROM anon, authenticated;
GRANT ALL ON TABLE public.apify_credenciais_partilhadas TO service_role;

NOTIFY pgrst, 'reload schema';
