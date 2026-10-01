-- Aprovar uma candidatura passa a PROCURAR a ficha pelo NIF antes de criar
-- outra.
--
-- Até aqui `aprovar_candidatura_motorista` era um INSERT puro: nenhum SELECT
-- prévio, por NIF ou por seja o que for. Cada aprovação criava ficha nova,
-- mesmo quando o motorista já existia no sistema. Em produção há 39 NIFs
-- repetidos em motoristas_ativos — por exemplo duas fichas de "Lucas Medeiros
-- Santos", mesmo email e mesmo NIF, criadas com três dias de diferença, e
-- nenhuma com conta ligada. De 50 candidaturas, 45 já foram aprovadas assim.
--
-- Porquê o NIF e não o email: o email repete-se entre pessoas diferentes. Há
-- um endereço partilhado por SEIS fichas, com seis NIFs distintos — se fosse
-- ele a mandar, a conta de uma pessoa aterrava na ficha de outra. O NIF é o
-- único identificador fiável que a candidatura recolhe.
--
-- O convite (edge function motorista-onboarding) continua a ligar por email
-- quando a ficha já existe e ainda não tem conta; esse caminho nem sequer
-- chega à candidatura. Isto trata do outro caminho: quem se candidatou de
-- raiz — porque escreveu outro email, ou porque a ficha não tinha email.
--
-- Nada é apagado. Os campos da ficha existente só são preenchidos onde a
-- candidatura traz valor (COALESCE do lado da candidatura): documentos novos
-- entram, dados antigos que a candidatura não traz ficam como estavam.

-- DROP antes do CREATE: a função devolvia `uuid` e passa a devolver `jsonb`
-- (para dizer se associou ou criou), e o Postgres não deixa trocar o tipo de
-- retorno com CREATE OR REPLACE. O único chamador é o ecrã de Candidaturas,
-- que já ignorava o valor devolvido — nada deixa de funcionar entre o DROP e
-- o CREATE, que correm na mesma transação.
DROP FUNCTION IF EXISTS public.aprovar_candidatura_motorista(uuid);

CREATE OR REPLACE FUNCTION public.aprovar_candidatura_motorista(p_candidatura_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_candidatura RECORD;
    v_existente   RECORD;
    v_motorista_id UUID;
    v_nif         TEXT;
    v_accao       TEXT;
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

    -- Só dígitos: em produção há NIFs escritos com espaços e pontos, e
    -- "123 456 789" tem de encontrar "123456789".
    v_nif := NULLIF(regexp_replace(COALESCE(v_candidatura.nif, ''), '\D', '', 'g'), '');

    -- ── Já existe ficha com este NIF nesta organização? ──────────────────
    -- Ordem de preferência: primeiro as que ainda não têm conta (é onde a
    -- conta nova deve entrar), depois as activas, e por fim a mais antiga —
    -- que é a original quando já há duplicados por limpar.
    IF v_nif IS NOT NULL THEN
        SELECT * INTO v_existente
        FROM motoristas_ativos m
        WHERE m.org_id = v_candidatura.org_id
          AND regexp_replace(COALESCE(m.nif, ''), '\D', '', 'g') = v_nif
        ORDER BY (m.user_id IS NOT NULL), (m.status_ativo IS NOT TRUE), m.created_at
        LIMIT 1;
    END IF;

    IF v_existente.id IS NOT NULL THEN
        -- Ficha já tomada por OUTRA conta: não se rouba nem se sobrepõe. O
        -- gestor tem de resolver à mão — ou são duas pessoas com o mesmo NIF
        -- (erro de dados), ou o motorista já tem conta e devia entrar nela.
        IF v_existente.user_id IS NOT NULL
           AND v_existente.user_id IS DISTINCT FROM v_candidatura.user_id THEN
            RAISE EXCEPTION
              'Já existe um motorista com o NIF % (%) e com conta associada. Verifique antes de aprovar.',
              v_existente.nif, v_existente.nome;
        END IF;

        UPDATE motoristas_ativos SET
            nome        = COALESCE(v_candidatura.nome, nome),
            email       = COALESCE(v_candidatura.email, email),
            telefone    = COALESCE(v_candidatura.telefone, telefone),
            morada      = COALESCE(v_candidatura.morada, morada),
            cidade      = COALESCE(v_candidatura.cidade, cidade),
            codigo_postal = COALESCE(v_candidatura.codigo_postal, codigo_postal),
            documento_tipo     = COALESCE(v_candidatura.documento_tipo, documento_tipo),
            documento_numero   = COALESCE(v_candidatura.documento_numero, documento_numero),
            documento_validade = COALESCE(v_candidatura.documento_validade, documento_validade),
            carta_conducao   = COALESCE(v_candidatura.carta_conducao, carta_conducao),
            carta_categorias = COALESCE(v_candidatura.carta_categorias, carta_categorias),
            carta_validade   = COALESCE(v_candidatura.carta_validade, carta_validade),
            licenca_tvde_numero   = COALESCE(v_candidatura.licenca_tvde_numero, licenca_tvde_numero),
            licenca_tvde_validade = COALESCE(v_candidatura.licenca_tvde_validade, licenca_tvde_validade),
            documento_ficheiro_url = COALESCE(v_candidatura.documento_ficheiro_url, documento_ficheiro_url),
            documento_identificacao_verso_url =
              COALESCE(v_candidatura.documento_identificacao_verso_url, documento_identificacao_verso_url),
            carta_ficheiro_url       = COALESCE(v_candidatura.carta_ficheiro_url, carta_ficheiro_url),
            carta_conducao_verso_url = COALESCE(v_candidatura.carta_conducao_verso_url, carta_conducao_verso_url),
            licenca_tvde_ficheiro_url = COALESCE(v_candidatura.licenca_tvde_ficheiro_url, licenca_tvde_ficheiro_url),
            registo_criminal_url      = COALESCE(v_candidatura.registo_criminal_url, registo_criminal_url),
            comprovativo_morada_url   = COALESCE(v_candidatura.comprovativo_morada_url, comprovativo_morada_url),
            iban                  = COALESCE(v_candidatura.iban, iban),
            comprovativo_iban_url = COALESCE(v_candidatura.comprovativo_iban_url, comprovativo_iban_url),
            observacoes = COALESCE(v_candidatura.observacoes, observacoes),
            -- Aprovar é readmitir: uma ficha desactivada volta a activa e
            -- perde a data de saída, senão o motorista entra no painel e os
            -- ecrãs de contas continuam a escondê-lo.
            status_ativo = true,
            desativado_em = NULL,
            -- A contratação original não se reescreve; só se preenche quando
            -- a ficha nunca teve uma.
            data_contratacao = COALESCE(data_contratacao, CURRENT_DATE),
            user_id = COALESCE(v_candidatura.user_id, user_id),
            updated_at = NOW()
        WHERE id = v_existente.id;

        v_motorista_id := v_existente.id;
        v_accao := 'associado';
    ELSE
        INSERT INTO motoristas_ativos (
            nome, email, telefone, nif, morada, cidade,
            codigo_postal,
            documento_tipo, documento_numero, documento_validade,
            carta_conducao, carta_categorias, carta_validade,
            licenca_tvde_numero, licenca_tvde_validade,
            documento_ficheiro_url, documento_identificacao_verso_url,
            carta_ficheiro_url, carta_conducao_verso_url,
            licenca_tvde_ficheiro_url, registo_criminal_url,
            comprovativo_morada_url, iban, comprovativo_iban_url,
            observacoes, data_contratacao, status_ativo, user_id
        ) VALUES (
            v_candidatura.nome, v_candidatura.email, v_candidatura.telefone,
            v_candidatura.nif, v_candidatura.morada, v_candidatura.cidade,
            v_candidatura.codigo_postal,
            v_candidatura.documento_tipo, v_candidatura.documento_numero,
            v_candidatura.documento_validade,
            v_candidatura.carta_conducao, v_candidatura.carta_categorias,
            v_candidatura.carta_validade,
            v_candidatura.licenca_tvde_numero, v_candidatura.licenca_tvde_validade,
            v_candidatura.documento_ficheiro_url,
            v_candidatura.documento_identificacao_verso_url,
            v_candidatura.carta_ficheiro_url, v_candidatura.carta_conducao_verso_url,
            v_candidatura.licenca_tvde_ficheiro_url, v_candidatura.registo_criminal_url,
            v_candidatura.comprovativo_morada_url, v_candidatura.iban,
            v_candidatura.comprovativo_iban_url,
            v_candidatura.observacoes, CURRENT_DATE, true, v_candidatura.user_id
        )
        RETURNING id INTO v_motorista_id;

        v_accao := 'criado';
    END IF;

    UPDATE motorista_candidaturas
    SET status = 'aprovado', data_decisao = NOW(), decidido_por = auth.uid()
    WHERE id = p_candidatura_id;

    RETURN jsonb_build_object('motorista_id', v_motorista_id, 'accao', v_accao);
END;
$function$;

COMMENT ON FUNCTION public.aprovar_candidatura_motorista(uuid) IS
  'Aprova uma candidatura. Procura ficha existente pelo NIF (normalizado, na mesma org) e associa-lhe a conta em vez de criar ficha nova; so cria quando nao existe. Devolve {motorista_id, accao: associado|criado}. Recusa quando a ficha encontrada ja tem outra conta.';
