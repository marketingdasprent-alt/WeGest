-- ============================================================
-- motoristas_ativos.bolt_id passa a ser SEMPRE o UUID mais recente
-- ============================================================
-- A Bolt emite um driver_uuid novo quando o motorista sai da frota e volta.
-- A ficha só tem uma caixa para o Bolt ID, e essa caixa ficava presa ao
-- PRIMEIRO uuid que lá tivesse sido carimbado — o guard `.is('bolt_id', null)`
-- impedia qualquer actualização posterior. Resultado: a ficha apontava para
-- uma identidade que o motorista já não usa (o João Varela #224 tinha o ID
-- de Março; o que ele usa desde Maio não estava em lado nenhum).
--
-- Regra nova: a caixa guarda o uuid da semana mais recente em que aquele
-- motorista teve ganhos. As ligações antigas continuam todas no mapa
-- (bolt_mapeamento_motoristas), que é quem faz o trabalho de reconhecer
-- viagens históricas — a caixa é só a fotografia do presente.
--
-- O QUE ISTO NÃO FAZ, E É PRECISO NÃO CONFUNDIR:
-- não diz se dois uuids são a mesma pessoa. Escolhe o mais recente de entre
-- os que ALGUÉM (ou alguma heurística) já atribuiu àquela ficha. Se a
-- atribuição estava errada, esta regra escolhe o mais recente dos errados.
-- Verificar quem é quem exige a lista de motoristas da própria Bolt
-- (getDrivers, que devolve o state active/deactivated por uuid) ou uma
-- pessoa a confirmar. Ver bolt_mapeamento_motoristas.auto_mapped.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bolt_actualizar_bolt_id_recente(p_integracao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_linhas integer;
BEGIN
  WITH recente AS (
    SELECT DISTINCT ON (r.motorista_id)
           r.motorista_id,
           r.identificador_motorista AS uuid_recente,
           r.org_id
      FROM public.bolt_resumos_semanais r
     WHERE r.motorista_id IS NOT NULL
       AND r.identificador_motorista IS NOT NULL
       -- Sem data não há "mais recente" possível: em Postgres um ORDER BY
       -- DESC põe os NULL à frente e eles ganhavam o desempate. São 436
       -- linhas antigas de CSV.
       AND r.periodo_inicio IS NOT NULL
       AND r.ganhos_brutos_app > 0
       AND (p_integracao_id IS NULL OR r.integracao_id = p_integracao_id)
     ORDER BY r.motorista_id, r.periodo_inicio DESC, r.identificador_motorista
  )
  UPDATE public.motoristas_ativos m
     SET bolt_id = rec.uuid_recente, updated_at = now()
    FROM recente rec
   WHERE m.id = rec.motorista_id
     AND m.bolt_id IS DISTINCT FROM rec.uuid_recente
     -- O índice único (org_id, bolt_id) recusaria se o uuid já estivesse
     -- noutra ficha da mesma org. Salta em vez de rebentar a corrida toda.
     AND NOT EXISTS (
       SELECT 1 FROM public.motoristas_ativos outro
        WHERE outro.org_id = m.org_id
          AND outro.bolt_id = rec.uuid_recente
          AND outro.id <> m.id
     );

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.bolt_actualizar_bolt_id_recente(uuid) IS
  'Põe em motoristas_ativos.bolt_id o uuid da semana mais recente com ganhos. '
  'Chamada pelo bolt-sync-semana no fim de cada corrida. NÃO decide identidade — '
  'só escolhe o mais recente de entre os já atribuídos. Ver migração 20260813140000.';

REVOKE EXECUTE ON FUNCTION public.bolt_actualizar_bolt_id_recente(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bolt_actualizar_bolt_id_recente(uuid) TO authenticated, service_role;

-- Backfill imediato.
SELECT public.bolt_actualizar_bolt_id_recente(NULL);
