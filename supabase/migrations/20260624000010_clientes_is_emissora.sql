-- ============================================================
-- Separar empresas EMISSORAS dos clientes que são empresas
-- ------------------------------------------------------------
-- Tudo o que precisa de uma "empresa" (emissor de contratos/reservas,
-- document_templates, faturação) aponta para clientes.id. Mas a aba Empresas e
-- o EmissorSelect mostravam TODOS os clientes tipo='empresa', misturando as
-- empresas do grupo (emissoras) com clientes que por acaso são empresas.
--
-- `is_emissora` marca as emissoras. A aba Empresas e o EmissorSelect passam a
-- filtrar por isto; os clientes-empresa continuam na lista de Clientes.
-- Contratos antigos não são afetados (emissor_id é FK por id, não pelo filtro).
-- Idempotente.
-- ============================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS is_emissora boolean NOT NULL DEFAULT false;

-- Backfill: as emissoras atuais (Urbango, Dasp Rent Sul, Década Ousada, Distância Arrojada).
DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.clientes SET is_emissora = true
  WHERE tipo_cliente = 'empresa' AND deleted_at IS NULL AND (
       nome ILIKE '%urbango%'
    OR nome ILIKE '%dasp%sul%'
    OR nome ILIKE '%cada ousada%'   -- Década Ousada (sem depender do acento)
    OR nome ILIKE '%arrojada%'      -- Distância Arrojada
  );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Empresas emissoras marcadas: % (esperado: 4).', v_rows;
END $$;

-- Verificação (correr à parte para confirmar quais ficaram marcadas):
--   SELECT nome, nif, is_emissora FROM public.clientes
--   WHERE tipo_cliente = 'empresa' AND deleted_at IS NULL
--   ORDER BY is_emissora DESC, nome;
