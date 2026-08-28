-- ⚠️ RECUPERADA de supabase_migrations.schema_migrations (2026-08-28).
-- Aplicada a produção a 2026-08-27 sem ficheiro no repositório.
--
-- NOTA DE CORRECÇÃO: a numeração global tinha sido atribuída, por engano, à
-- reconstrução de `20260827113930_ti_tickets_suporte_plataforma.sql`. Ao
-- introspeccionar o schema as duas já estavam aplicadas e não era possível
-- distingui-las. Com o SQL original à vista, a repartição correcta é:
--   20260827113930 → o escape de isolamento para o balcão da plataforma
--   20260827151938 → a numeração global (este ficheiro)
WITH ordenados AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM public.ti_tickets
)
UPDATE public.ti_tickets t
   SET numero = o.n
  FROM ordenados o
 WHERE o.id = t.id
   AND t.numero IS DISTINCT FROM o.n;

CREATE UNIQUE INDEX IF NOT EXISTS ti_tickets_numero_unico ON public.ti_tickets (numero);

DROP TRIGGER IF EXISTS trg_ti_ticket_numero_por_org ON public.ti_tickets;
DROP FUNCTION IF EXISTS public.set_ti_ticket_numero_por_org();

CREATE OR REPLACE FUNCTION public.set_ti_ticket_numero()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ti_tickets_numero'));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO NEW.numero FROM public.ti_tickets;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ti_ticket_numero
  BEFORE INSERT ON public.ti_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ti_ticket_numero();

COMMENT ON FUNCTION public.set_ti_ticket_numero() IS
  'Número sequencial global dos pedidos de TI. Global e não por organização porque a lista de pedidos é uma só para todas as empresas.';
