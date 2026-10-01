-- Pedido manual de sincronização Via Verde, feito pelo servidor.
--
-- O botão "Executar robot" do ecrã de integrações inseria na fila a partir do
-- browser e chamava o via-verde-sync-drain com a sessão do utilizador. O INSERT
-- já era recusado (a fila não tem política de INSERT para authenticated) e o
-- drain passou a exigir chamada interna (auditoria 2026-09-25). Os dois passos
-- passam para aqui: valida quem pede, põe na fila e arranca o drain já, em vez
-- de esperar pelo cron de 5 minutos.

CREATE FUNCTION public.via_verde_sync_pedir(
  p_integracao_id uuid,
  p_periodo_inicio date DEFAULT NULL,
  p_periodo_fim date DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
DECLARE
  v_org        uuid := public.get_current_org_id();
  v_plataforma text;
  v_inseridos  integer;
BEGIN
  -- Mesmo critério da leitura da fila (mt_via_verde_sync_queue_select).
  IF v_org IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Sem permissão para executar integrações.' USING ERRCODE = '42501';
  END IF;

  SELECT p.plataforma INTO v_plataforma
  FROM public.plataformas_configuracao p
  WHERE p.id = p_integracao_id AND p.org_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integração não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_plataforma IS DISTINCT FROM 'via_verde' THEN
    RAISE EXCEPTION 'A integração não é Via Verde.' USING ERRCODE = '22023';
  END IF;

  -- idx_via_verde_sync_queue_one_active: uma execução activa por integração.
  INSERT INTO public.via_verde_sync_queue (integracao_id, org_id, status, periodo_inicio, periodo_fim)
  VALUES (p_integracao_id, v_org, 'pending', p_periodo_inicio, p_periodo_fim)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;

  -- Cliques repetidos não multiplicam arranques: no máximo um a cada 30 s.
  IF NOT EXISTS (
    SELECT 1 FROM public.cron_http_log
    WHERE jobname = 'via-verde-sync-manual' AND invoked_at > now() - interval '30 seconds'
  ) THEN
    PERFORM public.cron_invocar_edge('via-verde-sync-manual', 'via-verde-sync-drain', '{}'::jsonb, 60000);
  END IF;

  RETURN CASE WHEN v_inseridos > 0 THEN 'adicionado' ELSE 'ja_na_fila' END;
END;
$$;

ALTER FUNCTION public.via_verde_sync_pedir(uuid, date, date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.via_verde_sync_pedir(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.via_verde_sync_pedir(uuid, date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
