-- Associar uma conta Uber/Bolt a uma ficha recusa quando o telefone ou o email
-- da conta são de OUTRO motorista e não desta ficha.
--
-- O nome que a plataforma mostra não identifica a pessoa. A 2026-09-10 a conta
-- Bolt "Paulo Jorge" (telefone e email do Paulo Jorge de Almeida Caldeira, 480
-- viagens no carro dele) foi ligada à mão ao Paulo Jorge Amado da Silva: o ecrã
-- sugeria o primeiro com "Paulo" e "Jorge" no nome. Durante um mês a Bolt de um
-- foi parar às contas do outro.
--
-- Telefone partilhado (a ficha escolhida também o tem) e contas sem contacto
-- passam como antes. Fichas inactivas não contam.

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
  r          record;
  v_tel      text;
  v_mail     text;
  v_outro    text;
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

  -- O contacto da conta diz de quem ela é; o nome não (ver cabeçalho).
  FOR r IN
    SELECT 'Bolt' AS plataforma, d.phone AS telefone, d.email
      FROM public.bolt_drivers d
     WHERE p_bolt_id IS NOT NULL AND d.org_id = v_org AND d.driver_uuid = p_bolt_id
    UNION ALL
    SELECT 'Uber', u.phone, u.email
      FROM public.uber_drivers u
     WHERE p_uber_id IS NOT NULL AND u.org_id = v_org AND u.uber_driver_id = p_uber_id
  LOOP
    -- Últimos 9 dígitos: o mesmo número com e sem +351.
    v_tel  := right(regexp_replace(coalesce(r.telefone, ''), '\D', '', 'g'), 9);
    v_tel  := CASE WHEN length(v_tel) = 9 THEN v_tel END;
    v_mail := nullif(lower(trim(coalesce(r.email, ''))), '');
    CONTINUE WHEN v_tel IS NULL AND v_mail IS NULL;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.motoristas_ativos m
       WHERE m.id = p_motorista_id
         AND ((v_tel IS NOT NULL
               AND right(regexp_replace(coalesce(m.telefone, ''), '\D', '', 'g'), 9) = v_tel)
           OR (v_mail IS NOT NULL AND lower(trim(m.email)) = v_mail)));

    SELECT m.nome INTO v_outro
      FROM public.motoristas_ativos m
     WHERE m.org_id = v_org
       AND m.id <> p_motorista_id
       AND m.status_ativo IS DISTINCT FROM false
       AND ((v_tel IS NOT NULL
             AND right(regexp_replace(coalesce(m.telefone, ''), '\D', '', 'g'), 9) = v_tel)
         OR (v_mail IS NOT NULL AND lower(trim(m.email)) = v_mail))
     ORDER BY m.nome
     LIMIT 1;

    IF v_outro IS NOT NULL THEN
      RAISE EXCEPTION
        'Esta conta % tem o telefone ou o email de %, não desta ficha. Confirme o motorista antes de associar.',
        r.plataforma, v_outro;
    END IF;
  END LOOP;

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
  'Liga uma conta Uber/Bolt a uma ficha de motorista numa só transacção: escreve a identidade (fonte de verdade que as triggers consultam), actualiza a ficha e adopta o histórico já importado. Recusa a conta da própria frota e a conta cujo telefone ou email é de outro motorista activo e não desta ficha. Exige motoristas_gestao. Devolve as contagens do que ligou.';

REVOKE EXECUTE ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
