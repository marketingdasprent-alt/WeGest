
-- Tabela para transações de combustível da BP Fleet API
CREATE TABLE public.bp_transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.bp_cartoes(id) ON DELETE SET NULL,
  transaction_id text NOT NULL,
  amount numeric(10,2) DEFAULT 0,
  quantity numeric(10,3) DEFAULT NULL,
  fuel_type text DEFAULT NULL,
  transaction_date timestamptz NOT NULL,
  station_name text DEFAULT NULL,
  station_location text DEFAULT NULL,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  viatura_id uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  raw_data jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(integracao_id, transaction_id)
);

-- RLS
ALTER TABLE public.bp_transacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bp_transacoes"
  ON public.bp_transacoes
  FOR ALL
  TO authenticated
  USING (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'administrativo'))
  WITH CHECK (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'administrativo'));

-- Index for date range queries
CREATE INDEX idx_bp_transacoes_date ON public.bp_transacoes(transaction_date);
CREATE INDEX idx_bp_transacoes_motorista ON public.bp_transacoes(motorista_id);
