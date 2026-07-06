-- ============================================================
-- Cartões frota: atribuição a motorista + ciclo de vida
-- ============================================================
-- Novas colunas para o fluxo Entrega/Devolução:
--   • status               → ciclo de vida do cartão
--   • data_entrega         → data de entrega ao motorista
--   • data_devolucao       → data de devolução
--   • ultimo_motorista_id  → motorista anterior (preenchido ao trocar)
--
-- Idempotente e aditiva. Não remove `ativo` (mantido p/ compat. do
-- export/impressão) — passa a ser sincronizado a partir do status.
-- ============================================================

ALTER TABLE public.cartoes_frota
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'disponivel',
  ADD COLUMN IF NOT EXISTS data_entrega date,
  ADD COLUMN IF NOT EXISTS data_devolucao date,
  ADD COLUMN IF NOT EXISTS ultimo_motorista_id uuid;

-- FK do último motorista → mesma tabela que motorista_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cartoes_frota_ultimo_motorista_id_fkey'
  ) THEN
    ALTER TABLE public.cartoes_frota
      ADD CONSTRAINT cartoes_frota_ultimo_motorista_id_fkey
      FOREIGN KEY (ultimo_motorista_id)
      REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Valores válidos do ciclo de vida
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cartoes_frota_status_check'
  ) THEN
    ALTER TABLE public.cartoes_frota
      ADD CONSTRAINT cartoes_frota_status_check
      CHECK (status IN ('disponivel', 'atribuido', 'devolvido', 'perdido', 'bloqueado'));
  END IF;
END $$;

-- Backfill: cartões já atribuídos a um motorista ficam "atribuído"
UPDATE public.cartoes_frota
SET status = 'atribuido'
WHERE motorista_id IS NOT NULL AND status = 'disponivel';
