-- ============================================================
-- RPC: contagem de leads por status numa única query (perf)
-- ============================================================
-- A página de Contatos fazia N counts `count:'exact'` (um por status) sobre
-- leads_dasprent — a tabela de maior volume — a cada montagem. Este RPC faz
-- 1 round-trip e 1 GROUP BY.
--
-- SECURITY INVOKER (default) → o RLS de leads_dasprent aplica-se, por isso a
-- contagem fica automaticamente isolada à org do utilizador.
-- ============================================================

CREATE OR REPLACE FUNCTION public.leads_count_by_status()
RETURNS TABLE (status text, total bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT status, count(*)::bigint
  FROM public.leads_dasprent
  GROUP BY status;
$$;
