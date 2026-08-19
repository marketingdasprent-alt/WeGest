-- ============================================================
-- Auditoria do motorista + data de desativação
-- ============================================================
-- Dois problemas encontrados ao investigar porque é que o motorista #252
-- (José Werley Carvalho Braga) desapareceu de TODOS os resumos:
--
-- 1) Ninguém o desativou à mão. Fechar um contrato TVDE marca o motorista
--    como inativo automaticamente (useContratosRenting.ts) — efeito
--    colateral da recolha da viatura. Não havia forma nenhuma de descobrir
--    quem/quando: motoristas_ativos não tem coluna de ator e não existia
--    histórico. Só se chegou lá por cruzamento manual de timestamps com
--    contrato_historico. Daí a tabela de auditoria abaixo.
--
-- 2) O ecrã de Contas/Resumo esconde motoristas inativos de TODAS as
--    semanas, incluindo as já trabalhadas e por acertar — dinheiro real
--    (ganhos das plataformas, saldo pendente) desaparecia do sítio onde se
--    fazem os pagamentos. Para o corrigir é preciso saber QUANDO ficou
--    inativo, e não só que está: daí `desativado_em`.
--
-- Mesmo padrão de contrato_historico (20260618000004): tabela append-only
-- preenchida por triggers com auth.uid(), à prova de bypass — regista mesmo
-- alterações feitas por SQL direto ou por efeito colateral de outro fluxo,
-- que foi exactamente o caso aqui.
-- ============================================================

-- 1) Data de desativação --------------------------------------
-- Derivada (mantida por trigger), não preenchida pela app: o objectivo é
-- responder a "a partir de que semana é que este motorista deixa de contar",
-- e isso não pode depender de cada sítio no código se lembrar de a gravar.
ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS desativado_em timestamptz;

COMMENT ON COLUMN public.motoristas_ativos.desativado_em IS
  'Quando status_ativo passou a false (NULL enquanto ativo). Mantida por '
  'trigger. Usada pelos resumos semanais para continuar a mostrar o motorista '
  'nas semanas ANTERIORES à desativação — contas por fechar não podem '
  'desaparecer do ecrã só porque a viatura foi recolhida.';

-- Backfill dos já inativos: updated_at é a melhor aproximação disponível
-- (não há histórico anterior a esta migração). Só afecta linhas que ainda
-- não têm valor, por isso é seguro correr mais do que uma vez.
UPDATE public.motoristas_ativos
   SET desativado_em = updated_at
 WHERE status_ativo = false
   AND desativado_em IS NULL;

-- 2) Tabela de histórico --------------------------------------
CREATE TABLE IF NOT EXISTS public.motorista_historico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE
                DEFAULT public.get_current_org_id(),
  motorista_id  uuid NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  evento_tipo   text NOT NULL CHECK (evento_tipo IN ('ativado', 'desativado', 'alteracao')),
  -- Ator: quem fez a ação. NULL = ação de sistema (cron, service role) ou
  -- legado. Nunca confiar no chamador: vem sempre de auth.uid().
  ator_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  -- Detalhe legível (ex.: "status_ativo: true → false").
  detalhe       text,
  criado_em     timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_motorista_historico_motorista
  ON public.motorista_historico (motorista_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_motorista_historico_org
  ON public.motorista_historico (org_id);

COMMENT ON TABLE public.motorista_historico IS
  'Eventos de auditoria por motorista (ativação, desativação, alterações a '
  'campos sensíveis). Preenchido por triggers — responde a "quem desativou '
  'este motorista e quando", que antes era impossível de saber.';

-- 3) RLS ------------------------------------------------------
-- Leitura alinhada com motorista_financeiro (mt_motorista_fin_select): quem
-- gere motoristas vê o histórico. Sem policies de escrita: append-only via
-- triggers SECURITY DEFINER, imutável a partir da app.
ALTER TABLE public.motorista_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mh_select" ON public.motorista_historico;
CREATE POLICY "mh_select" ON public.motorista_historico
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_current_org_id()
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'motoristas_gestao')
    )
  );

-- 4) Trigger de auditoria + manutenção de desativado_em -------
-- Um só trigger para os dois efeitos: manter desativado_em coerente com
-- status_ativo e registar o evento. Separá-los daria duas leituras da mesma
-- linha e o risco de ficarem dessincronizados.
CREATE OR REPLACE FUNCTION public.fn_motorista_historico_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_ativo IS DISTINCT FROM OLD.status_ativo THEN
    -- desativado_em segue o estado: marca à saída, limpa ao regressar (um
    -- motorista reativado volta a contar em todas as semanas).
    NEW.desativado_em := CASE WHEN NEW.status_ativo = false
                              THEN timezone('utc', now())
                              ELSE NULL END;

    INSERT INTO public.motorista_historico (motorista_id, org_id, evento_tipo, ator_id, detalhe)
    VALUES (
      NEW.id,
      NEW.org_id,
      CASE WHEN NEW.status_ativo = false THEN 'desativado' ELSE 'ativado' END,
      auth.uid(),
      format('status_ativo: %s → %s', OLD.status_ativo, NEW.status_ativo)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE UPDATE: precisa de alterar NEW.desativado_em na própria linha.
DROP TRIGGER IF EXISTS trg_motorista_historico_update ON public.motoristas_ativos;
CREATE TRIGGER trg_motorista_historico_update
  BEFORE UPDATE ON public.motoristas_ativos
  FOR EACH ROW EXECUTE FUNCTION public.fn_motorista_historico_update();
