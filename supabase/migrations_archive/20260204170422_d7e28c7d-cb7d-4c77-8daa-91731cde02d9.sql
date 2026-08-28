-- 1. Renomear tabela principal
ALTER TABLE bolt_configuracao RENAME TO plataformas_configuracao;

-- 2. Adicionar novas colunas
ALTER TABLE plataformas_configuracao 
  ADD COLUMN IF NOT EXISTS nome TEXT NOT NULL DEFAULT 'Integração Principal',
  ADD COLUMN IF NOT EXISTS plataforma TEXT NOT NULL DEFAULT 'bolt';

-- 3. Adicionar integracao_id às tabelas de dados
ALTER TABLE bolt_viagens 
  ADD COLUMN IF NOT EXISTS integracao_id UUID REFERENCES plataformas_configuracao(id);

ALTER TABLE bolt_drivers 
  ADD COLUMN IF NOT EXISTS integracao_id UUID REFERENCES plataformas_configuracao(id);

ALTER TABLE bolt_vehicles 
  ADD COLUMN IF NOT EXISTS integracao_id UUID REFERENCES plataformas_configuracao(id);

ALTER TABLE bolt_mapeamento_motoristas
  ADD COLUMN IF NOT EXISTS integracao_id UUID REFERENCES plataformas_configuracao(id);

ALTER TABLE bolt_sync_logs
  ADD COLUMN IF NOT EXISTS integracao_id UUID REFERENCES plataformas_configuracao(id);

-- 4. Actualizar registos existentes (assumindo uma única integração)
UPDATE bolt_viagens SET integracao_id = (SELECT id FROM plataformas_configuracao LIMIT 1) WHERE integracao_id IS NULL;
UPDATE bolt_drivers SET integracao_id = (SELECT id FROM plataformas_configuracao LIMIT 1) WHERE integracao_id IS NULL;
UPDATE bolt_vehicles SET integracao_id = (SELECT id FROM plataformas_configuracao LIMIT 1) WHERE integracao_id IS NULL;
UPDATE bolt_mapeamento_motoristas SET integracao_id = (SELECT id FROM plataformas_configuracao LIMIT 1) WHERE integracao_id IS NULL;
UPDATE bolt_sync_logs SET integracao_id = (SELECT id FROM plataformas_configuracao LIMIT 1) WHERE integracao_id IS NULL;

-- 5. Criar índices
CREATE INDEX IF NOT EXISTS idx_plataformas_plataforma ON plataformas_configuracao(plataforma);
CREATE INDEX IF NOT EXISTS idx_plataformas_ativo ON plataformas_configuracao(ativo);
CREATE INDEX IF NOT EXISTS idx_bolt_viagens_integracao ON bolt_viagens(integracao_id);
CREATE INDEX IF NOT EXISTS idx_bolt_drivers_integracao ON bolt_drivers(integracao_id);
CREATE INDEX IF NOT EXISTS idx_bolt_vehicles_integracao ON bolt_vehicles(integracao_id);
CREATE INDEX IF NOT EXISTS idx_bolt_mapeamento_integracao ON bolt_mapeamento_motoristas(integracao_id);
CREATE INDEX IF NOT EXISTS idx_bolt_sync_logs_integracao ON bolt_sync_logs(integracao_id);

-- 6. Actualizar RLS policies (renomear referências)
DROP POLICY IF EXISTS "Admins podem gerir configuração Bolt" ON plataformas_configuracao;
CREATE POLICY "Admins podem gerir configuração plataformas"
  ON plataformas_configuracao FOR ALL
  USING (is_current_user_admin() = true)
  WITH CHECK (is_current_user_admin() = true);