-- ============================================================
-- Brevo (e futuros providers de email) como integração da empresa
-- ============================================================
-- Segue exactamente o padrão já usado por Uber/Bolt/BP/Repsol/EDP:
-- reaproveita plataformas_configuracao (não cria tabela nova) e usa o
-- mesmo idioma de "meta-tipo + subtipo" que 'robot'/robot_target_platform
-- já usa: plataforma='email' + email_provider='brevo'|'ses'|'resend'|'smtp'.
--
-- Diferença deliberada face ao padrão legado: as restantes integrações
-- guardam credenciais em texto plano (client_secret, ftp_password, etc).
-- Para email cifra-se a API key com pgcrypto (pgp_sym_encrypt), porque
-- foi requisito explícito do dono do produto. A chave de cifra vive no
-- Supabase Vault sob o nome 'email_encryption_key' — passo manual único
-- de operação (supabase secrets / dashboard), nunca commitado em migration.
-- Isto é consistente com o resto do projecto, onde migrations não fazem
-- deploy automático (ver AGENTS.md / deploy manual via SQL editor).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS email_provider text,
  ADD COLUMN IF NOT EXISTS email_api_key_encrypted bytea,
  ADD COLUMN IF NOT EXISTS email_sender_name text,
  ADD COLUMN IF NOT EXISTS email_sender_email text,
  ADD COLUMN IF NOT EXISTS email_reply_to text,
  ADD COLUMN IF NOT EXISTS email_provider_config jsonb;

COMMENT ON COLUMN public.plataformas_configuracao.email_provider IS
  'Subtipo quando plataforma=''email'': ''brevo'' hoje; ''ses''/''resend''/''smtp'' no futuro. Mesmo papel de robot_target_platform.';
COMMENT ON COLUMN public.plataformas_configuracao.email_api_key_encrypted IS
  'API key do provider de email, cifrada com pgp_sym_encrypt via set_email_api_key(). Nunca gravar em texto plano nesta coluna.';
COMMENT ON COLUMN public.plataformas_configuracao.email_provider_config IS
  'Overflow jsonb só para campos específicos de providers futuros que não cabem nas colunas genéricas (ex.: host/port do SMTP, region do SES). Brevo não usa esta coluna.';

-- Grava a API key cifrada. Só actualiza a linha se pertencer à org activa do
-- caller e o caller for admin (mesma exigência da policy mt_plataformas_config_all).
-- SECURITY DEFINER é necessário para aceder a vault.decrypted_secrets, mas o
-- filtro org_id/admin abaixo impede que uma org escreva na integração de outra.
CREATE OR REPLACE FUNCTION public.set_email_api_key(p_integracao_id uuid, p_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encryption_key text;
  v_updated int;
BEGIN
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_encryption_key';

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'email_encryption_key não configurado no Supabase Vault';
  END IF;

  UPDATE public.plataformas_configuracao
  SET email_api_key_encrypted = pgp_sym_encrypt(p_api_key, v_encryption_key),
      updated_at = now()
  WHERE id = p_integracao_id
    AND plataforma = 'email'
    AND org_id = public.get_current_org_id()
    AND public.is_current_user_admin();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Integração de email não encontrada ou sem permissão';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_email_api_key(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_email_api_key(uuid, text) TO authenticated;

-- Decifra a API key. Só chamável por service_role (edge functions) — nunca
-- exposta a 'authenticated', para que o utilizador nunca consiga ler a key
-- de volta pela API REST/RPC.
CREATE OR REPLACE FUNCTION public.get_email_api_key(p_integracao_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encryption_key text;
  v_encrypted bytea;
BEGIN
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_encryption_key';

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'email_encryption_key não configurado no Supabase Vault';
  END IF;

  SELECT email_api_key_encrypted INTO v_encrypted
  FROM public.plataformas_configuracao
  WHERE id = p_integracao_id AND plataforma = 'email';

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pgp_sym_decrypt(v_encrypted, v_encryption_key);
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_api_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_email_api_key(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_api_key(uuid) TO service_role;

-- ============================================================
-- email_sends: generalizar de "só marketing" para log de qualquer envio
-- ============================================================
-- campanha_id era NOT NULL (só marketing gravava aqui). EmailService.log()
-- passa a gravar todos os tipos de email; campanha_id fica NULL fora de
-- campanhas. Aditivo — não quebra nenhum insert/select existente.
ALTER TABLE public.email_sends
  ALTER COLUMN campanha_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'marketing';

COMMENT ON COLUMN public.email_sends.origem IS
  'Caso de uso que gerou o envio: marketing | calendar_notification | reminder | documento_fiscal | folha_danos | recibo_anulado | alerta_expiracao | assistance | auth | eliminacao_conta.';

CREATE INDEX IF NOT EXISTS idx_email_sends_origem ON public.email_sends(origem, created_at);
