-- Melhora o descritivo do estorno de cobrança anulada:
-- em vez de texto genérico usa o tipo de documento (ex.: "Anulamento de Factura-Recibo").
-- Extrai a primeira parte do campo descricao da cobrança (antes de " — ").

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
         NEW.id, NEW.contrato_id,
         'Anulamento de ' || SPLIT_PART(COALESCE(NEW.descricao, 'Cobrança'), ' — ', 1));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_cobranca_posta_movimento() IS
  'Posta débito/estorno na conta-corrente a partir de contrato_cobrancas. '
  'Ignora valores de 0€ (faturas de cortesia) — conta_movimentos exige valor > 0.';
