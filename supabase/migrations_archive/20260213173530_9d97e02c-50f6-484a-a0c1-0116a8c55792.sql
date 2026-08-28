
-- 1. Criar tabela email_sends
CREATE TABLE public.email_sends (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id uuid NOT NULL REFERENCES public.marketing_campanhas(id) ON DELETE CASCADE,
  envio_id uuid REFERENCES public.marketing_envios(id) ON DELETE SET NULL,
  email text NOT NULL,
  nome text,
  brevo_message_id text,
  status text NOT NULL DEFAULT 'sent',
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  bounce_type text,
  error_message text,
  last_event text DEFAULT 'sent',
  last_event_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices para performance
CREATE INDEX idx_email_sends_campanha_id ON public.email_sends(campanha_id);
CREATE INDEX idx_email_sends_brevo_message_id ON public.email_sends(brevo_message_id);
CREATE INDEX idx_email_sends_email ON public.email_sends(email);
CREATE INDEX idx_email_sends_status ON public.email_sends(status);

-- RLS
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view email_sends"
  ON public.email_sends FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert email_sends"
  ON public.email_sends FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update email_sends"
  ON public.email_sends FOR UPDATE
  USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_email_sends_updated_at
  BEFORE UPDATE ON public.email_sends
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Adicionar colunas de contadores a marketing_campanhas
ALTER TABLE public.marketing_campanhas
  ADD COLUMN IF NOT EXISTS total_entregues integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_abertos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_clicados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_bounces integer NOT NULL DEFAULT 0;
