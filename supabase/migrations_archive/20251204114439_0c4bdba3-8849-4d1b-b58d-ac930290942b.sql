-- Remove the trigger that automatically adds TVDE field
DROP TRIGGER IF EXISTS ensure_tvde_field_trigger ON public.formularios;

-- Remove the function as well since it's no longer needed
DROP FUNCTION IF EXISTS public.ensure_tvde_field();