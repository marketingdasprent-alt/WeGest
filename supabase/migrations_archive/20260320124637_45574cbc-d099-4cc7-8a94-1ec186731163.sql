
-- Add logo_url column
ALTER TABLE public.plataformas_configuracao ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create storage bucket for integration logos
INSERT INTO storage.buckets (id, name, public) VALUES ('integracoes-logos', 'integracoes-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read integracoes-logos" ON storage.objects FOR SELECT USING (bucket_id = 'integracoes-logos');

-- Admin upload/delete
CREATE POLICY "Admin upload integracoes-logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'integracoes-logos' AND public.is_current_user_admin());
CREATE POLICY "Admin delete integracoes-logos" ON storage.objects FOR DELETE USING (bucket_id = 'integracoes-logos' AND public.is_current_user_admin());
