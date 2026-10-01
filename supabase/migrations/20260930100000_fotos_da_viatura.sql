-- ============================================================================
-- Fotos da viatura: até 8 por viatura, ordenáveis; a PRIMEIRA é a capa.
-- ============================================================================
-- Reutiliza viatura_documentos (tipo_documento = 'foto'): a RLS da tabela e as
-- políticas do bucket viatura-documentos já cobrem ler/escrever/apagar.
-- Idempotente e aditiva.

ALTER TABLE public.viatura_documentos
  ADD COLUMN IF NOT EXISTS ordem integer,
  ADD COLUMN IF NOT EXISTS miniatura_url text;

COMMENT ON COLUMN public.viatura_documentos.ordem IS
  'Posição da foto (tipo_documento = foto). A de menor ordem é a capa.';
COMMENT ON COLUMN public.viatura_documentos.miniatura_url IS
  'Versão reduzida da foto no bucket viatura-documentos, para listas.';

CREATE INDEX IF NOT EXISTS idx_viatura_documentos_fotos
  ON public.viatura_documentos (viatura_id, ordem)
  WHERE tipo_documento = 'foto';

CREATE INDEX IF NOT EXISTS idx_viatura_documentos_miniatura
  ON public.viatura_documentos (miniatura_url)
  WHERE miniatura_url IS NOT NULL;

-- ── Máximo de 8 e posição no fim — decididos na base; o ecrã é só UX ──────
CREATE OR REPLACE FUNCTION public.viatura_fotos_antes_de_gravar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_max   integer;
BEGIN
  IF NEW.tipo_documento IS DISTINCT FROM 'foto' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.tipo_documento = 'foto' AND OLD.viatura_id = NEW.viatura_id THEN
    RETURN NEW;
  END IF;

  -- Dois uploads em simultâneo não podem passar ambos o limite.
  PERFORM pg_advisory_xact_lock(hashtextextended('viatura_fotos:' || NEW.viatura_id::text, 0));

  SELECT count(*), max(ordem) INTO v_total, v_max
  FROM public.viatura_documentos
  WHERE viatura_id = NEW.viatura_id
    AND tipo_documento = 'foto'
    AND id IS DISTINCT FROM NEW.id;

  IF v_total >= 8 THEN
    RAISE EXCEPTION 'Esta viatura já tem 8 fotos, o máximo permitido.' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.ordem IS NULL THEN
    NEW.ordem := coalesce(v_max, -1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.viatura_fotos_antes_de_gravar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_viatura_fotos_antes_de_gravar ON public.viatura_documentos;
CREATE TRIGGER trg_viatura_fotos_antes_de_gravar
  BEFORE INSERT OR UPDATE OF tipo_documento, viatura_id ON public.viatura_documentos
  FOR EACH ROW EXECUTE FUNCTION public.viatura_fotos_antes_de_gravar();

-- ── Reordenar numa só instrução (arrastar no ecrã) ────────────────────────
-- SECURITY INVOKER: quem não pode editar a viatura não altera nada (RLS).
CREATE OR REPLACE FUNCTION public.reordenar_fotos_viatura(p_viatura_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.viatura_documentos vd
     SET ordem = x.pos - 1,
         updated_at = now()
    FROM unnest(p_ids) WITH ORDINALITY AS x(id, pos)
   WHERE vd.id = x.id
     AND vd.viatura_id = p_viatura_id
     AND vd.tipo_documento = 'foto';
$$;

REVOKE ALL ON FUNCTION public.reordenar_fotos_viatura(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reordenar_fotos_viatura(uuid, uuid[]) TO authenticated;

-- ── Capa de cada viatura (para a lista) ───────────────────────────────────
-- A primeira pela ordem; apagar a capa promove a seguinte sem mais nada.
CREATE OR REPLACE VIEW public.viatura_capas
WITH (security_invoker = true) AS
SELECT DISTINCT ON (vd.viatura_id)
       vd.viatura_id,
       vd.id AS foto_id,
       vd.ficheiro_url,
       vd.miniatura_url
  FROM public.viatura_documentos vd
 WHERE vd.tipo_documento = 'foto'
 ORDER BY vd.viatura_id, vd.ordem NULLS LAST, vd.created_at;

REVOKE ALL ON TABLE public.viatura_capas FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.viatura_capas TO authenticated, service_role;

-- ── Bucket: a miniatura herda a leitura da linha, como o ficheiro ─────────
-- Igual a 20260925150000, mais o ramo da miniatura_url.
DROP POLICY IF EXISTS viatura_documentos_select ON storage.objects;
CREATE POLICY viatura_documentos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'viatura-documentos'
    AND (
      EXISTS (SELECT 1 FROM public.viatura_documentos vd WHERE vd.ficheiro_url = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.viatura_documentos vd WHERE vd.miniatura_url = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.viatura_dano_fotos f WHERE f.ficheiro_url = storage.objects.name)
      OR public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'viaturas_editar')
      OR public.has_permission(auth.uid(), 'motoristas_gestao')
    )
  );

NOTIFY pgrst, 'reload schema';
