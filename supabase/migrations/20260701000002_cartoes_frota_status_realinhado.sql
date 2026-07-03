-- ============================================================
-- Cartões frota: realinhar `status` ao vocabulário real
-- ============================================================
-- Valores: disponivel · em_uso · cancelado · bloqueado · perdido
-- Substitui atribuido/devolvido introduzidos em 20260701000001.
-- Idempotente.
-- ============================================================

ALTER TABLE public.cartoes_frota DROP CONSTRAINT IF EXISTS cartoes_frota_status_check;

-- Converter valores antigos para o novo vocabulário
UPDATE public.cartoes_frota SET status = 'em_uso' WHERE status = 'atribuido';
UPDATE public.cartoes_frota SET status = 'disponivel' WHERE status = 'devolvido';

ALTER TABLE public.cartoes_frota
  ADD CONSTRAINT cartoes_frota_status_check
  CHECK (status IN ('disponivel', 'em_uso', 'cancelado', 'bloqueado', 'perdido'));
