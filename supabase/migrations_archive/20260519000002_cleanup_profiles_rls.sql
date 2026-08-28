-- ============================================================
-- Limpeza de policies antigas na tabela profiles
-- A policy "Users can view all profiles" com USING(true) anulava
-- a filtragem multi-tenant, permitindo que qualquer user visse
-- todos os profiles de todas as orgs.
-- ============================================================

-- Remover policy permissiva que expõe todos os profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Remover policy antiga que permite qualquer admin editar qualquer profile
-- (sem filtro por org_id — substituída por mt_profiles_update)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Remover outra policy antiga se existir
DROP POLICY IF EXISTS "Permissão para ver perfis" ON public.profiles;

-- As policies multi-tenant já existem e são suficientes:
-- mt_profiles_select: user vê o próprio OU profiles da sua org (se admin/perm)
-- mt_profiles_update: user edita o próprio OU profiles da sua org (se admin)
-- Users can update their own profile: user edita o próprio (redundante mas inofensiva)
