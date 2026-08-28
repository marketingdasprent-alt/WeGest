-- Adicionar coluna user_id à tabela motoristas_ativos
ALTER TABLE motoristas_ativos 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_motoristas_ativos_user_id ON motoristas_ativos(user_id);

-- Adicionar política RLS para motoristas verem os seus próprios dados
CREATE POLICY "Motoristas podem ver seus próprios dados"
ON motoristas_ativos
FOR SELECT
USING (auth.uid() = user_id);

-- Atualizar a função de aprovação para incluir user_id
CREATE OR REPLACE FUNCTION public.aprovar_candidatura_motorista(p_candidatura_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_candidatura RECORD;
    v_motorista_id UUID;
BEGIN
    -- Buscar dados da candidatura
    SELECT * INTO v_candidatura
    FROM motorista_candidaturas
    WHERE id = p_candidatura_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidatura não encontrada';
    END IF;

    IF v_candidatura.status != 'submetido' THEN
        RAISE EXCEPTION 'Candidatura não está em estado de análise';
    END IF;

    -- Criar motorista ativo COM user_id
    INSERT INTO motoristas_ativos (
        nome,
        email,
        telefone,
        nif,
        morada,
        cidade,
        documento_tipo,
        documento_numero,
        documento_validade,
        carta_conducao,
        carta_categorias,
        carta_validade,
        licenca_tvde_numero,
        licenca_tvde_validade,
        data_contratacao,
        status_ativo,
        user_id
    ) VALUES (
        v_candidatura.nome,
        v_candidatura.email,
        v_candidatura.telefone,
        v_candidatura.nif,
        v_candidatura.morada,
        v_candidatura.cidade,
        v_candidatura.documento_tipo,
        v_candidatura.documento_numero,
        v_candidatura.documento_validade,
        v_candidatura.carta_conducao,
        v_candidatura.carta_categorias,
        v_candidatura.carta_validade,
        v_candidatura.licenca_tvde_numero,
        v_candidatura.licenca_tvde_validade,
        CURRENT_DATE,
        true,
        v_candidatura.user_id
    )
    RETURNING id INTO v_motorista_id;

    -- Atualizar candidatura para aprovado
    UPDATE motorista_candidaturas
    SET 
        status = 'aprovado',
        data_decisao = NOW(),
        decidido_por = auth.uid()
    WHERE id = p_candidatura_id;

    RETURN v_motorista_id;
END;
$$;