-- A conta da própria frota na Uber deixa de se fazer passar por motorista.
--
-- O QUE APARECIA
-- No ecrã "Motoristas de plataforma sem ficha" apareciam três linhas que não
-- são pessoas nenhumas — são as empresas:
--
--     Década Ousada, Lda.   -22 948,00 EUR
--     URBANGO Lda           -35 721,83 EUR
--     PREMIUM RIDE, LDA     -35 780,31 EUR
--
-- PORQUÊ
-- O relatório da Uber traz, além das viagens dos motoristas, a linha do
-- pagamento semanal da própria Uber à frota. Nessa linha o "motorista" é a
-- empresa e a única coluna preenchida é
-- "Pago a si:Saldo da viagem:Pagamentos:Transferido para uma conta bancária",
-- com o valor negativo (dinheiro que sai da Uber para o banco da empresa).
-- Todas as colunas de ganhos vêm vazias.
--
-- Como o import cria um uber_drivers por cada UUID que apareça no ficheiro, a
-- empresa passou a existir como condutor — e, sem ficha, caía na lista dos
-- não-associados com o valor ao lado.
--
-- O PERIGO
-- Hoje estas linhas têm motorista_id e viatura_id a NULL, portanto não sujam a
-- conta-corrente de ninguém. Mas o ecrã oferece "Associar" e "Criar ficha" ao
-- lado delas: bastava um clique para -71 837,87 EUR (o acumulado da Década
-- Ousada) aterrarem na ficha de um motorista. É por isso que isto se fecha na
-- base de dados e não só no ecrã.
--
-- COMO SE RECONHECE
-- Uma conta cujo histórico TEM linha de transferência bancária e NUNCA tem
-- tarifa. Verificado contra as 3 479 transacções importadas: a regra apanha
-- exactamente as três empresas e nenhum motorista (todos os 335 condutores
-- reais têm tarifa; nenhum tem linha de transferência).
--
-- Não se apaga nada: as transferências continuam lá para quem precise de
-- reconciliar o que a Uber pagou à empresa. Só deixam de ser um "motorista".

ALTER TABLE public.uber_drivers
  ADD COLUMN IF NOT EXISTS is_conta_frota boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.uber_drivers.is_conta_frota IS
  'Esta linha é a conta da própria empresa na Uber (recebe as transferências '
  'semanais), não um condutor. Nunca listar como motorista nem ligar a uma ficha.';

-- Reavalia a marca para uma conta: tem transferência bancária e nunca tarifa.
CREATE OR REPLACE FUNCTION public.uber_reavaliar_conta_frota(p_uber_driver_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transferencia boolean := false;
  v_tarifa        boolean := false;
BEGIN
  SELECT
    bool_or(
      nullif(trim(t.raw_transaction->'csv_row'->>
        'Pago a si:Saldo da viagem:Pagamentos:Transferido para uma conta bancária'), '') IS NOT NULL
    ),
    bool_or(
      coalesce(
        nullif(trim(t.raw_transaction->'csv_row'->>'Pago a si:Os seus rendimentos:Tarifa:Tarifa'), ''),
        nullif(trim(t.raw_transaction->'csv_row'->>'Pago a si : Os seus rendimentos : Tarifa'), '')
      ) IS NOT NULL
    )
  INTO v_transferencia, v_tarifa
  FROM public.uber_transactions t
  WHERE t.uber_driver_id = p_uber_driver_id
    AND t.raw_transaction ? 'csv_row';

  UPDATE public.uber_drivers
     SET is_conta_frota = coalesce(v_transferencia, false) AND NOT coalesce(v_tarifa, false)
   WHERE uber_driver_id = p_uber_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public.uber_reavaliar_conta_frota(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uber_reavaliar_conta_frota(text) TO service_role;

-- Backfill do que já está importado.
DO $$
DECLARE
  v_id text;
BEGIN
  FOR v_id IN
    SELECT DISTINCT uber_driver_id
      FROM public.uber_transactions
     WHERE uber_driver_id IS NOT NULL
       AND raw_transaction ? 'csv_row'
       AND nullif(trim(raw_transaction->'csv_row'->>
         'Pago a si:Saldo da viagem:Pagamentos:Transferido para uma conta bancária'), '') IS NOT NULL
  LOOP
    PERFORM public.uber_reavaliar_conta_frota(v_id);
  END LOOP;
END $$;

-- Mantém-se sozinho nos próximos imports. O WHEN faz o gatilho só disparar nas
-- linhas de transferência (umas dezenas por ano), nunca nas viagens — um CSV
-- semanal traz milhares de linhas e nenhuma delas passa por aqui.
CREATE OR REPLACE FUNCTION public.uber_marcar_conta_frota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.uber_reavaliar_conta_frota(NEW.uber_driver_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.uber_marcar_conta_frota() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uber_marcar_conta_frota() TO service_role;

DROP TRIGGER IF EXISTS trg_uber_marcar_conta_frota ON public.uber_transactions;

CREATE TRIGGER trg_uber_marcar_conta_frota
AFTER INSERT OR UPDATE OF raw_transaction ON public.uber_transactions
FOR EACH ROW
WHEN (
  NEW.uber_driver_id IS NOT NULL
  AND NEW.raw_transaction ? 'csv_row'
  AND nullif(trim(NEW.raw_transaction->'csv_row'->>
    'Pago a si:Saldo da viagem:Pagamentos:Transferido para uma conta bancária'), '') IS NOT NULL
)
EXECUTE FUNCTION public.uber_marcar_conta_frota();

-- E recusa-se a ligar a conta da empresa a uma ficha de motorista. O ecrã já
-- não a mostra, mas esta função é chamável por quem quiser — e o estrago (o
-- acumulado das transferências na conta-corrente de uma pessoa) não é do tipo
-- que se descubra depressa.
CREATE OR REPLACE FUNCTION public.associar_motorista_plataforma(
  p_motorista_id uuid,
  p_uber_id text DEFAULT NULL,
  p_bolt_id text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org      uuid := public.get_current_org_id();
  v_uber_drv int := 0;
  v_uber_tx  int := 0;
  v_bolt_drv int := 0;
  v_bolt_res int := 0;
BEGIN
  IF p_uber_id IS NULL AND p_bolt_id IS NULL THEN
    RAISE EXCEPTION 'Nada para associar: nenhum identificador de plataforma.';
  END IF;

  IF NOT (public.is_current_user_admin()
          OR public.has_permission(auth.uid(), 'motoristas_gestao')) THEN
    RAISE EXCEPTION 'Sem permissão para associar motoristas de plataforma.'
      USING ERRCODE = '42501';
  END IF;

  -- SECURITY DEFINER não passa pela RLS: a organização valida-se aqui, à mão.
  IF NOT EXISTS (
    SELECT 1 FROM public.motoristas_ativos
     WHERE id = p_motorista_id AND org_id = v_org
  ) THEN
    RAISE EXCEPTION 'Motorista não encontrado nesta organização.';
  END IF;

  -- A conta da própria frota não é um motorista: é quem recebe as
  -- transferências semanais da Uber. Ligá-la a uma ficha punha dezenas de
  -- milhares de euros negativos na conta-corrente de uma pessoa.
  IF p_uber_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.uber_drivers
     WHERE uber_driver_id = p_uber_id AND org_id = v_org AND is_conta_frota
  ) THEN
    RAISE EXCEPTION
      'Esta conta Uber é a da própria empresa (recebe as transferências semanais), não um motorista. Não pode ser ligada a uma ficha.';
  END IF;

  -- 1) A identidade primeiro — sem ela, tudo o que se segue é revertido pelas
  --    triggers. O UNIQUE (org_id, plataforma, identificador) garante que uma
  --    conta de plataforma pertence a um motorista só; reassociar move-a.
  IF p_uber_id IS NOT NULL THEN
    INSERT INTO public.motorista_plataforma_identidades
      (org_id, motorista_id, plataforma, identificador, origem)
    VALUES (v_org, p_motorista_id, 'uber', p_uber_id, 'manual')
    ON CONFLICT (org_id, plataforma, identificador)
      DO UPDATE SET motorista_id = EXCLUDED.motorista_id;
  END IF;

  IF p_bolt_id IS NOT NULL THEN
    INSERT INTO public.motorista_plataforma_identidades
      (org_id, motorista_id, plataforma, identificador, origem)
    VALUES (v_org, p_motorista_id, 'bolt', p_bolt_id, 'manual')
    ON CONFLICT (org_id, plataforma, identificador)
      DO UPDATE SET motorista_id = EXCLUDED.motorista_id;
  END IF;

  -- 2) A ficha é cache de leitura (as listagens lêem-na direta); a verdade
  --    está na identidade acima.
  UPDATE public.motoristas_ativos
     SET uber_uuid = COALESCE(p_uber_id, uber_uuid),
         bolt_id   = COALESCE(p_bolt_id, bolt_id)
   WHERE id = p_motorista_id;

  -- 3) Histórico já importado. Agora que a identidade existe, as triggers
  --    resolvem para este motorista em vez de reporem NULL.
  IF p_uber_id IS NOT NULL THEN
    UPDATE public.uber_drivers SET motorista_id = p_motorista_id
     WHERE uber_driver_id = p_uber_id AND org_id = v_org;
    GET DIAGNOSTICS v_uber_drv = ROW_COUNT;

    UPDATE public.uber_transactions SET motorista_id = p_motorista_id
     WHERE uber_driver_id = p_uber_id AND org_id = v_org AND motorista_id IS NULL;
    GET DIAGNOSTICS v_uber_tx = ROW_COUNT;
  END IF;

  IF p_bolt_id IS NOT NULL THEN
    -- bolt_drivers estava a 0 de 889 ligados: ninguém escrevia aqui.
    UPDATE public.bolt_drivers SET motorista_id = p_motorista_id
     WHERE driver_uuid = p_bolt_id AND org_id = v_org;
    GET DIAGNOSTICS v_bolt_drv = ROW_COUNT;

    UPDATE public.bolt_resumos_semanais SET motorista_id = p_motorista_id
     WHERE identificador_motorista = p_bolt_id AND org_id = v_org
       AND motorista_id IS NULL;
    GET DIAGNOSTICS v_bolt_res = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'uber_condutores', v_uber_drv,
    'uber_viagens',    v_uber_tx,
    'bolt_condutores', v_bolt_drv,
    'bolt_resumos',    v_bolt_res
  );
END;
$$;

COMMENT ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) IS
  'Liga uma conta Uber/Bolt a uma ficha de motorista numa só transacção: escreve a identidade (fonte de verdade que as triggers consultam), actualiza a ficha e adopta o histórico já importado. Recusa a conta da própria frota. Exige motoristas_gestao — associar é trabalho operacional, não financeiro. Devolve as contagens do que ligou.';

REVOKE ALL ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
