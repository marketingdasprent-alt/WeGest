-- ============================================================
-- Tipos de Viatura e Combustíveis — padrão obrigatório em todas as orgs
-- ============================================================
--   Tipos:        Comercial, Passageiros, Slot, TVDE
--   Combustíveis: Gasolina, Diesel, Elétrico, Híbrido/Gasolina,
--                 Híbrido/Diesel, Híbrido Plug-in, Bi-Fuel - Gasolina/GPL
--
-- Idempotente e aditiva. Match de nome case-insensitive e sem espaços nas
-- pontas, para NÃO duplicar linhas já criadas à mão nalgumas orgs. Continuam
-- editáveis nas páginas de Definições — isto só garante que toda org (novas
-- e já existentes) arranca com estas linhas por omissão, tal como já
-- acontece com os cargos base (ver ensure_base_cargos).
-- ============================================================

-- ── Tipos de Viatura ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_default_viatura_tipos(_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.viatura_tipos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'comercial'
  ) THEN
    INSERT INTO public.viatura_tipos (nome, org_id) VALUES ('Comercial', _org_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.viatura_tipos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'passageiros'
  ) THEN
    INSERT INTO public.viatura_tipos (nome, org_id) VALUES ('Passageiros', _org_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.viatura_tipos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'slot'
  ) THEN
    INSERT INTO public.viatura_tipos (nome, org_id) VALUES ('Slot', _org_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.viatura_tipos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'tvde'
  ) THEN
    INSERT INTO public.viatura_tipos (nome, org_id, elegivel_tvde) VALUES ('TVDE', _org_id, true);
  END IF;
END;
$$;

-- ── Combustíveis ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_default_viatura_combustiveis(_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nome text;
BEGIN
  FOREACH _nome IN ARRAY ARRAY[
    'Gasolina',
    'Diesel',
    'Elétrico',
    'Híbrido/Gasolina',
    'Híbrido/Diesel',
    'Híbrido Plug-in',
    'Bi-Fuel - Gasolina/GPL'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.viatura_combustiveis
      WHERE org_id = _org_id AND btrim(lower(nome)) = btrim(lower(_nome))
    ) THEN
      INSERT INTO public.viatura_combustiveis (nome, org_id) VALUES (_nome, _org_id);
    END IF;
  END LOOP;
END;
$$;

-- Trigger: ao criar uma org, garantir os tipos + combustíveis por omissão.
CREATE OR REPLACE FUNCTION public.auto_create_default_viatura_catalogos()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_default_viatura_tipos(NEW.id);
  PERFORM public.ensure_default_viatura_combustiveis(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_default_viatura_catalogos ON public.organizacoes;
CREATE TRIGGER trigger_auto_create_default_viatura_catalogos
AFTER INSERT ON public.organizacoes
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_default_viatura_catalogos();

-- Backfill: garantir as linhas em TODAS as orgs já existentes.
DO $$
DECLARE _o record;
BEGIN
  FOR _o IN SELECT id FROM public.organizacoes LOOP
    PERFORM public.ensure_default_viatura_tipos(_o.id);
    PERFORM public.ensure_default_viatura_combustiveis(_o.id);
  END LOOP;
END $$;
