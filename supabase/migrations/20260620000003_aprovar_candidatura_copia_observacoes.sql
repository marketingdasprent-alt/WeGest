-- ============================================================
-- Aprovar candidatura: copiar a observação do candidato para a ficha
-- ============================================================
-- A caixa de "Observações" que o candidato preenche no cadastro
-- (motorista_candidaturas.observacoes) passa a ser copiada para o campo
-- "Observações Internas" da ficha do motorista (motoristas_ativos.observacoes)
-- no momento da aprovação. Assim a nota do candidato fica disponível na ficha.
--
-- Recria aprovar_candidatura_motorista (versão 20260605000003 + observacoes).
-- Idempotente. Aplicar DEPOIS de 20260620000002 (coluna na candidatura).
-- ============================================================

-- Defensivo: garantir as colunas observacoes nos dois lados (idempotente).
ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.motorista_candidaturas
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

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
    SELECT * INTO v_candidatura
    FROM motorista_candidaturas
    WHERE id = p_candidatura_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidatura não encontrada';
    END IF;

    IF v_candidatura.status != 'submetido' THEN
        RAISE EXCEPTION 'Candidatura não está em estado de análise';
    END IF;

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
        -- Documentos (frente + verso) e comprovativos
        documento_ficheiro_url,
        documento_identificacao_verso_url,
        carta_ficheiro_url,
        carta_conducao_verso_url,
        licenca_tvde_ficheiro_url,
        registo_criminal_url,
        comprovativo_morada_url,
        comprovativo_iban_url,
        -- Observação que o candidato deixou no cadastro
        observacoes,
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
        v_candidatura.documento_ficheiro_url,
        v_candidatura.documento_identificacao_verso_url,
        v_candidatura.carta_ficheiro_url,
        v_candidatura.carta_conducao_verso_url,
        v_candidatura.licenca_tvde_ficheiro_url,
        v_candidatura.registo_criminal_url,
        v_candidatura.comprovativo_morada_url,
        v_candidatura.comprovativo_iban_url,
        v_candidatura.observacoes,
        CURRENT_DATE,
        true,
        v_candidatura.user_id
    )
    RETURNING id INTO v_motorista_id;

    UPDATE motorista_candidaturas
    SET
        status = 'aprovado',
        data_decisao = NOW(),
        decidido_por = auth.uid()
    WHERE id = p_candidatura_id;

    RETURN v_motorista_id;
END;
$$;
