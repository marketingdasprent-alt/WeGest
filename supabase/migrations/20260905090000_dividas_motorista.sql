-- ============================================================
-- Dívidas do motorista: instantâneo do período negativo + danos
-- (motorista_financeiro categoria='reparacao') + caução
-- (motorista_financeiro categoria='caucao'), gravado no momento
-- em que o admin clica "Adicionar à dívida" no perfil financeiro
-- do motorista. Ver docs/superpowers/specs/2026-09-02-dividas-motorista-design.md.
-- ============================================================

CREATE TABLE public.dividas_motorista (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL DEFAULT get_current_org_id()
                    REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  motorista_id      uuid NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  -- Instantâneo do nome: a lista continua legível se o motorista for
  -- renomeado ou removido.
  motorista_nome    text NOT NULL,
  periodo_inicio    date NOT NULL,
  periodo_fim       date NOT NULL CHECK (periodo_fim >= periodo_inicio),
  valor_periodo     numeric(10,2) NOT NULL DEFAULT 0,
  valor_danos       numeric(10,2) NOT NULL DEFAULT 0 CHECK (valor_danos >= 0),
  -- Sem CHECK >= 0: é um saldo líquido (créditos − débitos de caução) e pode
  -- ser negativo quando há mais devolução lançada do que caução entregue.
  valor_caucao      numeric(10,2) NOT NULL DEFAULT 0,
  valor_total       numeric(10,2) NOT NULL,
  estado            text NOT NULL DEFAULT 'por_cobrar'
                    CHECK (estado IN ('por_cobrar', 'paga', 'cancelada')),
  pago_em           timestamptz,
  criado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_nome   text,
  created_at        timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at        timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX dividas_motorista_por_motorista
  ON public.dividas_motorista (motorista_id, periodo_inicio DESC);
CREATE INDEX dividas_motorista_por_estado
  ON public.dividas_motorista (org_id, estado);

CREATE TRIGGER dividas_motorista_set_updated_at
  BEFORE UPDATE ON public.dividas_motorista
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.dividas_motorista ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_deny_anon ON public.dividas_motorista
  AS RESTRICTIVE FOR ALL TO anon
  USING (false);

CREATE POLICY rls_org_isolation ON public.dividas_motorista
  AS RESTRICTIVE FOR ALL TO public
  USING (org_id = get_current_org_id() OR is_decada_ousada_admin());

CREATE POLICY dividas_motorista_gestao ON public.dividas_motorista
  AS PERMISSIVE FOR ALL TO public
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'financeiro_recibos')
    OR is_decada_ousada_admin()
  );
