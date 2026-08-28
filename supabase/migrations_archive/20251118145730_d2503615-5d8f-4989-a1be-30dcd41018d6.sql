-- Migrar todos os usuários com is_admin=true para terem role 'admin'
INSERT INTO public.user_roles (user_id, role, created_by)
SELECT 
  p.id,
  'admin'::app_role,
  p.id -- O próprio usuário como criador
FROM public.profiles p
WHERE p.is_admin = true
ON CONFLICT (user_id, role) DO NOTHING;