-- Remove a política problemática
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Criar função security definer para verificar se o usuário é admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(is_admin, false) FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Criar política correta usando a função
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_current_user_admin());