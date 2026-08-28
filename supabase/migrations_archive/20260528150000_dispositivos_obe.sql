-- ============================================================
-- Dispositivos OBE (Via Verde transponders) por organização
-- O nr_equipamento liga a via_verde_transacoes.nr_equipamento
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dispositivos_obe (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL DEFAULT get_current_org_id(),
  nr_equipamento text NOT NULL,
  viatura_id     uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  contrato       text,
  ativo          boolean NOT NULL DEFAULT true,
  notas          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, nr_equipamento)
);

CREATE INDEX IF NOT EXISTS idx_dispositivos_obe_viatura ON public.dispositivos_obe (viatura_id);

ALTER TABLE public.dispositivos_obe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obe_all" ON public.dispositivos_obe
  FOR ALL TO authenticated
  USING  (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

CREATE TRIGGER trg_dispositivos_obe_updated_at
  BEFORE UPDATE ON public.dispositivos_obe
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RPC: histórico de portagens por equipamento ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_obe_historico_portagens(p_nr_equipamento text)
RETURNS TABLE (
  transaction_date  timestamptz,
  amount            numeric,
  barreira_entrada  text,
  barreira_saida    text,
  operador          text,
  matricula         text,
  motorista_nome    text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    t.transaction_date,
    t.amount,
    t.barreira_entrada,
    t.barreira_saida,
    t.operador,
    t.matricula,
    m.nome
  FROM public.via_verde_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE t.nr_equipamento = p_nr_equipamento
  ORDER BY t.transaction_date DESC
  LIMIT 200
$$;

GRANT EXECUTE ON FUNCTION public.get_obe_historico_portagens(text) TO authenticated;
