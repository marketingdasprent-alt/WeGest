-- ============================================================
-- KM não disponível no ticket de assistência
-- ============================================================
-- Permite flexibilizar a obrigatoriedade do KM (início e fim) quando não é
-- possível ler o quilómetro naquele caso específico (ex.: viatura não liga).
-- O gestor marca "KM não disponível" e o campo deixa de ser obrigatório;
-- nesse caso km_inicio/km_fim ficam NULL e o km_atual da viatura NÃO é
-- alterado no fecho.
--
-- Idempotente e aditiva (segura para correr em produção).
-- ============================================================

ALTER TABLE public.assistencia_tickets
  ADD COLUMN IF NOT EXISTS km_inicio_indisponivel BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS km_fim_indisponivel BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assistencia_tickets.km_inicio_indisponivel IS 'KM de abertura não pôde ser lido (viatura não liga, etc.) — km_inicio fica NULL';
COMMENT ON COLUMN public.assistencia_tickets.km_fim_indisponivel IS 'KM de fecho não pôde ser lido — km_fim fica NULL e km_atual da viatura não é alterado';
