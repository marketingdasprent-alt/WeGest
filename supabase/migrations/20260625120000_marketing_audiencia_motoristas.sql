-- Audiência automática "Motoristas Ativos" no módulo de Marketing.
-- Idempotente: seguro re-correr no SQL editor.

-- 1. Discriminador de origem da lista
ALTER TABLE public.marketing_listas
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

ALTER TABLE public.marketing_listas
  DROP CONSTRAINT IF EXISTS marketing_listas_origem_check;
ALTER TABLE public.marketing_listas
  ADD CONSTRAINT marketing_listas_origem_check
  CHECK (origem IN ('manual', 'motoristas_ativos'));

-- No máximo uma lista de sistema por org
CREATE UNIQUE INDEX IF NOT EXISTS marketing_listas_sistema_unica
  ON public.marketing_listas (org_id)
  WHERE origem = 'motoristas_ativos';

-- 2. Criação lazy da lista de sistema da org do utilizador
CREATE OR REPLACE FUNCTION public.ensure_lista_motoristas()
RETURNS public.marketing_listas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := get_current_org_id();
  v_row public.marketing_listas;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'sem org no contexto';
  END IF;

  SELECT * INTO v_row
  FROM public.marketing_listas
  WHERE org_id = v_org AND origem = 'motoristas_ativos'
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.marketing_listas (nome, descricao, origem, org_id)
    VALUES ('Motoristas Ativos',
            'Lista automática — todos os motoristas ativos com email.',
            'motoristas_ativos', v_org)
    ON CONFLICT (org_id) WHERE (origem = 'motoristas_ativos') DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      SELECT * INTO v_row
      FROM public.marketing_listas
      WHERE org_id = v_org AND origem = 'motoristas_ativos'
      LIMIT 1;
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

-- 3. Contagem ao vivo (fonte única de "quantos recebem")
CREATE OR REPLACE FUNCTION public.marketing_lista_contagem(p_lista_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := get_current_org_id();
  v_origem text;
  v_lista_org uuid;
  v_count integer;
BEGIN
  SELECT origem, org_id INTO v_origem, v_lista_org
  FROM public.marketing_listas WHERE id = p_lista_id;

  IF v_origem IS NULL THEN
    RETURN 0;
  END IF;
  IF v_lista_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'lista fora da org';
  END IF;

  IF v_origem = 'motoristas_ativos' THEN
    SELECT count(*) INTO v_count
    FROM public.motoristas_ativos
    WHERE org_id = v_org
      AND status_ativo = true
      AND email IS NOT NULL AND email <> ''
      AND perfil_rascunho IS NOT TRUE;
  ELSE
    SELECT count(*) INTO v_count
    FROM public.marketing_contactos
    WHERE lista_id = p_lista_id;
  END IF;

  RETURN coalesce(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_lista_motoristas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_lista_contagem(uuid) TO authenticated;
