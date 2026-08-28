-- ============================================================
-- Garantir SELECT público (anon) de organizacoes por código
-- ============================================================
-- O registo de motorista (/motorista/registo?org=CODIGO) resolve
-- codigo -> org_id ANTES de qualquer sessão (anon). Depende de uma
-- policy permissiva de SELECT em organizacoes acessível a anon.
--
-- A policy "Permitir verificar codigo de org publicamente"
-- (20260514000002) já faz isto com USING (true). Esta migration é
-- idempotente e defensiva: re-garante a policy caso uma migration
-- de isolamento RLS (rls_org_isolation*) a tenha removido ou
-- adicionado uma RESTRICTIVE que a anule para anon.
--
-- Nota: o isolamento org (20260520000006) aplica RESTRICTIVE apenas
-- a 'user_organizacoes' e TO authenticated — NÃO a 'organizacoes' e
-- NÃO a anon — logo não bloqueia este SELECT. Mantemos esta garantia
-- para resistir a futuras catch-ups.
--
-- Deploy: aplicar à mão no SQL editor (CI não faz db push).
-- ============================================================

ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;

-- Recriar a policy pública de SELECT de forma idempotente.
DROP POLICY IF EXISTS "Permitir verificar codigo de org publicamente"
  ON public.organizacoes;

CREATE POLICY "Permitir verificar codigo de org publicamente"
  ON public.organizacoes FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- VERIFICAÇÃO (correr manualmente após aplicar):
--   Com a anon key, sem sessão:
--     select id, nome from public.organizacoes
--       where codigo = '<CODIGO_REAL>' and ativa = true;
--   Esperado: 1 linha. Se vier vazio, há uma RESTRICTIVE a anular —
--   investigar policies de organizacoes antes de prosseguir.
-- ============================================================
