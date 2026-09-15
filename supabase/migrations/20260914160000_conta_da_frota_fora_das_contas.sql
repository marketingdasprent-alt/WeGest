-- A conta da frota já tinha ficha: tirá-la das Contas e das Dívidas, e fechar
-- a porta por onde entrou.
--
-- O QUE APARECIA
-- Nas Dívidas, um "motorista" chamado Premium Ride a dever dezenas de
-- milhares de euros. Não é um motorista: é a conta da própria PREMIUM RIDE na
-- Uber — a linha do relatório que recebe as transferências semanais para o
-- banco da empresa (ver 20260911140000_conta_da_frota_nao_e_motorista.sql).
--
-- COMO LÁ CHEGOU
-- A migração de 11/09 marcou essas contas (`uber_drivers.is_conta_frota`) e
-- tirou-as do ecrã de não-associados, mas não tocou no que JÁ tinha
-- acontecido: antes disso o ecrã oferecia "Criar ficha" ao lado delas, e a
-- ficha nasceu com o nome da empresa e `uber_uuid` = conta da frota. A partir
-- daí:
--   1. o resumo semanal Uber soma-lhe a transferência como ganho negativo
--      (gross_amount vem da coluna "Pago a si", que nessa linha é a
--      transferência);
--   2. a lista de Contas casa esse resumo com a ficha pelo uber_uuid e, com o
--      período fechado, grava-lhe o líquido em motorista_liquido_semanal;
--   3. o gatilho dessa tabela abre um movimento a débito na conta corrente da
--      ficha, e as Dívidas mostram-no.
-- A lista de Contas escondia a linha pelo nome de empresa (isCompanyName), mas
-- a gravação corria sobre a lista ANTES desse filtro: gravava o que escondia.
-- A app deixa agora a conta da frota de fora antes de qualquer agregação
-- (useContasResumoSemana); esta migração trata do rasto e da porta.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--   a) Desliga a conta da frota de qualquer ficha: identidade de plataforma,
--      uber_uuid nas fichas (motoristas_ativos e a legada motoristas),
--      motorista_id em uber_drivers / uber_transactions / uber_resumos_semanais.
--   b) Se a ficha ligada É a própria empresa (o nome é o da conta Uber ou tem
--      forma de empresa — Lda, S.A., Unipessoal), apaga-lhe os líquidos
--      semanais gravados; o movimento correspondente cai em cascata
--      (motorista_financeiro.liquido_semanal_id ON DELETE CASCADE). Um
--      líquido cujo movimento já foi marcado como pago NÃO se apaga — alguém
--      registou uma cobrança e isso é para rever à mão; fica em WARNING.
--      A ficha em si fica: apagá-la é decisão de quem gere, e não custa nada
--      ficar lá inactiva.
--   c) Se a ficha ligada é uma PESSOA (alguém carregou "Associar" em vez de
--      "Criar ficha"), só se desliga. Os líquidos dela dessas semanas estão
--      errados (levam a transferência da empresa), mas misturados com o
--      trabalho real dela — não se apagam; fica em WARNING com as semanas
--      para se reabrir em Contas, que as regrava certas.
--   c') Ficha com o NOME da empresa na mesma org, mesmo sem uber_uuid. Foi o
--      caso real: a ficha "PREMIUM RIDE" (org PREMIUM RIDE, criada 29/06) não
--      tinha id de plataforma nenhum, e a lista de Contas casou-lhe o resumo
--      "PREMIUM RIDE, LDA" pelo match inteligente de nomes — 2 líquidos
--      gravados a 14/09 (-6 804,90 e -6 948,93). Apagam-se pela mesma regra
--      de b): só os de movimento pendente.
--   d) Dois gatilhos para isto não voltar por outra porta: uma ficha não pode
--      apontar o uber_uuid a uma conta da frota, e não se pode criar uma
--      identidade Uber para ela. `associar_motorista_plataforma` já recusava;
--      o formulário da ficha não, e era por aí que entrava.

-- ---------------------------------------------------------------------------
-- a) + b) + c) Limpeza do que já está ligado
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  frota   record;
  ficha   record;
  v_regex constant text :=
    '\m(lda\.?|ldª|s\.?a\.?|sarl|unipessoal|unip\.?|sociedade|cooperativa|associa[cç][aã]o)\M|,\s*lda';
  v_e_empresa      boolean;
  v_apagados       int;
  v_pagos          int;
  v_semanas        text;
  v_n              int;
BEGIN
  FOR frota IN
    SELECT uber_driver_id, full_name, org_id
      FROM public.uber_drivers
     WHERE is_conta_frota
       AND uber_driver_id IS NOT NULL
  LOOP
    -- Identidade de plataforma: é o que os gatilhos de import consultam para
    -- voltar a pôr motorista_id nas transacções. Sem ela, os próximos imports
    -- ficam a NULL, que é o correcto.
    DELETE FROM public.motorista_plataforma_identidades
     WHERE plataforma = 'uber' AND identificador = frota.uber_driver_id;

    FOR ficha IN
      SELECT id, nome, org_id
        FROM public.motoristas_ativos
       WHERE uber_uuid = frota.uber_driver_id
    LOOP
      v_e_empresa :=
        lower(regexp_replace(ficha.nome, '[^[:alnum:]]', '', 'g'))
          = lower(regexp_replace(coalesce(frota.full_name, ''), '[^[:alnum:]]', '', 'g'))
        OR ficha.nome ~* v_regex;

      IF v_e_empresa THEN
        -- Líquidos cujo movimento já não está pendente ficam: alguém marcou
        -- uma cobrança e isso tem de ser revisto à mão, não apagado daqui.
        SELECT count(*) INTO v_pagos
          FROM public.motorista_liquido_semanal l
          JOIN public.motorista_financeiro mf ON mf.liquido_semanal_id = l.id
         WHERE l.motorista_id = ficha.id
           AND mf.status <> 'pendente';

        DELETE FROM public.motorista_liquido_semanal l
         WHERE l.motorista_id = ficha.id
           AND NOT EXISTS (
             SELECT 1 FROM public.motorista_financeiro mf
              WHERE mf.liquido_semanal_id = l.id AND mf.status <> 'pendente'
           );
        GET DIAGNOSTICS v_apagados = ROW_COUNT;

        RAISE NOTICE 'Conta da frota "%" (%, org %): ficha-empresa "%" (%, org %) desligada; % líquido(s) semanal(is) apagado(s).',
          frota.full_name, frota.uber_driver_id, frota.org_id, ficha.nome, ficha.id, ficha.org_id, v_apagados;
        IF v_pagos > 0 THEN
          RAISE WARNING 'Ficha-empresa "%" (%): % líquido(s) com movimento já pago/anulado NÃO foram apagados — rever em Dívidas › Pagas.',
            ficha.nome, ficha.id, v_pagos;
        END IF;
      ELSE
        SELECT string_agg(to_char(semana_inicio, 'DD/MM') || '–' || to_char(semana_fim, 'DD/MM'), ', '
                          ORDER BY semana_inicio),
               count(*)
          INTO v_semanas, v_n
          FROM public.motorista_liquido_semanal
         WHERE motorista_id = ficha.id;

        RAISE WARNING 'Conta da frota "%" (%, org %) estava ligada à PESSOA "%" (%, org %). Desligada. % semana(s) com líquido gravado a rever em Contas (reabrir regrava): %',
          frota.full_name, frota.uber_driver_id, frota.org_id, ficha.nome, ficha.id, ficha.org_id, coalesce(v_n, 0), coalesce(v_semanas, '—');
      END IF;
    END LOOP;

    -- c') A ficha que É a empresa mas nunca teve uber_uuid: o nome da conta
    -- Uber começa pelo nome da ficha ("PREMIUM RIDE, LDA" ⊃ "PREMIUM RIDE"),
    -- na mesma organização. Sem esta passagem a ficha real ficava de fora.
    FOR ficha IN
      SELECT m.id, m.nome, m.org_id
        FROM public.motoristas_ativos m
       WHERE m.org_id = frota.org_id
         AND (m.uber_uuid IS NULL OR m.uber_uuid <> frota.uber_driver_id)
         AND length(regexp_replace(m.nome, '[^[:alnum:]]', '', 'g')) >= 5
         AND lower(regexp_replace(coalesce(frota.full_name, ''), '[^[:alnum:]]', '', 'g'))
             LIKE lower(regexp_replace(m.nome, '[^[:alnum:]]', '', 'g')) || '%'
    LOOP
      SELECT count(*) INTO v_pagos
        FROM public.motorista_liquido_semanal l
        JOIN public.motorista_financeiro mf ON mf.liquido_semanal_id = l.id
       WHERE l.motorista_id = ficha.id
         AND mf.status <> 'pendente';

      DELETE FROM public.motorista_liquido_semanal l
       WHERE l.motorista_id = ficha.id
         AND NOT EXISTS (
           SELECT 1 FROM public.motorista_financeiro mf
            WHERE mf.liquido_semanal_id = l.id AND mf.status <> 'pendente'
         );
      GET DIAGNOSTICS v_apagados = ROW_COUNT;

      RAISE NOTICE 'Conta da frota "%" (%, org %): ficha com o nome da empresa "%" (%, sem uber_uuid); % líquido(s) semanal(is) apagado(s).',
        frota.full_name, frota.uber_driver_id, frota.org_id, ficha.nome, ficha.id, v_apagados;
      IF v_pagos > 0 THEN
        RAISE WARNING 'Ficha-empresa "%" (%): % líquido(s) com movimento já pago/anulado NÃO foram apagados — rever em Dívidas › Pagas.',
          ficha.nome, ficha.id, v_pagos;
      END IF;
    END LOOP;

    UPDATE public.motoristas_ativos SET uber_uuid = NULL
     WHERE uber_uuid = frota.uber_driver_id;
    UPDATE public.motoristas SET uber_uuid = NULL
     WHERE uber_uuid = frota.uber_driver_id;

    -- A ordem importa: o recálculo do resumo (trigger por statement em
    -- uber_transactions) tira o motorista_id das próprias transacções, por
    -- isso estas ficam a NULL primeiro. O UPDATE explícito em
    -- uber_resumos_semanais é cinto e suspensórios.
    UPDATE public.uber_transactions SET motorista_id = NULL
     WHERE uber_driver_id = frota.uber_driver_id AND motorista_id IS NOT NULL;
    UPDATE public.uber_resumos_semanais SET motorista_id = NULL
     WHERE uber_driver_id = frota.uber_driver_id AND motorista_id IS NOT NULL;
    UPDATE public.uber_drivers SET motorista_id = NULL
     WHERE uber_driver_id = frota.uber_driver_id AND motorista_id IS NOT NULL;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- d) Guardas
-- ---------------------------------------------------------------------------

-- A ficha não pode apontar à conta da frota. O formulário de motorista grava
-- uber_uuid directo na tabela (o pré-preenchimento de "Criar ficha" vinha daí),
-- e é o único caminho que `associar_motorista_plataforma` não cobria.
CREATE OR REPLACE FUNCTION public.ficha_nao_pode_ser_conta_frota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.uber_uuid IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.uber_uuid IS DISTINCT FROM OLD.uber_uuid)
     AND EXISTS (
       SELECT 1 FROM public.uber_drivers d
        WHERE d.uber_driver_id = NEW.uber_uuid AND d.is_conta_frota
     )
  THEN
    RAISE EXCEPTION
      'Esta conta Uber é a da própria empresa (recebe as transferências semanais), não um motorista. Não pode ficar numa ficha.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ficha_nao_pode_ser_conta_frota() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ficha_nao_pode_ser_conta_frota ON public.motoristas_ativos;
CREATE TRIGGER trg_ficha_nao_pode_ser_conta_frota
BEFORE INSERT OR UPDATE OF uber_uuid ON public.motoristas_ativos
FOR EACH ROW
EXECUTE FUNCTION public.ficha_nao_pode_ser_conta_frota();

-- Nem a identidade de plataforma: é ela que os imports consultam para atribuir
-- motorista_id às transacções seguintes.
CREATE OR REPLACE FUNCTION public.identidade_nao_pode_ser_conta_frota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.plataforma = 'uber'
     AND EXISTS (
       SELECT 1 FROM public.uber_drivers d
        WHERE d.uber_driver_id = NEW.identificador AND d.is_conta_frota
     )
  THEN
    RAISE EXCEPTION
      'Esta conta Uber é a da própria empresa (recebe as transferências semanais), não um motorista. Não pode ser ligada a uma ficha.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.identidade_nao_pode_ser_conta_frota() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_identidade_nao_pode_ser_conta_frota ON public.motorista_plataforma_identidades;
CREATE TRIGGER trg_identidade_nao_pode_ser_conta_frota
BEFORE INSERT OR UPDATE OF identificador, plataforma ON public.motorista_plataforma_identidades
FOR EACH ROW
EXECUTE FUNCTION public.identidade_nao_pode_ser_conta_frota();

NOTIFY pgrst, 'reload schema';
