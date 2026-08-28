-- ============================================================
-- Empresa emissora da viatura
-- ============================================================
-- A viatura passa a poder ter uma empresa emissora própria
-- (cliente com is_emissora=true). Ao escolher a viatura num
-- contrato, o campo emissor_id do contrato é sugerido a partir
-- daqui (só quando ainda estiver vazio — não sobrescreve escolha
-- manual). Mesmo eixo de 20260611000001_emissor_reservas_contratos.sql.
-- ============================================================

ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS emissor_id uuid
    REFERENCES public.clientes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.viaturas.emissor_id IS
  'Empresa emissora sugerida para contratos que usem esta viatura '
  '(clientes.id com is_emissora=true). Preenchimento no cadastro da viatura.';

CREATE INDEX IF NOT EXISTS idx_viaturas_emissor
  ON public.viaturas (emissor_id)
  WHERE emissor_id IS NOT NULL;
