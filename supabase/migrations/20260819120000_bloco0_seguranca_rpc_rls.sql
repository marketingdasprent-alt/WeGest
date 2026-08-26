-- ============================================================
-- BLOCO 0 — Segurança: funções SECURITY DEFINER abertas e RLS de motorista_viaturas
-- ============================================================
-- O QUE ESTAVA MAL
--
-- Nove funções `SECURITY DEFINER`, propriedade de `postgres` (que é o dono das
-- tabelas, logo ignoram o RLS por completo), com `EXECUTE` concedido a
-- `authenticated`, e cujo corpo não menciona `org_id` nem `auth.uid()`. Nenhuma
-- delas verifica quem chama.
--
-- Prova (auditoria de 2026-08-19, com a sessão de um motorista real da PREMIUM
-- RIDE): `get_cartao_historico_consumo` devolveu 103 linhas de consumo de um
-- cartão da Década Ousada, e as funções de portagens devolveram 154 passagens
-- da mesma organização. O SELECT directo às mesmas tabelas devolve 0 — o RLS
-- funciona; é contornado por a função ser do dono das tabelas.
--
-- Duas famílias, dois tratamentos:
--
--   1. As que NINGUÉM chama (nem frontend nem edge function) — confirmado por
--      pesquisa em src/ e supabase/functions/: só aparecem no types.ts gerado.
--      Perdem o EXECUTE de `authenticated`. Continuam disponíveis para a
--      service role, que é quem legitimamente as usa.
--
--   2. As que a interface chama mesmo — ganham filtro de organização e porta
--      de permissão, alinhados com o RLS das tabelas que leem.
--
-- A porta de permissão é a mesma que a tabela subjacente já exige:
--   · repsol/edp/bp_transacoes e via_verde_transacoes -> can_view_financeiro()
--     (= admin OU permissão 'financeiro_recibos')
--   · cartoes_frota -> admin OU 'administrativo_cartoes'
-- Aceitam-se as duas nas funções de cartão porque o ecrã Cartões Frota mostra
-- consumo a quem gere cartões. Apertar mais do que isto exige saber que
-- permissão cada ecrã exige, e fica para quando os ecrãs forem revistos.
--
-- Idempotente: correr duas vezes não faz nada da segunda vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) As que ninguém chama: fora do alcance de `authenticated`
-- ------------------------------------------------------------
-- manage_cron_job            — criar/apagar tarefas agendadas na BD, com URL e
--                              chave. É a mais grave das nove.
-- merge_motoristas           — funde dois motoristas quaisquer. Destrutivo e
--                              irreversível.
-- aplicar_renting_movimentacao — sem argumentos, altera dados de renting.
--
-- `PUBLIC` também é revogado: sem isto, o GRANT implícito a PUBLIC que o
-- Postgres dá a qualquer função nova mantém a porta aberta.

REVOKE ALL ON FUNCTION public.manage_cron_job(text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.merge_motoristas(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.aplicar_renting_movimentacao()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.manage_cron_job(text, text, text, text, text, text) IS
  'Só service role. O EXECUTE de authenticated foi revogado em 2026-08-19 '
  '(migração 20260819120000): permitia a qualquer utilizador autenticado criar '
  'tarefas agendadas na base de dados.';

COMMENT ON FUNCTION public.merge_motoristas(uuid, uuid) IS
  'Só service role. O EXECUTE de authenticated foi revogado em 2026-08-19 '
  '(migração 20260819120000): permitia fundir motoristas de qualquer organização.';

-- ------------------------------------------------------------
-- 2) Histórico de consumo do cartão — organização + permissão
-- ------------------------------------------------------------
-- Chamada por src/components/administrativo/CartoesFlotaTab.tsx.
-- Acrescenta-se `t.org_id = get_current_org_id()` a cada ramo do UNION e a
-- porta de permissão. Mais nada muda: mesmas colunas, mesma ordem, mesmo LIMIT.

CREATE OR REPLACE FUNCTION public.get_cartao_historico_consumo(p_tipo text, p_numero text)
 RETURNS TABLE(transaction_date timestamp with time zone, amount numeric, station_name text, fuel_type text, quantity numeric, motorista_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.transaction_date, t.amount, t.station_name, t.fuel_type, t.quantity,
         m.nome
  FROM public.bp_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'bp' AND (t.raw_data->>'Nº cartão') = p_numero
    AND t.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  UNION ALL
  SELECT t.transaction_date, t.amount, t.station_name, t.fuel_type, t.quantity,
         m.nome
  FROM public.repsol_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'repsol' AND t.card_number = p_numero
    AND t.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  UNION ALL
  SELECT t.transaction_date, t.amount, t.station_name, NULL::text, t.quantity,
         m.nome
  FROM public.edp_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'edp' AND t.card_number = p_numero
    AND t.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  ORDER BY transaction_date DESC
  LIMIT 200
$function$;

COMMENT ON FUNCTION public.get_cartao_historico_consumo(text, text) IS
  'Consumo de um cartão de combustível, limitado à organização activa do '
  'chamador e a quem pode ver financeiro ou gerir cartões. Antes de '
  '20260819120000 devolvia dados de todas as organizações a qualquer '
  'utilizador autenticado.';

-- ------------------------------------------------------------
-- 3) Portagens por equipamento de bordo — organização + permissão
-- ------------------------------------------------------------
-- Chamada por src/components/administrativo/DispositivosObeTab.tsx.

CREATE OR REPLACE FUNCTION public.get_obe_historico_portagens(p_nr_equipamento text)
 RETURNS TABLE(transaction_date timestamp with time zone, amount numeric, barreira_entrada text, barreira_saida text, operador text, matricula text, motorista_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.transaction_date,
    t.amount,
    t.barreira_entrada,
    t.barreira_saida,
    t.operador,
    t.matricula,
    m.nome
  FROM public.via_verde_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE t.nr_equipamento = p_nr_equipamento
    AND t.org_id = public.get_current_org_id()
    AND public.can_view_financeiro()
  ORDER BY t.transaction_date DESC
  LIMIT 200
$function$;

COMMENT ON FUNCTION public.get_obe_historico_portagens(text) IS
  'Passagens Via Verde de um equipamento, limitadas à organização activa do '
  'chamador e a quem pode ver financeiro. Ver migração 20260819120000.';

-- ------------------------------------------------------------
-- 4) Portagens por viatura — organização + permissão
-- ------------------------------------------------------------
-- Chamada por src/components/viaturas/tabs/obe/ViaturaObeHistoricoSection.tsx.

CREATE OR REPLACE FUNCTION public.get_viatura_historico_portagens(p_viatura_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS TABLE(transaction_id text, transaction_date timestamp with time zone, amount numeric, barreira_entrada text, barreira_saida text, operador text, tipo_evento text, motorista_id uuid, motorista_nome text, contrato_id uuid, contrato_codigo bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.transaction_id,
    t.transaction_date,
    t.amount,
    t.barreira_entrada,
    t.barreira_saida,
    t.operador,
    t.tipo_evento,
    t.motorista_id,
    m.nome AS motorista_nome,
    c.id AS contrato_id,
    c.codigo AS contrato_codigo
  FROM public.via_verde_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  LEFT JOIN public.contratos_renting c
    ON c.viatura_id = t.viatura_id
    AND c.deleted_at IS NULL
    AND c.periodo @> t.transaction_date
  WHERE t.viatura_id = p_viatura_id
    AND t.org_id = public.get_current_org_id()
    AND public.can_view_financeiro()
    AND (p_data_inicio IS NULL OR t.transaction_date >= p_data_inicio::timestamptz)
    AND (p_data_fim IS NULL OR t.transaction_date < (p_data_fim + 1)::timestamptz)
  ORDER BY t.transaction_date DESC
  LIMIT 1000
$function$;

COMMENT ON FUNCTION public.get_viatura_historico_portagens(uuid, date, date) IS
  'Passagens Via Verde de uma viatura, limitadas à organização activa do '
  'chamador e a quem pode ver financeiro. Ver migração 20260819120000.';

-- ------------------------------------------------------------
-- 5) Cartões por associar — organização + permissão (as duas sobrecargas)
-- ------------------------------------------------------------
-- Chamadas por CartoesNaoReconhecidos.tsx e useMotoristasNaoAssociadosCounts.ts.
-- Existem duas assinaturas; ambas ficam fechadas, senão fecha-se a porta e
-- deixa-se a janela aberta.

CREATE OR REPLACE FUNCTION public.get_cartoes_combustivel_nao_associados()
 RETURNS TABLE(plataforma text, card_number text, nome text, total numeric, transacoes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'bp'::text, bp.raw_data->>'Nº cartão', NULL::text,
         ROUND(SUM(bp.amount)::numeric, 2), COUNT(*)
  FROM public.bp_transacoes bp
  WHERE bp.motorista_id IS NULL AND COALESCE(bp.raw_data->>'Nº cartão','') <> ''
    AND bp.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  GROUP BY bp.raw_data->>'Nº cartão'
  UNION ALL
  SELECT 'repsol'::text, rt.card_number, NULL::text,
         ROUND(SUM(rt.amount)::numeric, 2), COUNT(*)
  FROM public.repsol_transacoes rt
  WHERE rt.motorista_id IS NULL AND COALESCE(rt.card_number,'') <> ''
    AND rt.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  GROUP BY rt.card_number
  UNION ALL
  SELECT 'edp'::text, et.card_number, MAX(et.raw_data->>'Nome cartão'),
         ROUND(SUM(et.amount)::numeric, 2), COUNT(*)
  FROM public.edp_transacoes et
  WHERE et.motorista_id IS NULL AND COALESCE(et.card_number,'') <> ''
    AND et.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  GROUP BY et.card_number
$function$;

CREATE OR REPLACE FUNCTION public.get_cartoes_combustivel_nao_associados(p_desde date DEFAULT NULL::date)
 RETURNS TABLE(plataforma text, card_number text, nome text, total numeric, transacoes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'bp'::text, bp.raw_data->>'Nº cartão', NULL::text,
         ROUND(SUM(bp.amount)::numeric, 2), COUNT(*)
  FROM public.bp_transacoes bp
  WHERE bp.motorista_id IS NULL
    AND COALESCE(bp.raw_data->>'Nº cartão','') <> ''
    AND (p_desde IS NULL OR bp.transaction_date >= p_desde)
    AND bp.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  GROUP BY bp.raw_data->>'Nº cartão'
  UNION ALL
  SELECT 'repsol'::text, rt.card_number, NULL::text,
         ROUND(SUM(rt.amount)::numeric, 2), COUNT(*)
  FROM public.repsol_transacoes rt
  WHERE rt.motorista_id IS NULL
    AND COALESCE(rt.card_number,'') <> ''
    AND (p_desde IS NULL OR rt.transaction_date >= p_desde)
    AND rt.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  GROUP BY rt.card_number
  UNION ALL
  SELECT 'edp'::text, et.card_number, MAX(et.raw_data->>'Nome cartão'),
         ROUND(SUM(et.amount)::numeric, 2), COUNT(*)
  FROM public.edp_transacoes et
  WHERE et.motorista_id IS NULL
    AND COALESCE(et.card_number,'') <> ''
    AND (p_desde IS NULL OR et.transaction_date >= p_desde)
    AND et.org_id = public.get_current_org_id()
    AND (public.can_view_financeiro() OR public.has_permission(auth.uid(), 'administrativo_cartoes'))
  GROUP BY et.card_number
$function$;

-- ------------------------------------------------------------
-- 6) Associar cartão a motorista — organização + permissão
-- ------------------------------------------------------------
-- Chamada por src/components/motoristas/CartoesNaoReconhecidos.tsx.
--
-- Além da porta de permissão, acrescenta-se `org_id = get_current_org_id()` aos
-- UPDATE: sem isso, associar um cartão apanhava transacções com o mesmo número
-- noutras organizações, e o motorista de destino podia nem ser da organização
-- de quem clicou.
--
-- NOTA (fase 4 do plano): esta função continua a atribuir a HISTÓRIA INTEIRA do
-- cartão a quem o tem hoje, porque não há janela de vigência. Os parâmetros
-- p_desde/p_ate entram com a tabela cartao_atribuicoes. Aqui trata-se apenas de
-- quem pode chamá-la e sobre que organização.

CREATE OR REPLACE FUNCTION public.associar_cartao_combustivel(p_plataforma text, p_card text, p_motorista uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  afetadas integer := 0;
  v_org uuid := public.get_current_org_id();
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem organização activa.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.can_view_financeiro()
          OR public.has_permission(auth.uid(), 'administrativo_cartoes')) THEN
    RAISE EXCEPTION 'Sem permissão para associar cartões de combustível.'
      USING ERRCODE = '42501';
  END IF;

  -- O motorista de destino tem de ser da organização de quem chama.
  IF NOT EXISTS (
    SELECT 1 FROM public.motoristas_ativos
     WHERE id = p_motorista AND org_id = v_org
  ) THEN
    RAISE EXCEPTION 'Motorista não pertence à organização activa.'
      USING ERRCODE = '42501';
  END IF;

  IF p_plataforma = 'bp' THEN
    UPDATE motoristas_ativos
    SET cartao_bp = CASE WHEN COALESCE(cartao_bp,'')='' THEN p_card ELSE cartao_bp || ' / ' || p_card END
    WHERE id = p_motorista;
    UPDATE bp_transacoes SET motorista_id = p_motorista
    WHERE motorista_id IS NULL AND raw_data->>'Nº cartão' = p_card
      AND org_id = v_org;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
  ELSIF p_plataforma = 'repsol' THEN
    UPDATE motoristas_ativos
    SET cartao_repsol = CASE WHEN COALESCE(cartao_repsol,'')='' THEN p_card ELSE cartao_repsol || ' / ' || p_card END
    WHERE id = p_motorista;
    UPDATE repsol_transacoes SET motorista_id = p_motorista
    WHERE motorista_id IS NULL AND card_number = p_card
      AND org_id = v_org;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
  ELSIF p_plataforma = 'edp' THEN
    UPDATE motoristas_ativos
    SET cartao_edp = CASE WHEN COALESCE(cartao_edp,'')='' THEN p_card ELSE cartao_edp || ' / ' || p_card END
    WHERE id = p_motorista;
    UPDATE edp_transacoes SET motorista_id = p_motorista
    WHERE motorista_id IS NULL AND card_number = p_card
      AND org_id = v_org;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
  END IF;

  RETURN afetadas;
END;
$function$;

-- ------------------------------------------------------------
-- 7) motorista_viaturas: acabar com o SELECT `USING (true)`
-- ------------------------------------------------------------
-- A política PERMISSIVE "Permissão para ver motorista_viaturas" tinha
-- `USING (true)` para `authenticated`. Como as políticas PERMISSIVE se
-- combinam com OR, ela anulava a política irmã mt_motorista_viaturas_select
-- (que exige admin ou 'motoristas_gestao'): qualquer motorista com portal lia
-- as 669 atribuições da frota, com os motorista_id dos colegas.
--
-- O isolamento entre organizações NÃO estava em risco aqui — a política
-- RESTRICTIVE rls_org_isolation combina com AND e continua a valer. O problema
-- é dentro da organização.
--
-- A substituta cobre os três casos legítimos:
--   · o motorista vê as SUAS atribuições (o portal precisa — ver
--     MotoristaViaturaCard.tsx e MotoristaHistoricoViaturasCard.tsx);
--   · admin e 'motoristas_gestao', como já estava;
--   · 'assistencia_tickets', que já podia inserir e editar esta tabela (ver as
--     políticas de INSERT/UPDATE) e portanto tem de a poder ler.

DROP POLICY IF EXISTS "Permissão para ver motorista_viaturas" ON public.motorista_viaturas;

DROP POLICY IF EXISTS mv_select_proprio_ou_backoffice ON public.motorista_viaturas;
CREATE POLICY mv_select_proprio_ou_backoffice
  ON public.motorista_viaturas
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
    OR public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'assistencia_tickets')
  );

COMMENT ON POLICY mv_select_proprio_ou_backoffice ON public.motorista_viaturas IS
  'Substitui a política USING(true) removida em 2026-08-19 (migração '
  '20260819120000). O motorista vê só as suas atribuições; o backoffice vê as '
  'da organização activa (o isolamento por organização vem da política '
  'RESTRICTIVE rls_org_isolation).';

-- ------------------------------------------------------------
-- 8) gerar_contrato_atomico — permissão, e não atravessar organizações
-- ------------------------------------------------------------
-- Chamada por src/hooks/useContratos.ts. Sendo SECURITY DEFINER, ignora o RLS:
--
--   · qualquer utilizador autenticado podia gerar um contrato em nome de
--     qualquer motorista (a política de INSERT exige admin ou
--     'motoristas_contratos'/'motoristas_gestao' — a função contornava-a);
--   · o SELECT do contrato existente e o UPDATE que marca os anteriores como
--     'substituido' filtram por motorista_id + empresa_id e mais nada, portanto
--     podiam ler e SUBSTITUIR contratos de outra organização.
--
-- O corpo mantém-se igual ao que estava, com três acrescentos: o guarda no
-- topo, e `org_id = v_org` no SELECT e no UPDATE. O INSERT não precisa de
-- mudar — contratos.org_id já tem DEFAULT get_current_org_id() e é NOT NULL.

CREATE OR REPLACE FUNCTION public.gerar_contrato_atomico(p_motorista_id uuid, p_empresa_id text, p_motorista_nome text, p_motorista_nif text, p_motorista_email text, p_motorista_telefone text, p_motorista_morada text, p_motorista_documento_tipo text, p_motorista_documento_numero text, p_cidade_assinatura text, p_data_assinatura date, p_data_inicio date, p_duracao_meses integer, p_criado_por uuid, p_force_new_version boolean DEFAULT true, p_viatura_id uuid DEFAULT NULL::uuid, p_calendario_evento_id uuid DEFAULT NULL::uuid, p_checkout_pendente boolean DEFAULT false, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, motorista_id uuid, empresa_id text, motorista_nome text, status text, data_assinatura date, data_inicio date, created_at timestamp with time zone, is_existing boolean, numero_contrato integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_versao_atual INTEGER;
  v_existing_contract RECORD;
  v_org uuid := public.get_current_org_id();
BEGIN
  -- Guarda: quem chama tem de poder criar contratos nesta organização.
  -- Espelha a política de INSERT de public.contratos.
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem organização activa.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_current_user_admin()
          OR public.has_permission(auth.uid(), 'motoristas_contratos')
          OR public.has_permission(auth.uid(), 'motoristas_gestao')) THEN
    RAISE EXCEPTION 'Sem permissão para gerar contratos.' USING ERRCODE = '42501';
  END IF;

  -- Se não forçar nova versão, verificar se já existe contrato ativo
  IF NOT p_force_new_version THEN
    SELECT * INTO v_existing_contract
    FROM public.contratos c
    WHERE c.motorista_id = p_motorista_id
      AND c.empresa_id = p_empresa_id
      AND c.status = 'ativo'
      AND c.org_id = v_org
    LIMIT 1;

    -- Se existe, retornar o existente com flag is_existing = true
    IF FOUND THEN
      RETURN QUERY SELECT
        v_existing_contract.id,
        v_existing_contract.motorista_id,
        v_existing_contract.empresa_id,
        v_existing_contract.motorista_nome,
        v_existing_contract.status,
        v_existing_contract.data_assinatura,
        v_existing_contract.data_inicio,
        v_existing_contract.criado_em,
        true::boolean as is_existing,
        v_existing_contract.numero_contrato;
      RETURN;
    END IF;
  END IF;

  -- Buscar versão máxima existente para este motorista+empresa
  SELECT COALESCE(MAX(versao), 0) INTO v_versao_atual
  FROM public.contratos
  WHERE contratos.motorista_id = p_motorista_id
    AND contratos.empresa_id = p_empresa_id
    AND contratos.org_id = v_org;

  -- Marcar contratos ativos anteriores como substituídos
  UPDATE public.contratos
  SET status = 'substituido',
      atualizado_em = now()
  WHERE contratos.motorista_id = p_motorista_id
    AND contratos.empresa_id = p_empresa_id
    AND contratos.status = 'ativo'
    AND contratos.org_id = v_org;

  -- Inserir novo contrato com versão incrementada
  RETURN QUERY
  INSERT INTO public.contratos (
    motorista_id,
    empresa_id,
    motorista_nome,
    motorista_nif,
    motorista_email,
    motorista_telefone,
    motorista_morada,
    motorista_documento_tipo,
    motorista_documento_numero,
    cidade_assinatura,
    data_assinatura,
    data_inicio,
    duracao_meses,
    versao,
    status,
    criado_por,
    viatura_id,
    calendario_evento_id,
    checkout_pendente,
    template_id
  ) VALUES (
    p_motorista_id,
    p_empresa_id,
    p_motorista_nome,
    p_motorista_nif,
    p_motorista_email,
    p_motorista_telefone,
    p_motorista_morada,
    p_motorista_documento_tipo,
    p_motorista_documento_numero,
    p_cidade_assinatura,
    p_data_assinatura,
    p_data_inicio,
    p_duracao_meses,
    v_versao_atual + 1,
    'ativo',
    p_criado_por,
    p_viatura_id,
    p_calendario_evento_id,
    COALESCE(p_checkout_pendente, false),
    p_template_id
  )
  RETURNING
    contratos.id,
    contratos.motorista_id,
    contratos.empresa_id,
    contratos.motorista_nome,
    contratos.status,
    contratos.data_assinatura,
    contratos.data_inicio,
    contratos.criado_em,
    false::boolean as is_existing,
    contratos.numero_contrato;
END;
$function$;

-- ============================================================
-- VERIFICAÇÃO (correr depois de aplicar; deve devolver 0 linhas)
-- ============================================================
-- SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
--    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
--    AND pg_get_functiondef(p.oid) NOT ILIKE '%org_id%'
--    AND pg_get_functiondef(p.oid) NOT ILIKE '%auth.uid%'
--    AND p.proname IN ('manage_cron_job','merge_motoristas','aplicar_renting_movimentacao',
--                      'get_cartao_historico_consumo','get_obe_historico_portagens',
--                      'get_viatura_historico_portagens','get_cartoes_combustivel_nao_associados',
--                      'associar_cartao_combustivel');
--
-- E não deve existir política com USING(true) em motorista_viaturas:
-- SELECT polname FROM pg_policy
--  WHERE polrelid = 'public.motorista_viaturas'::regclass
--    AND polpermissive AND pg_get_expr(polqual, polrelid) = 'true';
