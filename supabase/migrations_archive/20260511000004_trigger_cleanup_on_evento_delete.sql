-- Trigger: when an 'entrega' calendario event is deleted,
-- automatically release the vehicle and close related records.
CREATE OR REPLACE FUNCTION fn_cleanup_on_evento_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tipo = 'entrega' THEN
    -- Close motorista_viaturas linked via contrato
    UPDATE motorista_viaturas mv
    SET status = 'encerrado', data_fim = CURRENT_DATE
    FROM contratos ct
    WHERE ct.calendario_evento_id = OLD.id
      AND mv.motorista_id = ct.motorista_id
      AND mv.viatura_id = ct.viatura_id
      AND mv.status = 'ativo';

    -- Release viatura linked via contrato
    UPDATE viaturas v
    SET status = 'disponivel'
    FROM contratos ct
    WHERE ct.calendario_evento_id = OLD.id
      AND v.id = ct.viatura_id;

    -- Close the contrato
    UPDATE contratos
    SET status = 'encerrado'
    WHERE calendario_evento_id = OLD.id AND status = 'ativo';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_cleanup_on_evento_delete ON calendario_eventos;
CREATE TRIGGER trigger_cleanup_on_evento_delete
  BEFORE DELETE ON calendario_eventos
  FOR EACH ROW EXECUTE FUNCTION fn_cleanup_on_evento_delete();
