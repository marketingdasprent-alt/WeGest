-- Corrigir datas com ano inválido (5 dígitos, como 22025 -> 2025)
-- Subtrai 20000 anos para normalizar

-- 1. Corrigir motoristas_ativos.data_contratacao
UPDATE motoristas_ativos
SET data_contratacao = (data_contratacao - INTERVAL '20000 years')::date
WHERE data_contratacao IS NOT NULL 
  AND EXTRACT(YEAR FROM data_contratacao) >= 20000 
  AND EXTRACT(YEAR FROM data_contratacao) < 30000;

-- 2. Corrigir contratos.data_assinatura
UPDATE contratos
SET data_assinatura = (data_assinatura::date - INTERVAL '20000 years')::date
WHERE data_assinatura IS NOT NULL 
  AND EXTRACT(YEAR FROM data_assinatura::date) >= 20000 
  AND EXTRACT(YEAR FROM data_assinatura::date) < 30000;

-- 3. Corrigir contratos.data_inicio
UPDATE contratos
SET data_inicio = (data_inicio::date - INTERVAL '20000 years')::date
WHERE data_inicio IS NOT NULL 
  AND EXTRACT(YEAR FROM data_inicio::date) >= 20000 
  AND EXTRACT(YEAR FROM data_inicio::date) < 30000;

-- 4. Criar função de validação de datas simples
CREATE OR REPLACE FUNCTION public.validate_date_year()
RETURNS TRIGGER AS $$
BEGIN
  -- Validar data_contratacao em motoristas_ativos
  IF TG_TABLE_NAME = 'motoristas_ativos' THEN
    IF NEW.data_contratacao IS NOT NULL THEN
      IF EXTRACT(YEAR FROM NEW.data_contratacao) < 1900 OR EXTRACT(YEAR FROM NEW.data_contratacao) > 2100 THEN
        RAISE EXCEPTION 'Data de contratação inválida: ano % fora do intervalo permitido (1900-2100)', 
          EXTRACT(YEAR FROM NEW.data_contratacao);
      END IF;
    END IF;
  END IF;
  
  -- Validar datas em contratos
  IF TG_TABLE_NAME = 'contratos' THEN
    IF NEW.data_assinatura IS NOT NULL THEN
      IF EXTRACT(YEAR FROM NEW.data_assinatura::date) < 1900 OR EXTRACT(YEAR FROM NEW.data_assinatura::date) > 2100 THEN
        RAISE EXCEPTION 'Data de assinatura inválida: ano % fora do intervalo permitido (1900-2100)', 
          EXTRACT(YEAR FROM NEW.data_assinatura::date);
      END IF;
    END IF;
    
    IF NEW.data_inicio IS NOT NULL THEN
      IF EXTRACT(YEAR FROM NEW.data_inicio::date) < 1900 OR EXTRACT(YEAR FROM NEW.data_inicio::date) > 2100 THEN
        RAISE EXCEPTION 'Data de início inválida: ano % fora do intervalo permitido (1900-2100)', 
          EXTRACT(YEAR FROM NEW.data_inicio::date);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 5. Criar triggers para validação em motoristas_ativos
DROP TRIGGER IF EXISTS validate_motoristas_dates ON motoristas_ativos;
CREATE TRIGGER validate_motoristas_dates
  BEFORE INSERT OR UPDATE ON motoristas_ativos
  FOR EACH ROW
  EXECUTE FUNCTION validate_date_year();

-- 6. Criar triggers para validação em contratos
DROP TRIGGER IF EXISTS validate_contratos_dates ON contratos;
CREATE TRIGGER validate_contratos_dates
  BEFORE INSERT OR UPDATE ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION validate_date_year();