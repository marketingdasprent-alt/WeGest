-- Função para mapeamento automático quando o motorista é criado ou alterado
CREATE OR REPLACE FUNCTION public.match_motorista_to_platforms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    found_uber_id TEXT;
    found_bolt_id TEXT;
BEGIN
    -- 1. Tentar encontrar UUID da Uber (se ainda não tiver)
    IF NEW.uber_uuid IS NULL THEN
        SELECT uber_driver_id INTO found_uber_id
        FROM public.uber_drivers
        WHERE motorista_id IS NULL
          AND (
            unaccent(lower(full_name)) ILIKE '%' || unaccent(lower(NEW.nome)) || '%'
            OR unaccent(lower(NEW.nome)) ILIKE '%' || unaccent(lower(full_name)) || '%'
          )
        LIMIT 1;

        IF found_uber_id IS NOT NULL THEN
            NEW.uber_uuid := found_uber_id;
            -- Atualiza também a tabela uber_drivers para manter a consistência
            UPDATE public.uber_drivers SET motorista_id = NEW.id WHERE uber_driver_id = found_uber_id;
        END IF;
    END IF;

    -- 2. Tentar encontrar ID da Bolt (se ainda não tiver)
    IF NEW.bolt_id IS NULL THEN
        SELECT driver_uuid INTO found_bolt_id
        FROM public.bolt_drivers
        WHERE motorista_id IS NULL
          AND (
            unaccent(lower(name)) ILIKE '%' || unaccent(lower(NEW.nome)) || '%'
            OR unaccent(lower(NEW.nome)) ILIKE '%' || unaccent(lower(name)) || '%'
          )
        LIMIT 1;

        IF found_bolt_id IS NOT NULL THEN
            NEW.bolt_id := found_bolt_id;
            -- Atualiza também a tabela bolt_drivers para manter a consistência
            UPDATE public.bolt_drivers SET motorista_id = NEW.id WHERE driver_uuid = found_bolt_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Trigger que dispara na criação ou alteração de nome/telefone
DROP TRIGGER IF EXISTS trigger_match_motorista_on_save ON public.motoristas;
CREATE TRIGGER trigger_match_motorista_on_save
BEFORE INSERT OR UPDATE OF nome, telefone
ON public.motoristas
FOR EACH ROW
EXECUTE FUNCTION public.match_motorista_to_platforms();
