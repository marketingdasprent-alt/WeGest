-- ============================================================
-- Ponte motorista → cliente fiscal (tipo='condutor')
-- ============================================================
-- O destinatário de contrato_cobrancas é um cliente (FK NOT NULL), mas o
-- motorista vive em motoristas_ativos. Esta função garante um cliente
-- tipo='condutor' que espelha o motorista e devolve o seu id. Idempotente:
-- usa o cache motoristas_ativos.cliente_id; senão procura por (org_id, nif);
-- senão cria. SECURITY DEFINER — recebe org_id explícito (corre fora de auth).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_ensure_cliente_condutor(
  p_motorista_id uuid,
  p_org_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mot record;
  v_cli uuid;
BEGIN
  SELECT * INTO v_mot FROM public.motoristas_ativos WHERE id = p_motorista_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ensure_cliente_condutor: motorista % inexistente', p_motorista_id;
  END IF;

  -- 1) já ligado?
  IF v_mot.cliente_id IS NOT NULL THEN
    RETURN v_mot.cliente_id;
  END IF;

  -- 2) procurar cliente condutor existente por NIF (quando há NIF)
  IF v_mot.nif IS NOT NULL AND length(btrim(v_mot.nif)) > 0 THEN
    SELECT id INTO v_cli
    FROM public.clientes
    WHERE org_id = p_org_id
      AND tipo_cliente = 'condutor'
      AND nif = v_mot.nif
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- 3) criar se não existe
  IF v_cli IS NULL THEN
    INSERT INTO public.clientes (org_id, tipo_cliente, is_empresa, nome, nif, email, telefone)
    VALUES (p_org_id, 'condutor', false, v_mot.nome, v_mot.nif, v_mot.email, v_mot.telefone)
    RETURNING id INTO v_cli;
  END IF;

  -- 4) cache no motorista
  UPDATE public.motoristas_ativos SET cliente_id = v_cli WHERE id = p_motorista_id;

  RETURN v_cli;
END;
$$;

COMMENT ON FUNCTION public.fn_ensure_cliente_condutor(uuid, uuid) IS
  'Garante (cria ou encontra) o cliente fiscal tipo=condutor que representa um '
  'motorista e devolve o seu id. Idempotente via cache motoristas_ativos.cliente_id.';

GRANT EXECUTE ON FUNCTION public.fn_ensure_cliente_condutor(uuid, uuid) TO service_role, authenticated;
