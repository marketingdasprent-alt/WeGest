-- Substituir "Estorno de ..." por "Anulamento de ..." nos descritivos dos movimentos.
-- O trigger da cobrança já foi atualizado em 20260618000001.

-- Recibo anulado
CREATE OR REPLACE FUNCTION public.fn_recibo_posta_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ativo' THEN
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem, recibo_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.entidade_id, 'credito', NEW.valor, 'recibo',
         NEW.id, NEW.contrato_id, COALESCE('Recibo nº ' || NEW.codigo, 'Recibo'));
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'ativo' AND NEW.estado = 'anulado' THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, recibo_id, contrato_id, descricao)
    VALUES
      (NEW.org_id, NEW.entidade_id, 'debito', NEW.valor, 'recibo',
       NEW.id, NEW.contrato_id,
       'Anulamento de Recibo' || COALESCE(' nº ' || NEW.codigo, ''));
  END IF;

  RETURN NULL;
END;
$$;

-- Nota de crédito anulada
CREATE OR REPLACE FUNCTION public.fn_nota_credito_posta_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ativo' THEN
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, data_movimento, tipo, valor, origem,
         nota_credito_id, cobranca_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.entidade_id, NEW.data_nota, 'credito', NEW.valor, 'nota_credito',
         NEW.id, NEW.cobranca_id, NEW.contrato_id,
         'Nota de Crédito Nº ' || NEW.codigo || ' — ' || NEW.motivo);
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'ativo' AND NEW.estado = 'anulado' THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem,
       nota_credito_id, cobranca_id, contrato_id, descricao)
    VALUES
      (NEW.org_id, NEW.entidade_id, 'debito', NEW.valor, 'nota_credito',
       NEW.id, NEW.cobranca_id, NEW.contrato_id,
       'Anulamento de Nota de Crédito Nº ' || NEW.codigo);
  END IF;

  RETURN NULL;
END;
$$;
