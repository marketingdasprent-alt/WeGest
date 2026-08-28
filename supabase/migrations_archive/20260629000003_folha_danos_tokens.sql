-- ============================================================
-- Tokens públicos para a galeria de danos (folha de danos → QR)
-- ============================================================
-- O QR da folha de danos aponta para uma página PÚBLICA (motorista não tem
-- conta). O token é a credencial: liga a uma viatura, não expira por defeito
-- (validade longa) e pode ser reutilizado para ver as fotos quando quiser.
-- As fotos continuam num bucket PRIVADO — a edge function `danos-publicos`
-- gera signed URLs temporárias a partir deste token.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.danos_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  viatura_id  uuid NOT NULL REFERENCES public.viaturas(id) ON DELETE CASCADE,
  contrato_renting_id uuid REFERENCES public.contratos_renting(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '365 days'),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_danos_tokens_viatura ON public.danos_tokens (viatura_id);

ALTER TABLE public.danos_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_danos_tokens_select" ON public.danos_tokens;
DROP POLICY IF EXISTS "mt_danos_tokens_insert" ON public.danos_tokens;

CREATE POLICY "mt_danos_tokens_select" ON public.danos_tokens
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_danos_tokens_insert" ON public.danos_tokens
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND created_by = auth.uid());

-- ------------------------------------------------------------
-- RPC: gerar (ou reutilizar) o token público de uma viatura.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_token_danos(
  p_viatura_id uuid,
  p_contrato_renting_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id uuid;
BEGIN
  -- Multi-tenant guard: a viatura tem de ser da org do utilizador.
  IF NOT EXISTS (
    SELECT 1 FROM public.viaturas
     WHERE id = p_viatura_id AND org_id = get_current_org_id()
  ) THEN
    RAISE EXCEPTION 'Sem permissão sobre esta viatura.';
  END IF;

  -- Reutiliza um token válido já existente para a viatura (evita acumular).
  SELECT id INTO v_token_id
  FROM public.danos_tokens
  WHERE viatura_id = p_viatura_id
    AND org_id = get_current_org_id()
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token_id IS NULL THEN
    INSERT INTO public.danos_tokens (org_id, viatura_id, contrato_renting_id, created_by)
    VALUES (get_current_org_id(), p_viatura_id, p_contrato_renting_id, auth.uid())
    RETURNING id INTO v_token_id;
  END IF;

  RETURN v_token_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_token_danos(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_token_danos(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.gerar_token_danos(uuid, uuid) IS
  'Gera (ou reutiliza) o token público da galeria de danos de uma viatura. '
  'Usado no QR da folha de danos. Validade 1 ano, reutilizável.';
