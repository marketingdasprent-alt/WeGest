-- supabase/migrations/20260625140000_uorg_role_columns.sql
-- Papel per-org: cargo/admin passam a viver em user_organizacoes (aditiva).

ALTER TABLE public.user_organizacoes
  ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_uorg_cargo ON public.user_organizacoes(cargo_id);

-- Backfill: copiar o papel do perfil para o membership da SUA org-casa.
UPDATE public.user_organizacoes uo
SET cargo_id = p.cargo_id,
    is_admin = COALESCE(p.is_admin, false)
FROM public.profiles p
WHERE uo.user_id = p.id
  AND uo.org_id  = p.org_id
  AND (uo.cargo_id IS DISTINCT FROM p.cargo_id
       OR uo.is_admin IS DISTINCT FROM COALESCE(p.is_admin, false));
