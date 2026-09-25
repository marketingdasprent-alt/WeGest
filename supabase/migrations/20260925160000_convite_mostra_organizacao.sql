-- O convite passa a dizer que organização convida.
--
-- Aceitar um convite associa uma conta existente a outra organização; o ecrã
-- só dizia "a organização que emitiu este convite", o que abria a porta a
-- engenharia social. Quem tem o token é o convidado, por isso devolver o nome
-- não expõe nada novo. Mudar as colunas devolvidas obriga a recriar a função.

DROP FUNCTION IF EXISTS public.validar_convite_token(text);

CREATE FUNCTION public.validar_convite_token(p_token text)
RETURNS TABLE(
  email text,
  cargo_id uuid,
  cargo_nome text,
  org_id uuid,
  expires_at timestamptz,
  org_nome text
)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT c.email, c.cargo_id, cg.nome, c.org_id, c.expires_at, o.nome
  FROM public.convites c
  LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
  LEFT JOIN public.organizacoes o ON o.id = c.org_id
  WHERE c.token = p_token
    AND c.usado = false
    AND c.expires_at > now();
$$;

ALTER FUNCTION public.validar_convite_token(text) OWNER TO postgres;

-- Chamada pelo Register antes de haver sessão (allowlist de rls_anon_exposure).
REVOKE ALL ON FUNCTION public.validar_convite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_convite_token(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
