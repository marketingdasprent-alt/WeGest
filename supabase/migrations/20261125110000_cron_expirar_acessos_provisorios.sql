-- Cron que expira as senhas provisórias dos motoristas (PR 2).
-- A edge function roda a senha pela API de admin e chama revogar_sessoes_utilizador;
-- não há na API de admin forma de fechar todas as sessões de um utilizador pelo id.

CREATE OR REPLACE FUNCTION public.revogar_sessoes_utilizador(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.revogar_sessoes_utilizador(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_sessoes_utilizador(uuid) TO service_role;

-- Mesmo padrão dos outros crons de edge functions: cron_invocar_edge lê a
-- service role do Vault (a função recusa chamadas sem ela) e regista o pedido.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirar-acessos-provisorios') THEN
    PERFORM cron.unschedule('expirar-acessos-provisorios');
  END IF;
  PERFORM cron.schedule(
    'expirar-acessos-provisorios',
    '*/10 * * * *',
    $cron$ SELECT public.cron_invocar_edge('expirar-acessos-provisorios', 'expirar-acessos-provisorios', '{}'::jsonb, 60000); $cron$
  );
END $$;

NOTIFY pgrst, 'reload schema';
