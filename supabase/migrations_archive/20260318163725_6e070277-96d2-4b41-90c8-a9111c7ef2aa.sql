
CREATE TABLE public.bp_cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID NOT NULL REFERENCES plataformas_configuracao(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  card_number TEXT,
  card_status TEXT,
  driver_name TEXT,
  vehicle_registration TEXT,
  expiry_date TEXT,
  card_type TEXT,
  motorista_id UUID REFERENCES motoristas_ativos(id),
  viatura_id UUID REFERENCES viaturas(id),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(integracao_id, card_id)
);

ALTER TABLE public.bp_cartoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerir cartões BP"
ON public.bp_cartoes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
