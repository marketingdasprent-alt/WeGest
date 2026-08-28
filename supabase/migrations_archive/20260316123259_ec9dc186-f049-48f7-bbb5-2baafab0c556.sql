CREATE OR REPLACE FUNCTION public.normalize_plate(input_plate text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(input_plate, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_owner_name(input_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(lower(trim(regexp_replace(COALESCE(input_name, ''), '\s+', ' ', 'g'))), '');
$$;

CREATE TABLE IF NOT EXISTS public.viatura_proprietarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.viatura_proprietarios ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS viatura_proprietarios_nome_normalizado_idx
  ON public.viatura_proprietarios (public.normalize_owner_name(nome));

CREATE POLICY "Permissão para ver proprietários de viaturas"
ON public.viatura_proprietarios
FOR SELECT
TO authenticated
USING (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_ver'::text));

CREATE POLICY "Permissão para criar proprietários de viaturas"
ON public.viatura_proprietarios
FOR INSERT
TO authenticated
WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_criar'::text));

CREATE POLICY "Permissão para editar proprietários de viaturas"
ON public.viatura_proprietarios
FOR UPDATE
TO authenticated
USING (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar'::text));

CREATE POLICY "Permissão para eliminar proprietários de viaturas"
ON public.viatura_proprietarios
FOR DELETE
TO authenticated
USING (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_eliminar'::text));

CREATE TRIGGER update_viatura_proprietarios_updated_at
BEFORE UPDATE ON public.viatura_proprietarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS proprietario_id uuid REFERENCES public.viatura_proprietarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_venda date;

CREATE INDEX IF NOT EXISTS viaturas_proprietario_id_idx
  ON public.viaturas (proprietario_id);

CREATE INDEX IF NOT EXISTS viaturas_matricula_normalizada_idx
  ON public.viaturas (public.normalize_plate(matricula));