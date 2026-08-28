-- Add Licença TVDE fields to motoristas_ativos table
ALTER TABLE public.motoristas_ativos 
ADD COLUMN licenca_tvde_numero TEXT,
ADD COLUMN licenca_tvde_validade DATE;

-- Add index for better performance on license number searches
CREATE INDEX idx_motoristas_ativos_licenca_tvde ON public.motoristas_ativos(licenca_tvde_numero);