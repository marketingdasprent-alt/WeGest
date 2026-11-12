-- ============================================================
-- Total fiscal real e travão da faturação por integração
-- ============================================================
-- Em 10/2026 a conta KeyInvoice da Dasp Rent Sul emitiu 26 faturas abaixo do valor do
-- WeGest (GrossTotal 1115,00 contra 1371,45) e 15 NC acima da fatura. Três peças:
--   1. invoices.total_fiscal: o GrossTotal confirmado no fornecedor (NULL = não confirmado);
--   2. o trigger das NC passa a limitar pelo menor entre a cobrança e a fatura emitida;
--   3. a integração pode ficar travada (faturacao_bloqueada_*) até um admin a desbloquear.
-- ============================================================

-- 1. Total fiscal ---------------------------------------------------------

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS total_fiscal numeric(12,2);

COMMENT ON COLUMN public.invoices.total_fiscal IS
  'GrossTotal do documento lido no fornecedor depois de emitir. NULL = não confirmado (getDocument falhou, ou documento anterior a 2026-11-12).';

-- 2. Teto das NC ------------------------------------------------------------

-- O SELECT em invoices exige acesso a contratos e o INSERT em notas_credito só a faturação:
-- lido com a RLS do utilizador, um total em falta fazia o teto voltar ao valor_total em
-- silêncio. O helper lê sem RLS mas só da org do chamador (ou service_role), e falha fechado.
-- Preferido a tornar o trigger SECURITY DEFINER, que passaria a ler/bloquear cobranças
-- (FOR UPDATE) saltando a RLS e a vazar estados de cobranças de outros.
-- Um utilizador só o alcança de dentro do trigger (pg_trigger_depth), nunca por /rpc.
CREATE OR REPLACE FUNCTION public.total_fiscal_da_cobranca(p_cobranca uuid, p_org uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR (pg_trigger_depth() > 0 AND p_org IS NOT NULL AND p_org = public.get_current_org_id())
    OR (session_user IN ('postgres', 'supabase_admin') AND current_setting('role', true) = 'none')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ler o total fiscal desta organização.' USING ERRCODE = '42501';
  END IF;

  -- Com duas faturas emitidas na cobrança não se sabe qual é a corrigida: vale a maior,
  -- para não recusar uma NC legítima.
  RETURN (
    SELECT max(COALESCE(i.total_fiscal, i.total))
      FROM public.invoices i
     WHERE i.cobranca_id = p_cobranca
       AND i.org_id = p_org
       AND i.tipo IN ('FT', 'FR')
       AND i.status = 'emitida'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.total_fiscal_da_cobranca(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.total_fiscal_da_cobranca(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_nota_credito_valida() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_cob    public.contrato_cobrancas%ROWTYPE;
  v_ja     numeric;
  v_fiscal numeric;
  v_teto   numeric;
BEGIN
  SELECT * INTO v_cob FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança % não encontrada.', NEW.cobranca_id;
  END IF;

  NEW.org_id      := v_cob.org_id;
  NEW.entidade_id := v_cob.destinatario_id;
  NEW.contrato_id := v_cob.contrato_id;

  IF v_cob.estado NOT IN ('emitida', 'paga', 'anulada') THEN
    RAISE EXCEPTION
      'Só é possível emitir nota de crédito sobre uma cobrança emitida ou paga (estado atual: %).',
      v_cob.estado;
  END IF;

  IF NOT v_cob.emite_fatura_fiscal THEN
    RAISE EXCEPTION
      'Nota de crédito só é aplicável a cobranças com fatura fiscal (cobrança interna não tem fatura a retificar).';
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_ja
    FROM public.notas_credito
    WHERE cobranca_id = NEW.cobranca_id AND estado = 'ativo';

  v_fiscal := public.total_fiscal_da_cobranca(NEW.cobranca_id, v_cob.org_id);

  v_teto := v_cob.valor_total;
  IF v_fiscal IS NOT NULL AND v_fiscal < v_teto THEN
    v_teto := v_fiscal;
  END IF;

  IF NEW.valor > (v_teto - v_ja) + 0.005 THEN
    IF v_teto < v_cob.valor_total THEN
      RAISE EXCEPTION
        'Valor da nota de crédito (%) excede o saldo por creditar (%): a fatura emitida vale % e a cobrança %.',
        NEW.valor, round(v_teto - v_ja, 2), v_teto, v_cob.valor_total;
    END IF;
    RAISE EXCEPTION
      'Valor da nota de crédito (%) excede o saldo por creditar da cobrança (%).',
      NEW.valor, round(v_cob.valor_total - v_ja, 2);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_nota_credito_valida() IS
  'Valida a NC: cobrança emitida/paga/anulada com fatura fiscal; o valor não excede o saldo por creditar, com teto no menor entre o valor_total da cobrança e o total fiscal da fatura emitida (total_fiscal_da_cobranca).';

-- 3. Travão por integração -------------------------------------------------

ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS faturacao_bloqueada_em timestamptz,
  ADD COLUMN IF NOT EXISTS faturacao_bloqueio_motivo text;

COMMENT ON COLUMN public.plataformas_configuracao.faturacao_bloqueada_em IS
  'Quando a faturação desta integração foi travada por um documento com total diferente do pedido. NULL = livre.';
COMMENT ON COLUMN public.plataformas_configuracao.faturacao_bloqueio_motivo IS
  'Porque está travada (número do documento, total esperado e total real).';

CREATE OR REPLACE FUNCTION public.desbloquear_faturacao_integracao(p_integracao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.get_current_org_id();
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Só um administrador pode desbloquear a faturação.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.plataformas_configuracao
     SET faturacao_bloqueada_em = NULL,
         faturacao_bloqueio_motivo = NULL
   WHERE id = p_integracao_id
     AND org_id = v_org
     AND plataforma = 'faturacao';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integração de faturação não encontrada.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.desbloquear_faturacao_integracao(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desbloquear_faturacao_integracao(uuid) TO authenticated;

-- 4. Tipo de notificação (a FK notificacoes_tipo_fkey rebenta sem ele) ----------

INSERT INTO public.notificacao_tipos (tipo, descricao)
VALUES ('faturacao_total_divergente',
        'Um documento saiu no software de faturação com total diferente do pedido: a faturação ficou travada.')
ON CONFLICT (tipo) DO NOTHING;

NOTIFY pgrst, 'reload schema';
