-- ============================================================
-- Histórico do contrato: "Contrato fechado por" também no estado 'fechado'
-- ============================================================
-- O fecho normal de um contrato (useFecharContratoRenting) e a renovação
-- (versão antiga substituída) põem o contrato em 'fechado'. Mas:
--   (1) contrato_historico_resumo só mostrava o marco "fechado" com o estado
--       em 'devolvido' ou 'cancelado' — em 'fechado' (o mais comum) ficava
--       "sem registo", mesmo com o registo gravado (ex.: #753, cancelado e
--       depois fechado);
--   (2) fn_contrato_historico_update só gravava o marco ao ir para
--       'devolvido'/'cancelado' — ao ir para 'fechado' não gravava nada, por
--       isso 879 contratos fechados não tinham quem/quando fechou.
-- Esta migração corrige as duas coisas e recupera os fechos antigos a partir
-- do que a base já guarda, sem inventar autores:
--   * fecho pelo ecrã: a confirmação da recolha no calendário (realizado_em)
--     ou o evento "Fecho do contrato" criado depois do contrato dá a hora;
--     o autor é o da alteração gravada pelo trigger nesse minuto (o mesmo
--     UPDATE), senão quem confirmou a recolha;
--   * versão substituída por renovação: substituido_em dá a hora; o autor é
--     o da alteração gravada nesse instante (NULL = automático, "Sistema").
--     Não se usa o created_by da versão nova: a renovação copia-o da antiga.
--   Sem nenhuma destas fontes, o contrato continua "sem registo".
-- Idempotente: só insere onde ainda não há marco 'contrato_fechado'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_historico_resumo(p_contrato_id uuid)
RETURNS TABLE(evento_tipo text, ator_id uuid, ator_nome text, detalhe text, criado_em timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT h.evento_tipo, h.ator_id, h.detalhe, h.criado_em,
           row_number() OVER (
             PARTITION BY h.evento_tipo ORDER BY h.criado_em DESC
           ) AS rn_por_tipo
    FROM public.contrato_historico h
    WHERE h.contrato_id = p_contrato_id
      AND h.org_id = public.get_current_org_id()
  ),
  ctr AS (
    SELECT estado_operacional::text AS eo, estado_financeiro::text AS ef
    FROM public.contratos_renting
    WHERE id = p_contrato_id
      AND org_id = public.get_current_org_id()
  ),
  marcos AS (
    SELECT b.evento_tipo, b.ator_id, b.detalhe, b.criado_em
    FROM base b
    CROSS JOIN ctr
    WHERE b.rn_por_tipo = 1
      AND (
            b.evento_tipo = 'reserva_criada'
        OR (b.evento_tipo = 'contrato_aberto'   AND ctr.eo <> 'agendado')
        OR (b.evento_tipo = 'contrato_fechado'  AND ctr.eo IN ('devolvido','cancelado','fechado'))
        OR (b.evento_tipo = 'contrato_faturado' AND ctr.ef <> 'pendente')
      )
  ),
  ultima AS (
    SELECT 'ultima_alteracao'::text AS evento_tipo, ator_id, detalhe, criado_em
    FROM base
    ORDER BY criado_em DESC
    LIMIT 1
  ),
  todos AS (
    SELECT * FROM marcos
    UNION ALL
    SELECT * FROM ultima
  )
  SELECT t.evento_tipo, t.ator_id, COALESCE(p.nome, 'Sistema') AS ator_nome,
         t.detalhe, t.criado_em
  FROM todos t
  LEFT JOIN public.profiles p ON p.id = t.ator_id
  ORDER BY CASE t.evento_tipo
    WHEN 'reserva_criada'    THEN 1
    WHEN 'contrato_aberto'   THEN 2
    WHEN 'contrato_fechado'  THEN 3
    WHEN 'contrato_faturado' THEN 4
    WHEN 'ultima_alteracao'  THEN 5
    ELSE 9
  END;
$$;


CREATE OR REPLACE FUNCTION public.fn_contrato_historico_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ator uuid := COALESCE(auth.uid(), NEW.updated_by);
  v_mudou boolean;
BEGIN
  v_mudou := (
    NEW.reserva_id              IS DISTINCT FROM OLD.reserva_id
    OR NEW.cliente_id           IS DISTINCT FROM OLD.cliente_id
    OR NEW.viatura_id           IS DISTINCT FROM OLD.viatura_id
    OR NEW.matricula            IS DISTINCT FROM OLD.matricula
    OR NEW.grupo                IS DISTINCT FROM OLD.grupo
    OR NEW.estacao_entrega_id   IS DISTINCT FROM OLD.estacao_entrega_id
    OR NEW.estacao_recolha_id   IS DISTINCT FROM OLD.estacao_recolha_id
    OR NEW.estacao_origem_viatura_id IS DISTINCT FROM OLD.estacao_origem_viatura_id
    OR NEW.data_inicio          IS DISTINCT FROM OLD.data_inicio
    OR NEW.data_fim             IS DISTINCT FROM OLD.data_fim
    OR NEW.estado_operacional   IS DISTINCT FROM OLD.estado_operacional
    OR NEW.estado_financeiro    IS DISTINCT FROM OLD.estado_financeiro
    OR NEW.tarifa_diaria        IS DISTINCT FROM OLD.tarifa_diaria
    OR NEW.desconto_percentagem IS DISTINCT FROM OLD.desconto_percentagem
    OR NEW.taxa_iva             IS DISTINCT FROM OLD.taxa_iva
    OR NEW.valor_total_manual   IS DISTINCT FROM OLD.valor_total_manual
    OR NEW.total_subtotal       IS DISTINCT FROM OLD.total_subtotal
    OR NEW.total_iva            IS DISTINCT FROM OLD.total_iva
    OR NEW.total_final          IS DISTINCT FROM OLD.total_final
    OR NEW.voucher_codigo       IS DISTINCT FROM OLD.voucher_codigo
    OR NEW.numero_processo      IS DISTINCT FROM OLD.numero_processo
    OR NEW.voo_referencia       IS DISTINCT FROM OLD.voo_referencia
    OR NEW.local_entrega        IS DISTINCT FROM OLD.local_entrega
    OR NEW.local_recolha        IS DISTINCT FROM OLD.local_recolha
    OR NEW.comentarios_entrega  IS DISTINCT FROM OLD.comentarios_entrega
    OR NEW.comentarios_recolha  IS DISTINCT FROM OLD.comentarios_recolha
    OR NEW.observacoes          IS DISTINCT FROM OLD.observacoes
    OR NEW.deleted_at           IS DISTINCT FROM OLD.deleted_at
  );

  IF NOT v_mudou THEN
    RETURN NEW;
  END IF;

  -- 'fechado' é o fim normal de um contrato (fecho no ecrã, renovação):
  -- conta como fecho, tal como 'devolvido' e 'cancelado'. Cancelar um
  -- contrato já fechado continua a ficar registado (como antes).
  IF (NEW.estado_operacional IN ('devolvido', 'cancelado', 'fechado')
      AND OLD.estado_operacional NOT IN ('devolvido', 'cancelado', 'fechado'))
     OR (NEW.estado_operacional = 'cancelado'
         AND OLD.estado_operacional IN ('devolvido', 'fechado')) THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_fechado', v_ator,
      OLD.estado_operacional || ' → ' || NEW.estado_operacional
    );
  END IF;

  IF NEW.estado_financeiro = 'facturado'
     AND OLD.estado_financeiro IS DISTINCT FROM 'facturado' THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_faturado', v_ator, NULL
    );
  END IF;

  IF NEW.estado_operacional = 'em_curso'
     AND OLD.estado_operacional IS DISTINCT FROM 'em_curso' THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_aberto', v_ator,
      OLD.estado_operacional || ' → em_curso'
    );
  END IF;

  PERFORM public.fn_contrato_historico_log(
    NEW.id, NEW.org_id, 'alteracao', v_ator, NULL
  );

  RETURN NEW;
END;
$$;


-- Recupera os fechos antigos (ver cabeçalho). Para cada contrato, a âncora
-- que bate com a alteração gravada pelo trigger nesse instante dá o autor.
WITH alvo AS (
  SELECT c.id, c.org_id, c.substituido_em, c.created_at AS criado
    FROM public.contratos_renting c
   WHERE c.estado_operacional = 'fechado'
     AND NOT EXISTS (SELECT 1 FROM public.contrato_historico h
                      WHERE h.contrato_id = c.id AND h.evento_tipo = 'contrato_fechado')
),
recolha AS (
  SELECT DISTINCT ON (e.origem_id) e.origem_id, e.created_at, e.descricao, e.realizado_em, e.realizado_por_id
    FROM public.calendario_eventos e JOIN alvo a ON a.id = e.origem_id
   WHERE e.origem_tipo = 'contrato_renting' AND e.tipo = 'recolha'
   ORDER BY e.origem_id, e.realizado_em DESC NULLS LAST, e.created_at DESC
),
ancora AS (
  SELECT a.id, a.org_id, x.quando, x.janela_s, x.fonte, x.ator_reserva, x.ordem
    FROM alvo a
    LEFT JOIN recolha r ON r.origem_id = a.id
    CROSS JOIN LATERAL (VALUES
      (a.substituido_em, 5, 'renovação', NULL::uuid, 1),
      (r.realizado_em, 60, 'recolha confirmada', r.realizado_por_id, 2),
      (CASE WHEN r.descricao LIKE '%Fecho do contrato%'
             AND r.created_at > a.criado + interval '2 minutes' THEN r.created_at END,
       60, 'fecho no calendário', NULL::uuid, 3)
    ) AS x(quando, janela_s, fonte, ator_reserva, ordem)
   WHERE x.quando IS NOT NULL
),
escolha AS (
  SELECT DISTINCT ON (an.id) an.id, an.org_id, an.fonte,
         COALESCE(alt.ator_id, an.ator_reserva) AS ator,
         COALESCE(alt.criado_em, an.quando) AS quando,
         alt.criado_em IS NOT NULL AS com_alteracao, an.ordem
    FROM ancora an
    LEFT JOIN LATERAL (
      SELECT h.ator_id, h.criado_em FROM public.contrato_historico h
       WHERE h.contrato_id = an.id AND h.evento_tipo = 'alteracao'
         AND h.criado_em BETWEEN an.quando - make_interval(secs => an.janela_s)
                             AND an.quando + make_interval(secs => an.janela_s)
       ORDER BY abs(extract(epoch FROM h.criado_em - an.quando)) LIMIT 1
    ) alt ON true
   -- renovação primeiro; depois a âncora que bate com a alteração gravada
   ORDER BY an.id, (an.ordem = 1) DESC, (alt.criado_em IS NOT NULL) DESC, an.ordem
)
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe, criado_em)
SELECT e.id, e.org_id, 'contrato_fechado', e.ator,
       '→ fechado (recuperado: ' || e.fonte || ')', e.quando
  FROM escolha e;
