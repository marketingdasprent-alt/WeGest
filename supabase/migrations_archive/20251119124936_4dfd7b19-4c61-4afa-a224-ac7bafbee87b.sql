-- Corrigir search_path da função increment_contract_version
CREATE OR REPLACE FUNCTION increment_contract_version()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.empresa_id IS DISTINCT FROM NEW.empresa_id OR
    OLD.data_inicio IS DISTINCT FROM NEW.data_inicio OR
    OLD.data_assinatura IS DISTINCT FROM NEW.data_assinatura OR
    OLD.cidade_assinatura IS DISTINCT FROM NEW.cidade_assinatura OR
    OLD.status IS DISTINCT FROM NEW.status
  ) THEN
    NEW.versao = COALESCE(OLD.versao, 1) + 1;
    NEW.atualizado_em = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;