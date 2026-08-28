-- ============================================================
-- motoristas_ativos.bolt_id segue o que a Bolt diz estar ACTIVE
-- ============================================================
-- A versão anterior (20260813140000) punha na ficha o uuid da semana mais
-- recente com ganhos. Era a melhor aproximação disponível na altura, mas era
-- só isso: uma aproximação a partir dos nossos próprios dados.
--
-- Desde 2026-08-13 temos a fonte a sério: o getDrivers da Bolt, guardado em
-- bolt_drivers, devolve `state` por uuid (active / suspended / deactivated).
--
-- O QUE A LISTA DA BOLT PROVOU
-- Nos 13 motoristas que tinham mais do que um uuid na mesma frota, TODOS têm
-- exactamente UM active e o resto deactivated/suspended. Nunca dois activos.
-- Confirma-se assim que a Bolt não permite duas identidades vivas para a
-- mesma pessoa na mesma frota — os uuids a mais são re-registos (sai, o uuid
-- morre; volta, recebe outro).
--
-- Isto também desmentiu uma correcção feita à mão nesse dia: o uuid
-- b5c095f3 do Rakesh Kumar tinha sido desligado por o telefone diferir da
-- ficha, quando afinal está 'suspended' e o outro 'active' — é a mesma
-- pessoa, que se re-registou com outro número. Já foi revertido. É a prova
-- prática de que o telefone não serve para decidir identidade.
--
-- REGRA NOVA (por ordem):
--   1. o uuid que a Bolt diz estar 'active';
--   2. na falta dele, o da semana mais recente com ganhos.
-- O (2) cobre quem já saiu de todas as frotas e quem ainda não apareceu no
-- bolt_drivers.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bolt_actualizar_bolt_id_recente(p_integracao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_linhas integer;
BEGIN
  WITH candidatos AS (
    -- 1) O que a Bolt diz estar activo. Prioridade 1.
    SELECT mp.motorista_id,
           mp.driver_uuid AS uuid_escolhido,
           1 AS prioridade,
           NULL::date AS quando
      FROM public.bolt_mapeamento_motoristas mp
      JOIN public.bolt_drivers d ON d.driver_uuid = mp.driver_uuid
     WHERE d.status = 'active'
       AND (p_integracao_id IS NULL OR mp.integracao_id = p_integracao_id)

    UNION ALL

    -- 2) Sem informação da Bolt: a semana mais recente com ganhos.
    --    periodo_inicio NOT NULL de propósito — em Postgres um ORDER BY DESC
    --    põe os NULL à frente e as 436 linhas antigas de CSV ganhavam o
    --    desempate.
    SELECT r.motorista_id,
           r.identificador_motorista,
           2,
           r.periodo_inicio
      FROM public.bolt_resumos_semanais r
     WHERE r.motorista_id IS NOT NULL
       AND r.identificador_motorista IS NOT NULL
       AND r.periodo_inicio IS NOT NULL
       AND r.ganhos_brutos_app > 0
       AND (p_integracao_id IS NULL OR r.integracao_id = p_integracao_id)
  ),
  escolhido AS (
    SELECT DISTINCT ON (motorista_id) motorista_id, uuid_escolhido
      FROM candidatos
     ORDER BY motorista_id, prioridade, quando DESC NULLS LAST, uuid_escolhido
  )
  UPDATE public.motoristas_ativos m
     SET bolt_id = e.uuid_escolhido, updated_at = now()
    FROM escolhido e
   WHERE m.id = e.motorista_id
     AND m.bolt_id IS DISTINCT FROM e.uuid_escolhido
     -- O índice único (org_id, bolt_id) recusaria se o uuid já estivesse
     -- noutra ficha da mesma org. Salta em vez de rebentar a corrida toda.
     AND NOT EXISTS (
       SELECT 1 FROM public.motoristas_ativos outro
        WHERE outro.org_id = m.org_id
          AND outro.bolt_id = e.uuid_escolhido
          AND outro.id <> m.id
     );

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.bolt_actualizar_bolt_id_recente(uuid) IS
  'Põe em motoristas_ativos.bolt_id o uuid que a Bolt diz estar active; na falta '
  'dele, o da semana mais recente com ganhos. Chamada pelo bolt-sync-semana. '
  'Ver migração 20260813170000.';

SELECT public.bolt_actualizar_bolt_id_recente(NULL);
