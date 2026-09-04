-- ============================================================================
-- A candidatura passa a pedir o número de IBAN, não só o comprovativo
-- ============================================================================
--
-- O formulário do motorista sempre pediu o COMPROVATIVO de IBAN (um PDF/foto),
-- nunca o número em si. A ficha (motoristas_ativos.iban) só ficava preenchida
-- se alguém abrisse o comprovativo e transcrevesse à mão — na prática quase
-- nunca acontecia: 178 das 563 fichas ativas estão sem IBAN.
--
-- Aditiva e idempotente: coluna nova (sem NOT NULL, sem quebrar candidaturas
-- já existentes) e substituição da função de aprovação para também copiar
-- este campo — o mesmo padrão que os outros 20+ campos já seguem.
-- ============================================================================

alter table public.motorista_candidaturas
  add column if not exists iban text;

comment on column public.motorista_candidaturas.iban is
  'Número de IBAN indicado pelo motorista na candidatura. Validado no cliente com validarIBAN (src/lib/pt-validators.ts) antes de submeter — a coluna em si não tem CHECK, para não bloquear rascunhos a meio.';

create or replace function public.aprovar_candidatura_motorista(p_candidatura_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
        v_candidatura.comprovativo_morada_url, v_candidatura.iban, v_candidatura.comprovativo_iban_url,
        v_candidatura.observacoes, CURRENT_DATE, true, v_candidatura.user_id
    )
    RETURNING id INTO v_motorista_id;

    UPDATE motorista_candidaturas
    SET status = 'aprovado', data_decisao = NOW(), decidido_por = auth.uid()
    WHERE id = p_candidatura_id;

    RETURN v_motorista_id;
END;
$function$;
