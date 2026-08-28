-- Fix RLS policies for calendario_eventos:
-- The resource is named 'calendario_gerir_todos' in the DB, not 'calendario_editar_todos'.
-- Update policies to use the correct resource name.

DROP POLICY IF EXISTS "Users can update events" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Users can delete events" ON public.calendario_eventos;

CREATE POLICY "Users can update events"
  ON public.calendario_eventos FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = criado_por OR
    public.is_current_user_admin() OR
    public.has_permission(auth.uid(), 'calendario_gerir_todos')
  );

CREATE POLICY "Users can delete events"
  ON public.calendario_eventos FOR DELETE
  TO authenticated
  USING (
    auth.uid() = criado_por OR
    public.is_current_user_admin() OR
    public.has_permission(auth.uid(), 'calendario_gerir_todos')
  );

-- Remove the orphaned resource that was never used
DELETE FROM public.recursos WHERE nome = 'calendario_editar_todos';
