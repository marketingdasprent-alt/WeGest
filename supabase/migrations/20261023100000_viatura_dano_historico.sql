-- Histórico de cada dano: mudanças de estado e de observações.
--
-- Num sinistro o dano passa por vários estados (existente → aguarda peritagem → condicional →
-- definitivo → ordem de reparação → em reparação) e as observações vão sendo reescritas. Até aqui
-- só ficava o último valor. Passa a ficar cada passo, escrito por trigger, no padrão de
-- viatura_historico.

-- ── Tabela ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.viatura_dano_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Copiado do dano (ou da viatura), não de get_current_org_id(): triggers sem sessão não têm org.
  org_id uuid NOT NULL,
  dano_id uuid NOT NULL REFERENCES public.viatura_danos(id) ON DELETE CASCADE,
  campo text NOT NULL CHECK (campo IN ('estado', 'observacoes')),
  valor_anterior text,
  valor_novo text,
  ator_id uuid DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.viatura_dano_historico IS
  'Passos de cada dano (estado e observações), escritos só pelo trigger trg_viatura_dano_regista_historico.';

CREATE INDEX IF NOT EXISTS idx_viatura_dano_historico_dano
  ON public.viatura_dano_historico (dano_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_viatura_dano_historico_org
  ON public.viatura_dano_historico (org_id);

-- ── RLS e grants ─────────────────────────────────────────────────────────────
-- Vê o histórico quem vê o dano: o EXISTS corre com o RLS de viatura_danos de quem pergunta.
-- Sem políticas de escrita para authenticated: só o trigger escreve.

ALTER TABLE public.viatura_dano_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vdh_select ON public.viatura_dano_historico;
CREATE POLICY vdh_select ON public.viatura_dano_historico
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_current_org_id()
    AND EXISTS (SELECT 1 FROM public.viatura_danos d WHERE d.id = viatura_dano_historico.dano_id)
  );

DROP POLICY IF EXISTS rls_org_isolation ON public.viatura_dano_historico;
CREATE POLICY rls_org_isolation ON public.viatura_dano_historico
  AS RESTRICTIVE TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id = public.get_current_org_id());

DROP POLICY IF EXISTS rls_deny_anon ON public.viatura_dano_historico;
CREATE POLICY rls_deny_anon ON public.viatura_dano_historico
  AS RESTRICTIVE TO anon
  USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.viatura_dano_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.viatura_dano_historico TO authenticated;

-- ── Trigger ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_viatura_dano_regista_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  -- viatura_danos.org_id é nullable; sem org não se grava, mas nunca se faz falhar o dano.
  v_org := coalesce(NEW.org_id, (SELECT v.org_id FROM public.viaturas v WHERE v.id = NEW.viatura_id));
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.viatura_dano_historico (org_id, dano_id, campo, valor_anterior, valor_novo)
    VALUES (v_org, NEW.id, 'estado', NULL, NEW.estado);
    RETURN NEW;
  END IF;

  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO public.viatura_dano_historico (org_id, dano_id, campo, valor_anterior, valor_novo)
    VALUES (v_org, NEW.id, 'estado', OLD.estado, NEW.estado);
  END IF;

  IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN
    INSERT INTO public.viatura_dano_historico (org_id, dano_id, campo, valor_anterior, valor_novo)
    VALUES (v_org, NEW.id, 'observacoes', OLD.observacoes, NEW.observacoes);
  END IF;

  RETURN NEW;
END;
$function$;

-- Default privileges dão EXECUTE a authenticated; revogar nomeando os três.
REVOKE EXECUTE ON FUNCTION public.fn_viatura_dano_regista_historico() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_viatura_dano_regista_historico ON public.viatura_danos;
CREATE TRIGGER trg_viatura_dano_regista_historico
  AFTER INSERT OR UPDATE OF estado, observacoes ON public.viatura_danos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_viatura_dano_regista_historico();

NOTIFY pgrst, 'reload schema';
