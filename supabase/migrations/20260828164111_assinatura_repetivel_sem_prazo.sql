-- ============================================================================
-- O link de assinatura não expira e aceita assinaturas repetidas
-- ============================================================================
--
-- RECUPERADA DE PRODUÇÃO, NÃO ESCRITA DE RAIZ.
--
-- Foi aplicada directamente à base a 2026-08-28 (painel ou MCP) sem ficheiro no
-- repositório. O SQL abaixo é o que `supabase_migrations.schema_migrations`
-- guardou em `statements` para a versão 20260828164111, copiado tal e qual.
--
-- O carimbo do ficheiro é o MESMO que produção registou, para que o registo e o
-- repositório passem a concordar.
--
-- É posterior ao cutover para baseline (o ficheiro arquivado mais recente é
-- 20260828085759), portanto o dump da baseline NÃO contém esta coluna — este
-- ficheiro tem mesmo de correr numa reconstrução de raiz. É idempotente:
-- `add column if not exists`.
--
-- `expires_at` fica na tabela de propósito. Não é aplicada, mas apagá-la
-- perdia o registo de até quando o pedido era válido no desenho antigo.
-- ============================================================================

ALTER TABLE public.documento_assinatura_pedidos
  ADD COLUMN IF NOT EXISTS assinaturas_total integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.documento_assinatura_pedidos.assinaturas_total IS
  'Quantas vezes o documento foi assinado por este link. O link nao expira e aceita assinaturas repetidas; vale sempre a ultima, e assinado_em/assinatura_path/documento_assinado_path guardam essa.';

COMMENT ON COLUMN public.documento_assinatura_pedidos.expires_at IS
  'Data que era o prazo do link. Deixou de ser aplicada: o link nao expira. Fica como registo de quando o pedido foi feito e ate quando era valido no desenho antigo.';
