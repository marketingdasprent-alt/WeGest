-- Update RLS policies for calendario_eventos to allow users with 'calendario_editar_todos' permission
-- to edit and delete all events.

-- DROP existing policies first to replace them
DROP POLICY IF EXISTS "Users can update their own events" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Users can delete their own events" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Users can update events" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Users can delete events" ON public.calendario_eventos;

-- UPDATE POLICY
CREATE POLICY "Users can update events"
  ON public.calendario_eventos FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = criado_por OR
    public.has_permission(auth.uid(), 'calendario_editar_todos')
  );

-- DELETE POLICY
CREATE POLICY "Users can delete events"
  ON public.calendario_eventos FOR DELETE
  TO authenticated
  USING (
    auth.uid() = criado_por OR
    public.has_permission(auth.uid(), 'calendario_editar_todos')
  );

-- Inserir recurso
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES ('calendario_editar_todos', 'Editar e apagar eventos de todos os gestores', 'Calendário')
ON CONFLICT (nome) DO NOTHING;
