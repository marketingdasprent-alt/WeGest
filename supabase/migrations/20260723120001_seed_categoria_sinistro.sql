-- Categoria "Sinistro" por omissão, para todas as orgs (novas e já
-- existentes), para classificar danos que sejam sinistros/cobertos por
-- seguro. Segue o mesmo padrão de catálogos por-org usado em
-- 20260710130000_defaults_viatura_tipos_combustiveis.sql: função
-- idempotente + trigger em organizacoes + backfill.

CREATE OR REPLACE FUNCTION public.ensure_categoria_sinistro(_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.assistencia_categorias
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'sinistro'
  ) THEN
    INSERT INTO public.assistencia_categorias (nome, descricao, cor, icone, ordem, org_id)
    VALUES (
      'Sinistro',
      'Dano coberto por sinistro/seguro',
      '#EC4899',
      'shield-alert',
      8,
      _org_id
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_categoria_sinistro()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_categoria_sinistro(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_categoria_sinistro ON public.organizacoes;
CREATE TRIGGER trigger_auto_create_categoria_sinistro
AFTER INSERT ON public.organizacoes
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_categoria_sinistro();

-- Backfill: garantir a categoria em todas as orgs já existentes.
DO $$
DECLARE _o record;
BEGIN
  FOR _o IN SELECT id FROM public.organizacoes LOOP
    PERFORM public.ensure_categoria_sinistro(_o.id);
  END LOOP;
END $$;
