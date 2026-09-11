-- Remove a anon key histórica de funções ativas sem reescrever a baseline já aplicada.
-- Os pedidos internos passam a usar a mesma service role mantida no Vault pelos crons.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets AS segredo
    WHERE segredo.name = 'cron_service_role_jwt'
      AND NULLIF(BTRIM(segredo.decrypted_secret), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Criar primeiro cron_service_role_jwt no Vault; migração abortada.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.edge_internal_authorization_header()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'Bearer ' || segredo.decrypted_secret
  FROM vault.decrypted_secrets AS segredo
  WHERE segredo.name = 'cron_service_role_jwt'
    AND NULLIF(BTRIM(segredo.decrypted_secret), '') IS NOT NULL
  LIMIT 1;
$$;

ALTER FUNCTION public.edge_internal_authorization_header() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.edge_internal_authorization_header()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edge_internal_authorization_header()
  TO service_role;

DO $$
DECLARE
  alvo REGPROCEDURE;
  definicao TEXT;
  endurecida TEXT;
BEGIN
  FOREACH alvo IN ARRAY ARRAY[
    'public.emit_lembretes_cobranca_atrasada()'::REGPROCEDURE,
    'public.fn_cartao_frota_email_aviso()'::REGPROCEDURE,
    'public.fn_contratos_renting_criado_domain_event()'::REGPROCEDURE
  ] LOOP
    definicao := pg_get_functiondef(alvo);
    endurecida := regexp_replace(
      definicao,
      $regex$'Bearer eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'$regex$,
      'public.edge_internal_authorization_header()',
      'g'
    );

    IF endurecida = definicao
       AND POSITION('edge_internal_authorization_header()' IN definicao) = 0 THEN
      RAISE EXCEPTION 'Não foi encontrado o bearer legado em %; revisão manual necessária.', alvo;
    END IF;

    EXECUTE endurecida;
  END LOOP;
END;
$$;

ALTER FUNCTION public.resolver_titular_por_cartao(UUID, TEXT, TEXT, DATE)
  SET search_path = '';
ALTER FUNCTION public.resolver_devedor_do_cliente(UUID, UUID, DATE)
  SET search_path = '';
ALTER FUNCTION public.resolver_motorista_por_cartao(UUID, TEXT, TEXT, DATE)
  SET search_path = '';

NOTIFY pgrst, 'reload schema';
