-- Tabela para configurar webhooks de integrações
CREATE TABLE public.integracoes_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  url TEXT NOT NULL,
  evento TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  headers JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  criado_por UUID REFERENCES auth.users(id)
);

-- Índice para buscar webhooks por evento
CREATE INDEX idx_webhooks_evento_ativo ON public.integracoes_webhooks(evento, ativo);

-- Enable RLS
ALTER TABLE public.integracoes_webhooks ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem gerir webhooks
CREATE POLICY "Admins podem gerir webhooks"
  ON public.integracoes_webhooks
  FOR ALL
  USING (public.is_current_user_admin() = true)
  WITH CHECK (public.is_current_user_admin() = true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_integracoes_webhooks_updated_at
  BEFORE UPDATE ON public.integracoes_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir webhook inicial do n8n
INSERT INTO public.integracoes_webhooks (nome, descricao, url, evento, ativo)
VALUES (
  'n8n Tickets',
  'Webhook do n8n para receber novos tickets de assistência',
  'https://n8n-n8n.tx2a4o.easypanel.host/webhook-test/johnathan',
  'ticket_criado',
  true
);