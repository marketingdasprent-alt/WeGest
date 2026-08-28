
-- Drop the old table (it's empty, just created)
DROP TABLE IF EXISTS public.uber_viagens_detalhadas;

-- Create the correct table for aggregated driver activity
CREATE TABLE public.uber_atividade_motoristas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id UUID NOT NULL REFERENCES plataformas_configuracao(id),
  uber_driver_id TEXT NOT NULL,
  driver_name TEXT,
  viagens_concluidas INTEGER,
  tempo_online_minutos NUMERIC,
  tempo_em_viagem_minutos NUMERIC,
  periodo TEXT,
  raw_row JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(integracao_id, uber_driver_id, periodo)
);

-- RLS
ALTER TABLE public.uber_atividade_motoristas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e gestores podem ver atividade"
  ON public.uber_atividade_motoristas
  FOR SELECT
  TO authenticated
  USING (
    public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'administrativo')
  );

CREATE POLICY "Service role pode inserir atividade"
  ON public.uber_atividade_motoristas
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index
CREATE INDEX idx_uber_atividade_integracao_periodo
  ON public.uber_atividade_motoristas(integracao_id, periodo);

CREATE INDEX idx_uber_atividade_driver
  ON public.uber_atividade_motoristas(uber_driver_id);
