CREATE TABLE calendario_eventos_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES calendario_eventos(id) ON DELETE CASCADE,
  editado_por UUID NOT NULL REFERENCES auth.users(id),
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  editado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calendario_eventos_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver historico"
  ON calendario_eventos_historico FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Autenticados podem inserir historico"
  ON calendario_eventos_historico FOR INSERT
  TO authenticated WITH CHECK (true);