-- 1. Adicionar colunas a viatura_reparacoes
ALTER TABLE public.viatura_reparacoes
  ADD COLUMN IF NOT EXISTS motorista_responsavel_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cobrar_motorista boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_a_cobrar numeric,
  ADD COLUMN IF NOT EXISTS num_parcelas integer,
  ADD COLUMN IF NOT EXISTS data_inicio_cobranca date;

-- 2. Criar tabela reparacao_parcelas
CREATE TABLE IF NOT EXISTS public.reparacao_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reparacao_id uuid NOT NULL REFERENCES public.viatura_reparacoes(id) ON DELETE CASCADE,
  motorista_id uuid NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  numero_parcela integer NOT NULL,
  valor numeric NOT NULL,
  semana_referencia date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  cobrada_em timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(reparacao_id, numero_parcela)
);

-- 3. RLS para reparacao_parcelas
ALTER TABLE public.reparacao_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view parcelas"
  ON public.reparacao_parcelas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert parcelas"
  ON public.reparacao_parcelas FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update parcelas"
  ON public.reparacao_parcelas FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete parcelas"
  ON public.reparacao_parcelas FOR DELETE
  TO authenticated USING (true);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_reparacao_parcelas_semana ON public.reparacao_parcelas(semana_referencia, motorista_id, status);
CREATE INDEX IF NOT EXISTS idx_reparacao_parcelas_reparacao ON public.reparacao_parcelas(reparacao_id);