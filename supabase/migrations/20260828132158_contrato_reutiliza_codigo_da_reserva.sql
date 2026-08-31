-- ============================================================================
-- Número do contrato reutilizado quando a reserva volta a virar contrato
-- ============================================================================
--
-- RECUPERADA DE PRODUÇÃO, NÃO ESCRITA DE RAIZ.
--
-- Foi aplicada directamente à base a 2026-08-28 (painel ou MCP) sem ficheiro no
-- repositório. O SQL abaixo é o que `supabase_migrations.schema_migrations`
-- guardou em `statements` para a versão 20260828132158, copiado tal e qual.
--
-- O carimbo do ficheiro é o MESMO que produção registou. É isso que faz o
-- registo e o repositório passarem a concordar: sem ele, um clone novo não
-- reproduzia esta função e o gate de deriva continuava a acusá-la.
--
-- É posterior ao cutover para baseline (o ficheiro arquivado mais recente é
-- 20260828085759), portanto o dump da baseline NÃO a contém — este ficheiro
-- tem mesmo de correr numa reconstrução de raiz. É idempotente: `create or
-- replace`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_contrato_renting_codigo_por_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo_anterior integer;
BEGIN
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'contratos_renting.org_id é obrigatório para gerar código por org';
  END IF;

  IF NEW.codigo IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('contratos_renting_codigo:' || NEW.org_id::text)
  );

  IF NEW.reserva_id IS NOT NULL THEN
    SELECT c.codigo
      INTO v_codigo_anterior
      FROM public.contratos_renting c
     WHERE c.reserva_id = NEW.reserva_id
       AND c.org_id = NEW.org_id
       AND c.codigo IS NOT NULL
     ORDER BY c.created_at DESC
     LIMIT 1;

    IF v_codigo_anterior IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM public.contratos_renting c
       WHERE c.org_id = NEW.org_id
         AND c.codigo = v_codigo_anterior
         AND c.deleted_at IS NULL
         AND c.substituido_em IS NULL
    ) THEN
      NEW.codigo := v_codigo_anterior;
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(codigo), 0) + 1
    INTO NEW.codigo
    FROM public.contratos_renting
   WHERE org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_contrato_renting_codigo_por_org() IS
  'Número do contrato por organização. Uma reserva que volta a virar contrato recupera o número do contrato anterior (que está livre por estar em soft-delete); caso contrário, MAX+1.';
