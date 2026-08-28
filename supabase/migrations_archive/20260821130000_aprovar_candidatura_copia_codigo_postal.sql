-- ============================================================
-- Aprovar candidatura passa a copiar o código postal
-- ============================================================
-- O motorista escreve o código postal no formulário de candidatura (secção
-- Dados Pessoais, formato 0000-000) e ele fica bem guardado em
-- motorista_candidaturas. Mas esta função, que cria o motorista a partir da
-- candidatura, copiava 23 das 24 colunas partilhadas — e a que faltava era
-- exactamente `codigo_postal`.
--
-- Resultado: o dado nunca se perdeu (continua na candidatura), mas nunca
-- chegou ao perfil do motorista, e a equipa era obrigada a ir lá pô-lo à mão
-- em cada aprovação. Em Junho perderam-se 6 de 17; em Julho 7 de 16. Agosto
-- parece limpo só porque os 4 casos foram preenchidos manualmente.
--
-- Verificado antes de escrever isto: das 24 colunas comuns às duas tabelas,
-- `codigo_postal` era a única ausente da função. Nenhum outro campo escapa.
--
-- O corpo abaixo é o que está instalado, com duas linhas acrescentadas —
-- `codigo_postal` na lista de colunas e `v_candidatura.codigo_postal` nos
-- valores, ambas a seguir a `cidade`, onde pertencem.
-- ============================================================

CREATE OR REPLACE FUNCTION public.aprovar_candidatura_motorista(p_candidatura_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        codigo_postal,
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
        v_candidatura.codigo_postal,
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
$function$;
