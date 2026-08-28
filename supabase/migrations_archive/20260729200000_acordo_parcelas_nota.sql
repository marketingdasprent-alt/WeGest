-- supabase/migrations/20260729200000_acordo_parcelas_nota.sql
-- ============================================================
-- Nota interna por parcela do acordo
-- ============================================================
-- Pedido ao testar manualmente: permitir uma nota livre por parcela (ex.:
-- "cliente pediu adiamento", "confirmado por telefone") — puramente
-- informativa, nunca lida por nenhuma lógica de negócio (avisos, liquidação,
-- reversão). Só staff (mesma RLS já existente em mt_parcelas_update); nunca
-- exposta na vista do devedor (acordo_vista_devedor não a seleciona).

ALTER TABLE public.acordo_parcelas ADD COLUMN IF NOT EXISTS nota text;

COMMENT ON COLUMN public.acordo_parcelas.nota IS
  'Nota interna livre, só para staff — puramente informativa, nunca lida por avisos/liquidação/reversão.';
