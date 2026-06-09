-- ============================================================
-- "Fechar" o aviso de motorista pendente passa a ser PESSOAL (por utilizador)
-- e o escalonamento urgente ao supervisor é REMOVIDO.
-- ============================================================
-- Motivo: o admin às vezes fecha o aviso, mas quem tem de o ver/tratar é o
-- Gestor TVDE e o Supervisor Gestor TVDE. Por isso fechar não pode esconder
-- o aviso para os outros.
--
-- Regras:
--   - Fechar = dispensa só para quem clica (linha em notificacao_dispensas).
--   - Gestor TVDE / Supervisor continuam a ver até cada um fechar o seu.
--   - O aviso só desaparece para TODOS quando a candidatura é tratada
--     (em análise / aprovada / rejeitada) — isso já é feito pelo trigger.
--   - Já não há escalonamento ('Aviso fechado por um gestor').
--
-- Idempotente e aditiva (pode correr em produção sem perigo).
-- ============================================================

-- 1. Tabela de dispensas por utilizador --------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacao_dispensas (
  notificacao_id uuid NOT NULL REFERENCES public.notificacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notificacao_id, user_id)
);

ALTER TABLE public.notificacao_dispensas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gerir as minhas dispensas" ON public.notificacao_dispensas;
CREATE POLICY "gerir as minhas dispensas" ON public.notificacao_dispensas
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Helper: a notificação foi dispensada pelo utilizador atual? --------------
CREATE OR REPLACE FUNCTION public.notificacao_dispensada(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notificacao_dispensas
    WHERE notificacao_id = p_id AND user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.notificacao_dispensada(uuid) TO authenticated;

-- 3. SELECT: esconder só as que EU dispensei (continua visível para os outros)
DROP POLICY IF EXISTS "ver notificacoes do meu cargo" ON public.notificacoes;
CREATE POLICY "ver notificacoes do meu cargo" ON public.notificacoes
  FOR SELECT
  USING (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND NOT public.notificacao_dispensada(id)
    AND (
      (
        tipo = 'motorista_pendente'
        AND (
          is_current_user_admin()
          OR current_user_cargo() IN ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
        )
      )
      OR (
        tipo = 'escalonamento'
        AND current_user_cargo() = 'Supervisor Gestor TVDE'
      )
    )
  );

-- 4. "Fechar" = dispensar SÓ para mim (sem resolver global, sem escalonamento)
--    Mantemos o nome resolver_notificacao para o frontend continuar a funcionar
--    (mesmo versões em cache passam logo ao novo comportamento).
CREATE OR REPLACE FUNCTION public.resolver_notificacao(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo text;
  v_is_admin boolean;
BEGIN
  v_cargo := current_user_cargo();
  v_is_admin := is_current_user_admin();

  IF NOT (
    v_is_admin
    OR v_cargo IN ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para dispensar notificações';
  END IF;

  -- Dispensa apenas para o utilizador atual; NÃO mexe no estado global
  -- (resolvida) nem cria escalonamento.
  INSERT INTO public.notificacao_dispensas (notificacao_id, user_id)
  VALUES (p_id, auth.uid())
  ON CONFLICT (notificacao_id, user_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolver_notificacao(uuid) TO authenticated;
