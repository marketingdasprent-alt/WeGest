-- Add missing fields to motoristas table for Excel import
ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS nib text,
  ADD COLUMN IF NOT EXISTS gestor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caucao numeric;
