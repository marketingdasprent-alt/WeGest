-- Associar um motorista de plataforma passa a ser uma operação só, no servidor.
--
-- O botão "Associar" escrevia em quatro sítios a partir do browser: a ficha,
-- uber_drivers, uber_transactions e bolt_resumos_semanais. Nenhum deles é a
-- fonte de verdade. Quem manda é motorista_plataforma_identidades: é ela que
-- resolver_motorista_por_plataforma() lê, e as triggers `resolver_motorista`
-- de bolt/uber consultam-na em CADA escrita e sobrepõem o motorista_id com o
-- que ela disser:
--
--     IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' OR recalculo_e_forcado()
--       THEN NEW.motorista_id := v_resolvido;   -- descarta o valor recebido
--       ELSE NEW.motorista_id := OLD.motorista_id;
--
-- Como ninguém escrevia a identidade, na Bolt o UPDATE era revertido pela
-- própria trigger: o ecrã dizia "Associado" e a base de dados ficava na mesma.
-- Acontecia mesmo a administradores. 33 dos 39 motoristas com resumos Bolt
-- órfãos não têm identidade registada. A Uber safava-se porque
-- uber_transactions não tem essa trigger.
--
-- Por cima disso havia um problema de permissões: escrever na ficha exige
-- `motoristas_gestao`, escrever nas tabelas de plataforma exige
-- `financeiro_recibos`. Um Gestor TVDE gravava a ficha e falhava o resto sem
-- erro nenhum (a RLS não dá erro: acerta em zero linhas). Associar é trabalho
-- operacional de quem gere motoristas, não de quem vê financeiro — daí esta
-- função correr como SECURITY DEFINER e validar `motoristas_gestao`.

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
  'Liga uma conta Uber/Bolt a uma ficha de motorista numa só transacção: escreve a identidade (fonte de verdade que as triggers consultam), actualiza a ficha e adopta o histórico já importado. Exige motoristas_gestao — associar é trabalho operacional, não financeiro. Devolve as contagens do que ligou.';

REVOKE ALL ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.associar_motorista_plataforma(uuid, text, text) TO service_role;
