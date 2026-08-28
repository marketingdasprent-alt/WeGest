-- Remover trigger problemático se existir
DROP TRIGGER IF EXISTS update_contratos_updated_at ON contratos;

-- Adicionar campo de versão na tabela contratos
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS versao INTEGER DEFAULT 1;

-- Atualizar contratos existentes para versão 1
UPDATE contratos SET versao = 1 WHERE versao IS NULL;

-- Função para incrementar versão automaticamente
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
$$ LANGUAGE plpgsql;

-- Trigger para incrementar versão automaticamente em cada update
DROP TRIGGER IF EXISTS update_contract_version ON contratos;
CREATE TRIGGER update_contract_version
BEFORE UPDATE ON contratos
FOR EACH ROW
EXECUTE FUNCTION increment_contract_version();

-- Identificar e marcar contratos duplicados como 'substituido'
WITH ranked_contratos AS (
  SELECT 
    id,
    motorista_id,
    ROW_NUMBER() OVER (
      PARTITION BY motorista_id 
      ORDER BY criado_em DESC
    ) as rn
  FROM contratos
  WHERE status = 'ativo'
)
UPDATE contratos
SET status = 'substituido'
WHERE id IN (
  SELECT id FROM ranked_contratos WHERE rn > 1
);