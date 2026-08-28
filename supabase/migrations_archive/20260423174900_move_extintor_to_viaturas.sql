-- Mover campos de extintor de motorista_viaturas para viaturas
ALTER TABLE public.viaturas 
ADD COLUMN IF NOT EXISTS extintor_numero TEXT,
ADD COLUMN IF NOT EXISTS extintor_validade DATE;

-- Migrar dados existentes (pegando a associação ativa ou a mais recente)
UPDATE public.viaturas v
SET 
  extintor_numero = mv.extintor_numero,
  extintor_validade = mv.extintor_validade
FROM (
  SELECT DISTINCT ON (viatura_id) viatura_id, extintor_numero, extintor_validade
  FROM public.motorista_viaturas
  ORDER BY viatura_id, created_at DESC
) mv
WHERE v.id = mv.viatura_id;

-- Comentário para documentação
COMMENT ON COLUMN public.viaturas.extintor_numero IS 'Número de série/identificação do extintor associado à viatura';
COMMENT ON COLUMN public.viaturas.extintor_validade IS 'Data de validade da carga/inspeção do extintor';

-- Nota: Não removemos as colunas de motorista_viaturas imediatamente para evitar quebra de código 
-- enquanto o frontend não é atualizado, mas elas tornam-se obsoletas.
