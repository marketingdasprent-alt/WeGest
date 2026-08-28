-- ============================================================
-- Primavera V10 Integration — API Keys & Audit Log
-- ============================================================

-- 1. Tabela de API Keys
CREATE TABLE IF NOT EXISTS primavera_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  api_secret TEXT,
  permissoes TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT true,
  ip_whitelist TEXT[] DEFAULT '{}',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  total_requests BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index para lookup rápido por api_key
CREATE INDEX idx_primavera_api_keys_key ON primavera_api_keys(api_key);
CREATE INDEX idx_primavera_api_keys_org ON primavera_api_keys(org_id);

-- RLS
ALTER TABLE primavera_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerir API keys"
  ON primavera_api_keys
  FOR ALL
  USING (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

-- 2. Tabela de logs de auditoria
CREATE TABLE IF NOT EXISTS primavera_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES primavera_api_keys(id) ON DELETE SET NULL,
  org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  request_body JSONB,
  response_summary TEXT,
  ip_address TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes para consultas de logs
CREATE INDEX idx_primavera_api_logs_key ON primavera_api_logs(api_key_id);
CREATE INDEX idx_primavera_api_logs_org ON primavera_api_logs(org_id);
CREATE INDEX idx_primavera_api_logs_created ON primavera_api_logs(created_at DESC);

-- RLS
ALTER TABLE primavera_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver logs"
  ON primavera_api_logs
  FOR SELECT
  USING (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );

-- 3. Função para gerar API key
CREATE OR REPLACE FUNCTION generate_primavera_api_key()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'wg_' || encode(gen_random_bytes(36), 'hex');
END;
$$;

-- 4. Inserir chaves iniciais para as duas organizações
INSERT INTO primavera_api_keys (org_id, nome, api_key, permissoes, created_by)
SELECT
  o.id,
  'Primavera V10 — ' || o.nome,
  generate_primavera_api_key(),
  ARRAY[
    'clientes:read', 'clientes:write',
    'faturas:read', 'faturas:write',
    'recibos:read', 'recibos:write',
    'contas_correntes:read', 'contas_correntes:write',
    'contratos:read'
  ],
  NULL
FROM organizacoes o
WHERE o.codigo IN ('decada', 'distancia');
