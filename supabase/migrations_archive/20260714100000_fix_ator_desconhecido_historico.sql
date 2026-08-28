-- ============================================================
-- Fix: "Utilizador desconhecido" no histórico de contratos
-- ============================================================
-- Causa raiz (2 bugs em cadeia):
--
-- 1) fn_audit_update() sobrescrevia SEMPRE updated_by := auth.uid(),
--    mesmo quando quem chamou o UPDATE já tinha resolvido explicitamente
--    o ator (ex.: realizar_token_realizacao() define
--    updated_by = COALESCE(auth.uid(), v_token.created_by) para o fluxo
--    de check-in/entrega por token, que corre como `anon`). O trigger
--    BEFORE UPDATE apagava esse valor e punha NULL.
--
-- 2) fn_contrato_historico_update() lia auth.uid() diretamente em vez de
--    cair para NEW.updated_by, por isso mesmo com (1) corrigido continuava
--    a gravar ator_id = NULL para escritas sem sessão autenticada.
--
-- Fix: (1) só sobrescreve updated_by quando há sessão (auth.uid() IS NOT
-- NULL); caso contrário mantém o valor que o statement já definiu. (2)
-- cai para NEW.updated_by quando auth.uid() é NULL.
--
-- Casos que continuam sem ator (SQL direto na BD fora da app, ex. scripts
-- de manutenção) deixam de se chamar "Utilizador desconhecido" no ecrã —
-- passam a "Sistema", que é o que o comentário original da coluna já
-- previa ("NULL só em casos legados / ações de sistema").
-- ============================================================

-- 1) fn_audit_update: só substitui updated_by se houver sessão autenticada.
CREATE OR REPLACE FUNCTION public.fn_audit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

-- 2) fn_contrato_historico_update: cai para NEW.updated_by sem sessão.
CREATE OR REPLACE FUNCTION public.fn_contrato_historico_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF NEW.estado_operacional IN ('devolvido', 'cancelado')
     AND OLD.estado_operacional NOT IN ('devolvido', 'cancelado') THEN
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

-- 3) Backfill best-effort: para eventos já gravados com ator_id NULL,
--    recupera o autor a partir de contratos_renting.updated_by quando o
--    timestamp bate certo com essa escrita exata (evita atribuir a
--    pessoa errada quando houve escritas posteriores).
UPDATE public.contrato_historico h
SET ator_id = c.updated_by
FROM public.contratos_renting c
WHERE h.contrato_id = c.id
  AND h.ator_id IS NULL
  AND c.updated_by IS NOT NULL
  AND h.criado_em = c.updated_at;

-- 4) RPC de leitura: NULL remanescente passa a "Sistema" (ação sem sessão
--    autenticada, ex. SQL direto na BD), não "Utilizador desconhecido".
CREATE OR REPLACE FUNCTION public.contrato_historico_resumo(p_contrato_id uuid)
RETURNS TABLE (
  evento_tipo text,
  ator_id     uuid,
  ator_nome   text,
  detalhe     text,
  criado_em   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  marcos AS (
    SELECT evento_tipo, ator_id, detalhe, criado_em
    FROM base
    WHERE rn_por_tipo = 1
      AND evento_tipo IN ('reserva_criada','contrato_aberto','contrato_fechado','contrato_faturado')
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

GRANT EXECUTE ON FUNCTION public.contrato_historico_resumo(uuid) TO authenticated;
