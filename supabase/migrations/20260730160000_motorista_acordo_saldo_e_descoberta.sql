-- supabase/migrations/20260730160000_motorista_acordo_saldo_e_descoberta.sql
-- ============================================================
-- TVDE: corrige o saldo do motorista e dá-lhe forma de encontrar o acordo
-- ============================================================
-- Dois problemas encontrados ao rever a migração anterior
-- (20260730150000) antes do utilizador testar, nenhum dos dois coberto
-- pelos testes manuais ainda por fazer:
--
-- 1) acordo_parcela_registar_pagamento gravava o crédito do pagamento em
--    motorista_financeiro com status='pago'. O cartão "Saldo Atual" do
--    próprio motorista (MotoristaDashboard.tsx) soma APENAS as linhas
--    status='pendente'. Resultado: o débito da cessão (status='pendente',
--    valor total da dívida) ficava a contar para sempre, e cada pagamento
--    de parcela (status='pago') NUNCA o compensava nesse saldo — o
--    motorista via sempre a dívida inteira, mesmo depois de paga aos
--    poucos. Corrigido: o crédito do pagamento passa a 'pendente' também,
--    para se compensar dentro do mesmo balde que o débito da cessão
--    (mesmo padrão já usado por outras categorias em motorista_financeiro,
--    onde 'pendente' é "por liquidar" e só uma ação manual do staff marca
--    'pago"). Nada aqui exige mudar o botão "marcar como pago" existente.
--
-- 2) Não havia nenhuma forma de o motorista ENCONTRAR o seu acordo: a rota
--    /motorista/painel/acordos/:id existe e funciona, mas nada no painel
--    dele (MotoristaDashboard.tsx) mostra ou liga para lá — só chegava lá
--    quem já soubesse o id. RLS de acordos_pagamento é só staff
--    (has_renting_faturacao_access), por isso o motorista não pode listar
--    os próprios acordos diretamente; precisa de uma RPC SECURITY DEFINER
--    dedicada, no mesmo padrão de autorização de acordo_vista_devedor
--    (motoristas_ativos.user_id = auth.uid()).
-- ============================================================

-- 1) Corrige o status do crédito de pagamento (só este valor muda; resto
--    da função idêntico a 20260730150000).
CREATE OR REPLACE FUNCTION public.acordo_parcela_registar_pagamento(
  p_parcela_id           uuid,
  p_valor                numeric(12,2),
  p_data                 date,
  p_metodo               text,
  p_entidade_id          uuid,
  p_contrato_id          uuid,
  p_cobranca_id          uuid,
  p_descricao            text,
  p_tem_documento_fiscal boolean,
  p_payload              jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parcela          public.acordo_parcelas%ROWTYPE;
  v_recibo_id        uuid;
  v_acordo_papel     text;
  v_acordo_motorista uuid;
  v_acordo_titular   uuid;
  v_entidade_recibo  uuid;
BEGIN
  SELECT * INTO v_parcela FROM public.acordo_parcelas WHERE id = p_parcela_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  IF NOT COALESCE(
    v_parcela.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registar pagamento nesta parcela.';
  END IF;

  IF v_parcela.recibo_id IS NOT NULL
     OR v_parcela.estado NOT IN ('agendada', 'avisada', 'vencida') THEN
    RAISE EXCEPTION 'Esta parcela já tem um pagamento registado ou não está aberta a pagamento (estado: %).', v_parcela.estado;
  END IF;

  -- Responsável lido do PRÓPRIO acordo — nunca confiado ao chamador.
  SELECT responsavel_papel, responsavel_motorista_id, titular_id
    INTO v_acordo_papel, v_acordo_motorista, v_acordo_titular
    FROM public.acordos_pagamento WHERE id = v_parcela.acordo_id;

  v_entidade_recibo := CASE WHEN v_acordo_papel = 'motorista' THEN v_acordo_titular ELSE p_entidade_id END;

  INSERT INTO public.recibos (
    org_id, entidade_id, contrato_id, valor, data_recibo, metodo, referencia, observacoes, estado
  ) VALUES (
    v_parcela.org_id, v_entidade_recibo, p_contrato_id, p_valor, p_data, p_metodo,
    p_cobranca_id::text, p_descricao, 'ativo'
  ) RETURNING id INTO v_recibo_id;

  IF v_acordo_papel = 'motorista' THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, recibo_id, descricao)
    VALUES
      (v_parcela.org_id, v_acordo_titular, 'debito', p_valor, 'ajuste', p_contrato_id,
       v_parcela.acordo_id, v_recibo_id,
       'Ajuste — dívida desta parcela é do motorista responsável, não do titular');

    -- status='pendente' (não 'pago'): tem de se compensar, no mesmo balde
    -- somado pelo cartão "Saldo Atual" do motorista, com o débito total da
    -- cessão (também 'pendente') — ver nota (1) no cabeçalho da migração.
    INSERT INTO public.motorista_financeiro
      (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, acordo_id)
    VALUES
      (v_parcela.org_id, v_acordo_motorista, 'credito', 'outro',
       'Pagamento da parcela ' || v_parcela.numero, p_valor, p_data, 'pendente', v_parcela.acordo_id);
  END IF;

  UPDATE public.acordo_parcelas
     SET estado = 'liquidacao_pendente', recibo_id = v_recibo_id
   WHERE id = p_parcela_id;

  IF NOT p_tem_documento_fiscal THEN
    PERFORM public.acordo_parcela_liquidar(p_parcela_id, NULL);
    RETURN jsonb_build_object('recibo_id', v_recibo_id, 'estado', 'paga');
  END IF;

  INSERT INTO public.faturacao_outbox (
    org_id, tipo, idempotency_key, parcela_id, payload, estado, started_at
  ) VALUES (
    v_parcela.org_id, 'RC', 'RC:parcela:' || p_parcela_id::text, p_parcela_id, p_payload, 'em_curso', now()
  );

  RETURN jsonb_build_object('recibo_id', v_recibo_id, 'estado', 'liquidacao_pendente');
END;
$$;

COMMENT ON FUNCTION public.acordo_parcela_registar_pagamento(uuid, numeric, date, text, uuid, uuid, uuid, text, boolean, jsonb) IS
  'Registo atómico do pagamento de uma parcela. Quando o responsável é um motorista, '
  'credita motorista_financeiro com status=pendente (compensa o débito da cessão no '
  'mesmo balde) em vez de recibos.entidade_id, que só aceita clientes, e lança um '
  'ajuste que anula o crédito automático ao titular.';

-- 2) RPC: o motorista descobre os seus próprios acordos ativos (para os
--    poder ligar a partir do painel — sem isto não havia forma de chegar
--    a /motorista/painel/acordos/:id sem já saber o id de antemão).
CREATE OR REPLACE FUNCTION public.motorista_meus_acordos_ativos()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_motorista_id uuid;
BEGIN
  SELECT id INTO v_motorista_id FROM public.motoristas_ativos WHERE user_id = auth.uid();
  IF v_motorista_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id,
      'codigo', a.codigo,
      'falta_pagar', public.cobranca_saldo_por_liquidar(a.cobranca_id)
    ) ORDER BY a.created_at DESC)
    FROM public.acordos_pagamento a
    WHERE a.responsavel_motorista_id = v_motorista_id
      AND a.estado IN ('ativo', 'incumprimento')
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.motorista_meus_acordos_ativos() IS
  'Lista (id, codigo, falta_pagar) dos acordos de pagamento ativos/em '
  'incumprimento em que o utilizador autenticado é o motorista responsável. '
  'Usada pelo painel do motorista para mostrar um atalho para '
  '/motorista/painel/acordos/:id — sem isto não havia forma de o motorista '
  'encontrar o próprio acordo sem já saber o id.';
