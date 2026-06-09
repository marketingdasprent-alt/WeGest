-- ============================================================
-- Fix: aprovar candidatura não copiava os documentos p/ o motorista
-- ============================================================
-- aprovar_candidatura_motorista copiava os dados de texto (nome, NIF,
-- documento_tipo, carta…) mas NÃO os URLs dos ficheiros. Resultado: o
-- motorista aprovado ficava com toda a informação MENOS as fotos dos
-- documentos (que continuavam só na candidatura).
--
--   1) Garante as colunas de URL no motoristas_ativos (idempotente).
--   2) Recria a função a copiar os URLs (frente + verso de ID/carta,
--      licença TVDE, registo criminal, comprovativos).
--   3) Backfill: preenche os motoristas já aprovados a partir da
--      candidatura do mesmo user (só onde está NULL).
-- ============================================================

-- 1) Colunas de documentos no motorista (espelham as da candidatura)
ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS documento_ficheiro_url TEXT,
  ADD COLUMN IF NOT EXISTS documento_identificacao_verso_url TEXT,
  ADD COLUMN IF NOT EXISTS carta_ficheiro_url TEXT,
  ADD COLUMN IF NOT EXISTS carta_conducao_verso_url TEXT,
  ADD COLUMN IF NOT EXISTS licenca_tvde_ficheiro_url TEXT,
  ADD COLUMN IF NOT EXISTS registo_criminal_url TEXT,
  ADD COLUMN IF NOT EXISTS comprovativo_morada_url TEXT,
  ADD COLUMN IF NOT EXISTS comprovativo_iban_url TEXT;

-- 1b) Defensivo: garantir que a candidatura tem as mesmas colunas (caso alguma
--     migration antiga não tenha sido aplicada no ambiente). Idempotente.
ALTER TABLE public.motorista_candidaturas
  ADD COLUMN IF NOT EXISTS documento_ficheiro_url TEXT,
  ADD COLUMN IF NOT EXISTS documento_identificacao_verso_url TEXT,
  ADD COLUMN IF NOT EXISTS carta_ficheiro_url TEXT,
  ADD COLUMN IF NOT EXISTS carta_conducao_verso_url TEXT,
  ADD COLUMN IF NOT EXISTS licenca_tvde_ficheiro_url TEXT,
  ADD COLUMN IF NOT EXISTS registo_criminal_url TEXT,
  ADD COLUMN IF NOT EXISTS comprovativo_morada_url TEXT,
  ADD COLUMN IF NOT EXISTS comprovativo_iban_url TEXT;

-- 2) Recriar a função a copiar TAMBÉM os documentos
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

-- 3) Backfill dos motoristas já aprovados (preenche só o que está NULL)
UPDATE public.motoristas_ativos m
SET
    documento_ficheiro_url = COALESCE(m.documento_ficheiro_url, c.documento_ficheiro_url),
    documento_identificacao_verso_url =
        COALESCE(m.documento_identificacao_verso_url, c.documento_identificacao_verso_url),
    carta_ficheiro_url = COALESCE(m.carta_ficheiro_url, c.carta_ficheiro_url),
    carta_conducao_verso_url = COALESCE(m.carta_conducao_verso_url, c.carta_conducao_verso_url),
    licenca_tvde_ficheiro_url = COALESCE(m.licenca_tvde_ficheiro_url, c.licenca_tvde_ficheiro_url),
    registo_criminal_url = COALESCE(m.registo_criminal_url, c.registo_criminal_url),
    comprovativo_morada_url = COALESCE(m.comprovativo_morada_url, c.comprovativo_morada_url),
    comprovativo_iban_url = COALESCE(m.comprovativo_iban_url, c.comprovativo_iban_url)
FROM public.motorista_candidaturas c
WHERE c.user_id = m.user_id
  AND c.user_id IS NOT NULL;
