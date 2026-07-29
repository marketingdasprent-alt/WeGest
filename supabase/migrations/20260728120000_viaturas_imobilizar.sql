-- ============================================================
-- Permissão + log para bloquear/libertar viaturas (imobilizador Cartrack)
-- ============================================================
-- Novo recurso 'viaturas_imobilizar' na categoria 'Viaturas' → aparece no
-- módulo "Frota" do seletor de permissões; admins concedem-no por cargo
-- (cargo_permissoes.tem_acesso). O gate é aplicado no cliente E no servidor
-- (edge function cartrack-immobilise).
-- Migração idempotente/aditiva.
-- ============================================================

-- 1) Recurso de permissão (tabela global `recursos`)
INSERT INTO public.recursos (nome, descricao, categoria)
SELECT 'viaturas_imobilizar', 'Bloquear/desbloquear viaturas (imobilizador Cartrack)', 'Viaturas'
WHERE NOT EXISTS (SELECT 1 FROM public.recursos WHERE nome = 'viaturas_imobilizar');

-- 2) Log de comandos de imobilização (auditoria — ação sensível)
CREATE TABLE IF NOT EXISTS public.cartrack_comandos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT get_current_org_id(),
  integracao_id uuid REFERENCES public.plataformas_configuracao(id) ON DELETE SET NULL,
  viatura_id    uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  registration  text,
  acao          text NOT NULL,               -- 'immobilise' | 'release'
  sucesso       boolean NOT NULL DEFAULT false,
  mensagem      text,
  executado_por uuid,                         -- auth.users.id de quem executou
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cartrack_comandos_viatura ON public.cartrack_comandos (viatura_id);
CREATE INDEX IF NOT EXISTS idx_cartrack_comandos_data    ON public.cartrack_comandos (created_at);

ALTER TABLE public.cartrack_comandos ENABLE ROW LEVEL SECURITY;

-- Leitura por org (o insert é feito pelo edge function em service_role, que bypassa RLS).
DROP POLICY IF EXISTS "mt_cartrack_comandos_select" ON public.cartrack_comandos;
CREATE POLICY "mt_cartrack_comandos_select" ON public.cartrack_comandos
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

COMMENT ON TABLE public.cartrack_comandos IS 'Auditoria de comandos Cartrack (imobilizar/libertar) — quem, quando, resultado.';
