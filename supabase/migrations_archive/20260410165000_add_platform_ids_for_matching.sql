
-- Adicionar colunas para mapeamento de IDs de plataformas na tabela de motoristas oficiais
ALTER TABLE motoristas_ativos ADD COLUMN IF NOT EXISTS uber_uuid TEXT;
ALTER TABLE motoristas_ativos ADD COLUMN IF NOT EXISTS bolt_id TEXT;

-- Criar índices para acelerar as buscas de matching durante a importação e dashboard
CREATE INDEX IF NOT EXISTS idx_motoristas_uber_uuid ON motoristas_ativos(uber_uuid);
CREATE INDEX IF NOT EXISTS idx_motoristas_bolt_id ON motoristas_ativos(bolt_id);

-- Comentários para documentação das colunas
COMMENT ON COLUMN motoristas_ativos.uber_uuid IS 'UUID único do motorista na plataforma Uber (usado para matching automático)';
COMMENT ON COLUMN motoristas_ativos.bolt_id IS 'Identificador do motorista na plataforma Bolt (usado para matching automático)';
