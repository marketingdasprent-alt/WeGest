-- ============================================================
-- Fix: 1) notificação de motorista pendente fica "presa" depois de
--         aprovar / rejeitar / marcar em análise
--      2) motorista rejeitado não conseguia reabrir/recandidatar-se
-- ============================================================
-- Idempotente e aditiva (pode ser corrida em produção sem perigo).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Resolver a notificação quando a candidatura deixa de estar
--    "à espera" (em análise / aprovada / rejeitada).
--    Reaproveitamos o trigger existente: além de CRIAR o aviso
--    quando passa a 'submetido', agora RESOLVE-o (sem escalonamento)
--    quando um gestor toma conta dela ou a decide.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_motorista_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  -- (a) Passou a submetido -> cria notificação de pendente (se não existir ativa)
  IF NEW.status = 'submetido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submetido') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notificacoes
      WHERE candidatura_id = NEW.id
        AND tipo = 'motorista_pendente'
        AND resolvida = false
    ) THEN
      INSERT INTO public.notificacoes (org_id, tipo, candidatura_id, titulo, mensagem, severidade)
      VALUES (
        NEW.org_id,
        'motorista_pendente',
        NEW.id,
        'Novo motorista pendente',
        COALESCE(NEW.nome, 'Um motorista') || ' submeteu a candidatura e aguarda análise.',
        'normal'
      );
    END IF;

  -- (b) Foi tratada (em análise / aprovada / rejeitada) -> fecha o aviso
  --     ativo para TODOS, SEM gerar escalonamento (não foi um "fechar" manual).
  ELSIF NEW.status IN ('em_analise', 'aprovado', 'rejeitado')
        AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();

    UPDATE public.notificacoes
    SET resolvida = true,
        resolvida_por = auth.uid(),
        resolvida_por_nome = COALESCE(v_nome, 'Sistema'),
        resolvida_em = now()
    WHERE candidatura_id = NEW.id
      AND tipo = 'motorista_pendente'
      AND resolvida = false;
  END IF;

  RETURN NEW;
END;
$$;

-- O trigger já existe (AFTER INSERT OR UPDATE OF status); recriamos por garantia.
DROP TRIGGER IF EXISTS trg_notificar_motorista_pendente ON public.motorista_candidaturas;
CREATE TRIGGER trg_notificar_motorista_pendente
  AFTER INSERT OR UPDATE OF status ON public.motorista_candidaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.notificar_motorista_pendente();

-- ------------------------------------------------------------
-- 2. Permitir que um motorista REJEITADO reabra a candidatura.
--    A política antiga só permitia editar em 'rascunho'/'submetido',
--    bloqueando o "Editar e Resubmeter" (rejeitado -> rascunho).
--    USING  : pode mexer enquanto está em rascunho/submetido/rejeitado.
--    CHECK  : o resultado tem de ficar em rascunho/submetido
--             (o motorista nunca se pode auto-aprovar).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Motoristas podem atualizar sua candidatura" ON public.motorista_candidaturas;
CREATE POLICY "Motoristas podem atualizar sua candidatura"
  ON public.motorista_candidaturas
  FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('rascunho', 'submetido', 'rejeitado'))
  WITH CHECK (auth.uid() = user_id AND status IN ('rascunho', 'submetido'));
