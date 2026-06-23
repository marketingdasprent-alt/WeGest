-- ============================================================
-- Via Verde (portagens) — tabela de transações + integração
-- ============================================================
-- A Via Verde identifica o veículo pela MATRÍCULA (não há cartão/motorista
-- direto). A atribuição ao motorista faz-se: matrícula → viatura → motorista
-- que tinha a viatura NA DATA da portagem (motorista_viaturas data_inicio/fim).
-- Importado via edge function viaverde-import-csv; soma na coluna "Portagens".
-- ============================================================

CREATE TABLE IF NOT EXISTS public.via_verde_transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  org_id uuid DEFAULT get_current_org_id(),
  transaction_id text NOT NULL,
  contrato text,
  nr_equipamento text,
  matricula text,
  viatura_id uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  tipo_evento text,
  transaction_date timestamptz,
  barreira_saida text,
  barreira_entrada text,
  operador text,
  amount numeric DEFAULT 0,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (integracao_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_via_verde_tx_data ON public.via_verde_transacoes(transaction_date);
CREATE INDEX IF NOT EXISTS idx_via_verde_tx_motorista ON public.via_verde_transacoes(motorista_id);

ALTER TABLE public.via_verde_transacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_via_verde_tx_all" ON public.via_verde_transacoes;
CREATE POLICY "mt_via_verde_tx_all" ON public.via_verde_transacoes
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND can_view_financeiro())
  WITH CHECK (org_id = get_current_org_id() AND can_view_financeiro());
