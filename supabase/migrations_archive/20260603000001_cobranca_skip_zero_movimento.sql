-- ============================================================
-- Faturas a 0€ (cortesia / 100% desconto)
-- ============================================================
-- conta_movimentos e recibos têm CHECK (valor > 0). Uma cobrança a 0€
-- é válida (contrato_cobrancas.valor_sem_iva >= 0) mas não deve lançar
-- um movimento de conta-corrente a 0€ — não há nada a dever.
--
-- Esta migração reescreve o trigger que posta movimentos a partir das
-- cobranças para IGNORAR débitos/estornos de valor_total = 0.
-- (Idêntico ao original de 20260520000004, com a guarda `valor_total > 0`.)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_cobranca_posta_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'emitida' AND NEW.valor_total > 0 THEN
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem, cobranca_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.destinatario_id, 'debito', NEW.valor_total, 'cobranca',
         NEW.id, NEW.contrato_id, COALESCE(NEW.descricao, 'Cobrança de contrato'));
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'pendente' AND NEW.estado = 'emitida' AND NEW.valor_total > 0 THEN
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem, cobranca_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.destinatario_id, 'debito', NEW.valor_total, 'cobranca',
         NEW.id, NEW.contrato_id, COALESCE(NEW.descricao, 'Cobrança de contrato'));

    ELSIF OLD.estado IN ('emitida','paga') AND NEW.estado = 'anulada' AND NEW.valor_total > 0 THEN
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem, cobranca_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.destinatario_id, 'credito', NEW.valor_total, 'cobranca',
         NEW.id, NEW.contrato_id, 'Estorno de cobrança anulada');
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_cobranca_posta_movimento() IS
  'Posta débito/estorno na conta-corrente a partir de contrato_cobrancas. '
  'Ignora valores de 0€ (faturas de cortesia) — conta_movimentos exige valor > 0.';
