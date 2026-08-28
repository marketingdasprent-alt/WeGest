-- Garantir que TODOS os formulários tenham o campo obrigatório de licença TVDE

-- Primeiro, atualizar qualquer formulário que não tenha o campo padronizado
UPDATE formularios 
SET campos = campos || '[{"id": "field_tem_formacao_tvde", "type": "radio", "label": "Tem Licença TVDE?", "required": true, "options": ["Sim", "Não"]}]'::jsonb,
    updated_at = now()
WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(campos) AS campo 
    WHERE campo->>'id' = 'field_tem_formacao_tvde'
) AND ativo = true;

-- Garantir que todos os campos de licença TVDE sejam obrigatórios e padronizados
UPDATE formularios 
SET campos = (
    SELECT jsonb_agg(
        CASE 
            WHEN campo->>'id' LIKE '%tvde%' OR campo->>'id' LIKE '%licenca%' OR campo->>'label' ILIKE '%licença%tvde%' OR campo->>'id' = 'field_tem_formacao_tvde'
            THEN jsonb_build_object(
                'id', 'field_tem_formacao_tvde',
                'type', 'radio',
                'label', 'Tem Licença TVDE?',
                'required', true,
                'options', '["Sim", "Não"]'::jsonb
            )
            ELSE campo
        END
    )
    FROM jsonb_array_elements(campos) AS campo
),
updated_at = now()
WHERE ativo = true;

-- Criar trigger para garantir que novos formulários sempre tenham o campo obrigatório
CREATE OR REPLACE FUNCTION ensure_tvde_field()
RETURNS TRIGGER AS $$
BEGIN
    -- Se é um novo formulário ou está sendo ativado, garantir que tem o campo TVDE
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.ativo = true)) THEN
        -- Verificar se já tem o campo
        IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.campos) AS campo 
            WHERE campo->>'id' = 'field_tem_formacao_tvde'
        ) THEN
            -- Adicionar o campo obrigatório
            NEW.campos = NEW.campos || '[{"id": "field_tem_formacao_tvde", "type": "radio", "label": "Tem Licença TVDE?", "required": true, "options": ["Sim", "Não"]}]'::jsonb;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar o trigger
DROP TRIGGER IF EXISTS ensure_tvde_field_trigger ON formularios;
CREATE TRIGGER ensure_tvde_field_trigger
    BEFORE INSERT OR UPDATE ON formularios
    FOR EACH ROW
    EXECUTE FUNCTION ensure_tvde_field();