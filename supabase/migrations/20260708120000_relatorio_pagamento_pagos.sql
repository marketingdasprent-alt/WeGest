-- ============================================================
-- Relatório de Pagamento: persistir motoristas marcados como "pago"
-- ============================================================
-- Antes, o "pago" era só visual e perdia-se ao fechar o diálogo.
-- Esta tabela guarda, por organização e por semana, que motoristas
-- já foram pagos — passa a ser partilhado por toda a equipa.
-- Presença de linha = pago; toggle "despago" apaga a linha.
-- Idempotente/aditiva (pode ser corrida à mão em produção).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.relatorio_pagamento_pagos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT get_current_org_id()
                  REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  motorista_id  uuid NOT NULL
                  REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  semana_inicio date NOT NULL,
  marcado_por   uuid DEFAULT auth.uid(),
  marcado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, motorista_id, semana_inicio)
);

-- Consulta típica: todos os pagos de uma semana da org.
CREATE INDEX IF NOT EXISTS idx_rel_pag_pagos_org_semana
  ON public.relatorio_pagamento_pagos (org_id, semana_inicio);

ALTER TABLE public.relatorio_pagamento_pagos ENABLE ROW LEVEL SECURITY;

-- Mesmo conjunto de permissões que já vê o relatório (motoristas_ativos):
-- admin da org, gestão de motoristas ou financeiro/recibos.
DROP POLICY IF EXISTS "mt_rel_pag_pagos_select" ON public.relatorio_pagamento_pagos;
DROP POLICY IF EXISTS "mt_rel_pag_pagos_insert" ON public.relatorio_pagamento_pagos;
DROP POLICY IF EXISTS "mt_rel_pag_pagos_delete" ON public.relatorio_pagamento_pagos;

CREATE POLICY "mt_rel_pag_pagos_select" ON public.relatorio_pagamento_pagos
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'financeiro_recibos')
  ));

CREATE POLICY "mt_rel_pag_pagos_insert" ON public.relatorio_pagamento_pagos
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'financeiro_recibos')
  ));

CREATE POLICY "mt_rel_pag_pagos_delete" ON public.relatorio_pagamento_pagos
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'financeiro_recibos')
  ));
