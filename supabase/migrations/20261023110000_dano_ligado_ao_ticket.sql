-- Dano da frota ligado ao ticket da Assistência, com leitura cruzada.
--
-- O sinistro é registado em dois sítios: o dano em Frota › Viatura › Danos (permissão
-- viaturas_*) e o ticket na Assistência (assistencia_tickets). Quem tinha só uma das
-- permissões não via o que a outra pessoa escrevia. viatura_danos.ticket_id já existia;
-- passa a poder ligar-se à mão e a abrir leitura nos dois sentidos, só de leitura:
--   * quem tem assistencia_tickets vê os danos ligados a tickets (com fotos e histórico);
--   * quem tem viaturas_ver vê os tickets ligados a um dano e as mensagens deles.
-- Só por permissão de cargo: criado_por e atribuido_a ficam de fora, porque quem abre um
-- ticket (ex.: motorista) pode atribuí-lo a si próprio.
--
-- As funções devolvem o conjunto de ids uma vez por query (IN (SELECT ...) vira subplano),
-- em vez de verificar permissões linha a linha, e são SECURITY DEFINER para não haver
-- recursão entre as políticas de viatura_danos e assistencia_tickets.

-- As funções abaixo procuram danos por ticket_id.
CREATE INDEX IF NOT EXISTS idx_viatura_danos_ticket
  ON public.viatura_danos (ticket_id) WHERE ticket_id IS NOT NULL;

-- ── Conjuntos visíveis ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.danos_ligados_visiveis_pela_assistencia()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'assistencia_tickets') THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT d.id
      FROM public.viatura_danos d
     WHERE d.ticket_id IS NOT NULL
       AND d.org_id = public.get_current_org_id();
END;
$$;

COMMENT ON FUNCTION public.danos_ligados_visiveis_pela_assistencia() IS
  'Danos da org activa ligados a um ticket, se quem pergunta tem assistencia_tickets.';

CREATE OR REPLACE FUNCTION public.tickets_ligados_visiveis_pela_frota()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'viaturas_ver') THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT d.ticket_id
      FROM public.viatura_danos d
     WHERE d.ticket_id IS NOT NULL
       AND d.org_id = public.get_current_org_id();
END;
$$;

COMMENT ON FUNCTION public.tickets_ligados_visiveis_pela_frota() IS
  'Tickets ligados a um dano da org activa, se quem pergunta tem viaturas_ver.';

-- As políticas correm com os privilégios de quem pergunta: authenticated precisa de EXECUTE.
REVOKE EXECUTE ON FUNCTION public.danos_ligados_visiveis_pela_assistencia() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tickets_ligados_visiveis_pela_frota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.danos_ligados_visiveis_pela_assistencia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tickets_ligados_visiveis_pela_frota() TO authenticated;

-- ── Políticas de leitura cruzada ─────────────────────────────────────────────

DROP POLICY IF EXISTS viatura_danos_ve_pelo_ticket ON public.viatura_danos;
CREATE POLICY viatura_danos_ve_pelo_ticket ON public.viatura_danos
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.danos_ligados_visiveis_pela_assistencia()));

DROP POLICY IF EXISTS viatura_dano_fotos_ve_pelo_ticket ON public.viatura_dano_fotos;
CREATE POLICY viatura_dano_fotos_ve_pelo_ticket ON public.viatura_dano_fotos
  FOR SELECT TO authenticated
  USING (dano_id IN (SELECT public.danos_ligados_visiveis_pela_assistencia()));

DROP POLICY IF EXISTS assistencia_tickets_ve_pelo_dano ON public.assistencia_tickets;
CREATE POLICY assistencia_tickets_ve_pelo_dano ON public.assistencia_tickets
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.tickets_ligados_visiveis_pela_frota()));

DROP POLICY IF EXISTS assistencia_mensagens_ve_pelo_dano ON public.assistencia_mensagens;
CREATE POLICY assistencia_mensagens_ve_pelo_dano ON public.assistencia_mensagens
  FOR SELECT TO authenticated
  USING (ticket_id IN (SELECT public.tickets_ligados_visiveis_pela_frota()));

-- O histórico de um dano é da equipa, não do motorista: as observações antigas são notas
-- internas do processo. Substitui a política da migração 20261023100000.
DROP POLICY IF EXISTS vdh_select ON public.viatura_dano_historico;
CREATE POLICY vdh_select ON public.viatura_dano_historico
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_current_org_id()
    AND (
      (SELECT public.has_permission(auth.uid(), 'viaturas_ver'))
      OR (SELECT public.has_permission(auth.uid(), 'motoristas_gestao'))
      OR viatura_dano_historico.dano_id IN (SELECT public.danos_ligados_visiveis_pela_assistencia())
    )
  );

-- ── Tickets para ligar ───────────────────────────────────────────────────────
-- Antes de ligar, quem está na frota ainda não vê os tickets: devolve só o mínimo para
-- os escolher, e só a quem pode editar viaturas.

CREATE OR REPLACE FUNCTION public.tickets_da_viatura_para_ligar(p_viatura_id uuid)
RETURNS TABLE (id uuid, numero integer, titulo text, status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'viaturas_editar') THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT t.id, t.numero, t.titulo, t.status, t.created_at
      FROM public.assistencia_tickets t
     WHERE t.viatura_id = p_viatura_id
       AND t.org_id = public.get_current_org_id()
     ORDER BY t.created_at DESC
     LIMIT 50;
END;
$$;

COMMENT ON FUNCTION public.tickets_da_viatura_para_ligar(uuid) IS
  'Tickets da Assistência de uma viatura (número, título, estado) para ligar a um dano.';

REVOKE EXECUTE ON FUNCTION public.tickets_da_viatura_para_ligar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tickets_da_viatura_para_ligar(uuid) TO authenticated;

-- ── Coerência da ligação ─────────────────────────────────────────────────────
-- Ao ligar, o ticket tem de ser da mesma viatura e da org activa. Não se trava a troca de
-- viatura no ticket: a Assistência corrige tickets abertos na viatura errada.

CREATE OR REPLACE FUNCTION public.fn_viatura_dano_ticket_mesma_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ticket_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só valida quando a ligação muda; há ligações antigas a tickets cuja viatura mudou depois.
  IF TG_OP = 'UPDATE'
     AND NEW.ticket_id IS NOT DISTINCT FROM OLD.ticket_id
     AND NEW.viatura_id IS NOT DISTINCT FROM OLD.viatura_id THEN
    RETURN NEW;
  END IF;

  -- Com sessão, exige a org activa: o erro é o mesmo quer o ticket exista noutra org quer não.
  IF NOT EXISTS (
    SELECT 1 FROM public.assistencia_tickets t
     WHERE t.id = NEW.ticket_id
       AND t.viatura_id = NEW.viatura_id
       AND t.org_id IS NOT DISTINCT FROM NEW.org_id
       AND (auth.uid() IS NULL OR t.org_id = public.get_current_org_id())
  ) THEN
    RAISE EXCEPTION 'O ticket da Assistência tem de ser da mesma viatura do dano'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_viatura_dano_ticket_mesma_viatura() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_viatura_dano_ticket_mesma_viatura ON public.viatura_danos;
CREATE TRIGGER trg_viatura_dano_ticket_mesma_viatura
  BEFORE INSERT OR UPDATE OF ticket_id, viatura_id ON public.viatura_danos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_viatura_dano_ticket_mesma_viatura();

NOTIFY pgrst, 'reload schema';
