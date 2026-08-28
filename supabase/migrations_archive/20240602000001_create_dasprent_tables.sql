
-- Criar tabela da empresa DasPrent
CREATE TABLE IF NOT EXISTS empresa_dasprent (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL DEFAULT 'DasPrent',
  email VARCHAR(255),
  telefone VARCHAR(50),
  endereco TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Criar tabela de funcionários da DasPrent
CREATE TABLE IF NOT EXISTS funcionarios_dasprent (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  telefone VARCHAR(50),
  cargo VARCHAR(100),
  departamento VARCHAR(100),
  data_admissao DATE,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Criar tabela de leads da DasPrent
CREATE TABLE IF NOT EXISTS leads_dasprent (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefone VARCHAR(50),
  zona VARCHAR(100),
  data_aluguer DATE,
  tipo_viatura VARCHAR(50),
  observacoes TEXT,
  status VARCHAR(50) DEFAULT 'novo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir dados iniciais da empresa
INSERT INTO empresa_dasprent (nome, email, telefone, endereco) 
VALUES ('DasPrent', 'contato@dasprent.pt', '+351 123 456 789', 'Lisboa, Portugal')
ON CONFLICT DO NOTHING;

-- Habilitar RLS (Row Level Security)
ALTER TABLE empresa_dasprent ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios_dasprent ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_dasprent ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança para empresa_dasprent
CREATE POLICY "Enable read access for all users" ON empresa_dasprent FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON empresa_dasprent FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON empresa_dasprent FOR UPDATE USING (auth.role() = 'authenticated');

-- Políticas de segurança para funcionarios_dasprent
CREATE POLICY "Enable read access for all users" ON funcionarios_dasprent FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON funcionarios_dasprent FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON funcionarios_dasprent FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users only" ON funcionarios_dasprent FOR DELETE USING (auth.role() = 'authenticated');

-- Políticas de segurança para leads_dasprent
CREATE POLICY "Enable read access for all users" ON leads_dasprent FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON leads_dasprent FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users only" ON leads_dasprent FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users only" ON leads_dasprent FOR DELETE USING (auth.role() = 'authenticated');

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_empresa_dasprent_updated_at BEFORE UPDATE ON empresa_dasprent FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_funcionarios_dasprent_updated_at BEFORE UPDATE ON funcionarios_dasprent FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_dasprent_updated_at BEFORE UPDATE ON leads_dasprent FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
