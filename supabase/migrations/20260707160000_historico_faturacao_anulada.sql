-- ============================================================
-- Histórico de Edições: "Contrato faturado por" some ao anular a faturação
-- ============================================================
-- Problema: o marco 'contrato_faturado' é escrito por trigger quando o contrato
-- passa a estado_financeiro='facturado'. Ao anular a faturação (volta a
-- 'pendente'), esse evento permanecia na tabela (append-only), pelo que a secção
-- "Histórico de Edições" continuava a mostrar "Contrato faturado por: …" mesmo
-- sem faturação ativa.
--
-- Solução (respeita o append-only, não apaga história):
--   1. Novo evento 'faturacao_anulada' registado quando estado_financeiro sai de
--      'facturado'.
--   2. A RPC contrato_historico_resumo esconde o marco 'contrato_faturado'
--      quando existe uma 'faturacao_anulada' MAIS RECENTE. Se o contrato for
--      re-faturado, o novo 'contrato_faturado' volta a ser o mais recente e o
--      marco reaparece.
--
-- Idempotente e aditiva.
-- ============================================================

-- 1) Aceitar o novo tipo de evento no CHECK ------------------------------------
ALTER TABLE public.contrato_historico DROP CONSTRAINT IF EXISTS contrato_historico_evento_tipo_check;
ALTER TABLE public.contrato_historico
  ADD CONSTRAINT contrato_historico_evento_tipo_check
  CHECK (evento_tipo IN (
    'reserva_criada',
    'contrato_aberto',
    'contrato_fechado',
    'contrato_faturado',
    'faturacao_anulada',
    'alteracao'
  ));

-- 2) Trigger de UPDATE: registar 'faturacao_anulada' ---------------------------
--    Reescreve fn_contrato_historico_update acrescentando o ramo da anulação.
--    (Idêntica à versão de 20260618000004 + o bloco novo.)
CREATE OR REPLACE FUNCTION public.fn_contrato_historico_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ator uuid := auth.uid();
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
    RETURN NEW;  -- só mudaram colunas de auditoria → nada a registar
  END IF;

  -- Contrato fechado: passou a 'devolvido' ou 'cancelado'.
  IF NEW.estado_operacional IN ('devolvido', 'cancelado')
     AND OLD.estado_operacional NOT IN ('devolvido', 'cancelado') THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_fechado', v_ator,
      OLD.estado_operacional || ' → ' || NEW.estado_operacional
    );
  END IF;

  -- Contrato faturado: estado_financeiro passou a 'facturado'.
  IF NEW.estado_financeiro = 'facturado'
     AND OLD.estado_financeiro IS DISTINCT FROM 'facturado' THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_faturado', v_ator, NULL
    );
  END IF;

  -- Faturação anulada: estado_financeiro saiu de 'facturado' (ou 'pago') para
  -- outro estado (tipicamente 'pendente'). Faz o marco "Contrato faturado por"
  -- desaparecer do histórico até nova faturação.
  IF OLD.estado_financeiro IN ('facturado', 'pago')
     AND NEW.estado_financeiro IS DISTINCT FROM OLD.estado_financeiro
     AND NEW.estado_financeiro NOT IN ('facturado', 'pago') THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'faturacao_anulada', v_ator,
      OLD.estado_financeiro || ' → ' || NEW.estado_financeiro
    );
  END IF;

  -- "Contrato aberto" tardio: passou a 'em_curso' depois de agendado.
  IF NEW.estado_operacional = 'em_curso'
     AND OLD.estado_operacional IS DISTINCT FROM 'em_curso' THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_aberto', v_ator,
      OLD.estado_operacional || ' → em_curso'
    );
  END IF;

  -- Qualquer alteração conta como "última alteração".
  PERFORM public.fn_contrato_historico_log(
    NEW.id, NEW.org_id, 'alteracao', v_ator, NULL
  );

  RETURN NEW;
END;
$$;

-- 3) RPC: esconder 'contrato_faturado' se houver 'faturacao_anulada' posterior -
CREATE OR REPLACE FUNCTION public.contrato_historico_resumo(p_contrato_id uuid)
 RETURNS TABLE(evento_tipo text, ator_id uuid, ator_nome text, detalhe text, criado_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT h.evento_tipo, h.ator_id, h.detalhe, h.criado_em,
           row_number() OVER (PARTITION BY h.evento_tipo ORDER BY h.criado_em DESC) AS rn_por_tipo
    FROM public.contrato_historico h
    WHERE h.contrato_id = p_contrato_id AND h.org_id = public.get_current_org_id()
  ),
  -- Data da última faturação e da última anulação (para decidir o marco).
  ultima_faturacao AS (
    SELECT max(criado_em) AS em FROM base WHERE evento_tipo = 'contrato_faturado'
  ),
  ultima_anulacao AS (
    SELECT max(criado_em) AS em FROM base WHERE evento_tipo = 'faturacao_anulada'
  ),
  marcos AS (
    SELECT evento_tipo, ator_id, detalhe, criado_em FROM base
    WHERE rn_por_tipo = 1
      AND evento_tipo IN ('reserva_criada','contrato_aberto','contrato_fechado','contrato_faturado')
      -- Esconde o marco de faturação se foi anulada depois da última faturação.
      AND NOT (
        evento_tipo = 'contrato_faturado'
        AND (SELECT em FROM ultima_anulacao) IS NOT NULL
        AND (SELECT em FROM ultima_anulacao) > COALESCE((SELECT em FROM ultima_faturacao), 'epoch'::timestamptz)
      )
  ),
  ultima AS (
    SELECT 'ultima_alteracao'::text AS evento_tipo, ator_id, detalhe, criado_em
    FROM base ORDER BY criado_em DESC LIMIT 1
  ),
  todos AS (SELECT * FROM marcos UNION ALL SELECT * FROM ultima)
  SELECT t.evento_tipo, t.ator_id, COALESCE(p.nome, 'Utilizador desconhecido') AS ator_nome,
         t.detalhe, t.criado_em
  FROM todos t
  LEFT JOIN public.profiles p ON p.id = t.ator_id
  ORDER BY CASE t.evento_tipo
    WHEN 'reserva_criada' THEN 1 WHEN 'contrato_aberto' THEN 2
    WHEN 'contrato_fechado' THEN 3 WHEN 'contrato_faturado' THEN 4
    WHEN 'ultima_alteracao' THEN 5 ELSE 9 END;
$function$;

-- 4) Backfill: contratos que já foram anulados no passado -----------------------
--    Têm um marco 'contrato_faturado' mas hoje NÃO estão faturados e nunca
--    registaram a anulação (porque o evento não existia). Regista uma
--    'faturacao_anulada' com a data da última alteração, para o histórico ficar
--    coerente com o estado atual (marco de faturação escondido).
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe, criado_em)
SELECT c.id, c.org_id, 'faturacao_anulada', c.updated_by,
       'backfill: faturação anulada (estado atual: ' || c.estado_financeiro || ')',
       COALESCE(c.updated_at, timezone('utc', now()))
FROM public.contratos_renting c
WHERE c.estado_financeiro NOT IN ('facturado', 'pago')
  AND EXISTS (
    SELECT 1 FROM public.contrato_historico h
    WHERE h.contrato_id = c.id AND h.evento_tipo = 'contrato_faturado'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.contrato_historico h
    WHERE h.contrato_id = c.id AND h.evento_tipo = 'faturacao_anulada'
  );
