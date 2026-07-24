-- supabase/migrations/20260724100002_acordos_liquidar_e_vista.sql
-- ============================================================
-- Liquidação de parcela + vista do devedor
-- ============================================================

-- Promove a parcela a 'paga' e, se a dívida ficar coberta, fecha cobrança e acordo.
-- É o ÚNICO caminho que marca uma parcela como paga — é aqui que a regra de ouro
-- (só está pago quando o recibo fiscal saiu) fica garantida.
--
-- SECURITY DEFINER porque tem de fechar contrato_cobrancas e promover
-- acordos_pagamento para além do que a RLS de quem chama permitiria isoladamente
-- (ex.: um worker de outbox sem nenhuma sessão de utilizador). Mas SECURITY
-- DEFINER também significa que a função ignora por completo a RLS de
-- acordo_parcelas/acordos_pagamento/contrato_cobrancas — sem um guard próprio
-- aqui dentro, QUALQUER utilizador autenticado (de qualquer organização)
-- conseguia fechar a dívida de outra org só por indicar um uuid de parcela.
-- Isso contradiz o invariante mais testado deste repositório (isolamento
-- multi-tenant — ver supabase/tests/rls_org_isolation.test.sql), por isso o
-- guard abaixo é uma correção sobre o desenho original, não um extra: só o
-- serviço (service_role — o worker que confirma o recibo→RC) ou staff com
-- acesso de faturação da MESMA org da parcela pode invocar esta função.
CREATE OR REPLACE FUNCTION public.acordo_parcela_liquidar(
  p_parcela_id uuid,
  p_invoice_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parcela public.acordo_parcelas%ROWTYPE;
  v_acordo  public.acordos_pagamento%ROWTYPE;
  v_saldo   numeric(12,2);
BEGIN
  SELECT * INTO v_parcela FROM public.acordo_parcelas WHERE id = p_parcela_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  -- COALESCE(..., false) é obrigatório aqui: sem sessão nenhuma, tanto
  -- auth.role() como get_current_org_id() devolvem NULL, e `NULL = 'x'`
  -- avalia a NULL (não a false). Em PL/pgSQL, `IF NOT (NULL) THEN` NÃO
  -- entra no ramo — o guard falhava ABERTO exactamente para quem não tem
  -- sessão nenhuma, o pior caso possível. O COALESCE fecha isso.
  IF NOT COALESCE(
    auth.role() = 'service_role'
    OR (v_parcela.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access()),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar esta parcela.';
  END IF;

  IF v_parcela.recibo_id IS NULL THEN
    RAISE EXCEPTION 'A parcela não tem recibo associado — o pagamento não foi registado.';
  END IF;

  -- Idempotente: reprocessar a mesma parcela (retry do worker) não faz mal.
  IF v_parcela.estado = 'paga' THEN
    RETURN;
  END IF;

  UPDATE public.acordo_parcelas
     SET estado = 'paga', invoice_rc_id = p_invoice_id, pago_em = now()
   WHERE id = p_parcela_id;

  SELECT * INTO v_acordo FROM public.acordos_pagamento WHERE id = v_parcela.acordo_id;

  -- Acordo liquidado quando não sobra nenhuma parcela por pagar.
  IF NOT EXISTS (
    SELECT 1 FROM public.acordo_parcelas
     WHERE acordo_id = v_acordo.id AND estado NOT IN ('paga','cancelada')
  ) THEN
    UPDATE public.acordos_pagamento
       SET estado = 'liquidado' WHERE id = v_acordo.id AND estado <> 'cancelado';

    -- A cobrança só fecha se a dívida estiver mesmo coberta. Usa o saldo real
    -- (recibos + NC), não a contagem de parcelas — assim uma NC emitida entretanto
    -- não deixa a cobrança presa em aberto.
    v_saldo := public.cobranca_saldo_por_liquidar(v_acordo.cobranca_id);
    IF v_saldo <= 0.005 THEN
      UPDATE public.contrato_cobrancas
         SET estado = 'paga', pago_em = now()
       WHERE id = v_acordo.cobranca_id AND estado = 'emitida';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.acordo_parcela_liquidar(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acordo_parcela_liquidar(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.acordo_parcela_liquidar(uuid, uuid) IS
  'Único caminho que marca uma acordo_parcelas como paga. Idempotente (reprocessar '
  'a mesma parcela não faz nada). Fecha o acordo quando não sobram parcelas por '
  'pagar, e a cobrança quando o saldo real (cobranca_saldo_por_liquidar) chega a '
  'zero. SECURITY DEFINER com guard interno: só service_role ou staff de '
  'faturação da mesma org da parcela.';

-- ------------------------------------------------------------
-- Vista do devedor — SECURITY DEFINER com âmbito fechado.
-- Não existe helper de auto-acesso para `clientes`; abrir uma policy directa
-- obrigaria a um caminho genérico com alcance muito maior do que esta feature.
-- Devolve APENAS o que o devedor precisa de ver: nada de NIF do titular,
-- estado da outbox ou erros de API.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acordo_vista_devedor(p_acordo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_acordo public.acordos_pagamento%ROWTYPE;
  v_autorizado boolean := false;
BEGIN
  SELECT * INTO v_acordo FROM public.acordos_pagamento WHERE id = p_acordo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo não encontrado.';
  END IF;

  -- Motorista responsável identifica-se por motoristas_ativos.user_id.
  IF v_acordo.responsavel_motorista_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.motoristas_ativos
                    WHERE id = v_acordo.responsavel_motorista_id AND user_id = auth.uid())
      INTO v_autorizado;
  END IF;

  -- Staff da própria organização também pode ver (pré-visualizar o que o devedor vê).
  -- COALESCE(..., false) pela mesma razão do guard de acordo_parcela_liquidar:
  -- sem sessão, get_current_org_id() é NULL, `uuid = NULL` é NULL, e atribuir
  -- NULL a v_autorizado faria o "IF NOT v_autorizado" seguinte falhar aberto.
  IF NOT v_autorizado THEN
    v_autorizado := COALESCE(v_acordo.org_id = public.get_current_org_id()
                     AND public.has_renting_faturacao_access(), false);
  END IF;

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'Sem permissão para consultar este acordo.';
  END IF;

  RETURN jsonb_build_object(
    'id', v_acordo.id,
    'codigo', v_acordo.codigo,
    'estado', v_acordo.estado,
    'valor_total', v_acordo.valor_total,
    'falta_pagar', public.cobranca_saldo_por_liquidar(v_acordo.cobranca_id),
    'parcelas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', p.numero,
        'data_vencimento', p.data_vencimento,
        'valor', p.valor,
        -- 'liquidacao_pendente' é operação interna: para o devedor o pagamento
        -- já foi feito. Mostra-se como 'paga'.
        'estado', CASE WHEN p.estado = 'liquidacao_pendente' THEN 'paga' ELSE p.estado END,
        'tem_recibo', p.invoice_rc_id IS NOT NULL
      ) ORDER BY p.numero)
      FROM public.acordo_parcelas p WHERE p.acordo_id = v_acordo.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acordo_vista_devedor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acordo_vista_devedor(uuid) TO authenticated;

COMMENT ON FUNCTION public.acordo_vista_devedor(uuid) IS
  'Vista do devedor sobre o seu acordo de pagamento. SECURITY DEFINER de âmbito '
  'fechado (não existe policy de auto-acesso a clientes/motoristas_ativos para '
  'isto). Nunca devolve titular_nif nem estado interno de outbox/API — '
  'liquidacao_pendente aparece como paga.';
