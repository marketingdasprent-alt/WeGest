-- supabase/migrations/20260724100003_faturacao_outbox.sql
-- ============================================================
-- Outbox de emissão fiscal (genérica) + claim atómico
-- ============================================================
-- A API do provider não aceita chave de idempotência: um retry cego depois de
-- um timeout pode emitir um SEGUNDO recibo sobre a mesma fatura — erro fiscal
-- corrigível só por anulação manual. Por isso:
--   • UNIQUE(idempotency_key) → uma emissão por parcela, garantido pelo esquema;
--   • claim atómico           → duas invocações do drain nunca processam a mesma linha;
--   • estado 'suspenso'       → resultado DESCONHECIDO nunca é reemitido (v1).
--
-- Padrão de claim copiado de via_verde_sync_queue_claim (20260723100000).
-- ============================================================

CREATE TABLE public.faturacao_outbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  tipo              text NOT NULL CHECK (tipo IN ('RC')),
  idempotency_key   text NOT NULL,
  parcela_id        uuid REFERENCES public.acordo_parcelas(id) ON DELETE CASCADE,
  payload           jsonb NOT NULL,
  estado            text NOT NULL DEFAULT 'pendente'
                    CHECK (estado IN ('pendente','em_curso','sucesso','falhado','suspenso')),
  needs_reconcile   boolean NOT NULL DEFAULT false,
  tentativas        smallint NOT NULL DEFAULT 0,
  proxima_tentativa timestamptz NOT NULL DEFAULT now(),
  ultimo_erro       text,
  invoice_id        uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  started_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_faturacao_outbox_idk ON public.faturacao_outbox (idempotency_key);
CREATE INDEX idx_faturacao_outbox_due ON public.faturacao_outbox (proxima_tentativa)
  WHERE estado = 'pendente';
CREATE INDEX idx_faturacao_outbox_atencao ON public.faturacao_outbox (org_id)
  WHERE estado IN ('falhado','suspenso');
CREATE INDEX idx_faturacao_outbox_estado ON public.faturacao_outbox (estado);
CREATE INDEX idx_faturacao_outbox_parcela ON public.faturacao_outbox (parcela_id);

CREATE TRIGGER trg_faturacao_outbox_updated_at
  BEFORE UPDATE ON public.faturacao_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.faturacao_outbox ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE: combina com AND sobre as permissivas, por isso nenhuma policy
-- de funcionalidade consegue, por engano, abrir leitura cross-org.
-- Obrigatória em toda a tabela com org_id (ver supabase/tests/rls_org_isolation.test.sql).
CREATE POLICY rls_org_isolation ON public.faturacao_outbox
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());

-- Leitura e escrita para staff com acesso de faturação da própria org — quem
-- regista o pagamento (INSERT, via a RPC acordo_parcela_registar_pagamento)
-- também precisa de poder ver o próprio outbox row depois (ex.: para saber se
-- ficou suspenso) e de poder actualizar o seu estado quando a emissão fiscal
-- resolve (known_failed→pendente, unknown→suspenso, sucesso). O comentário
-- anterior ("a escrita é do worker") estava errado — o cliente sempre
-- escreveu aqui; só não tinha permissão para o UPDATE, e isso falhava em
-- silêncio (RLS filtra, supabase-js devolve {error:null}).
CREATE POLICY "mt_outbox_select" ON public.faturacao_outbox
  FOR SELECT TO authenticated USING (has_renting_faturacao_access());
CREATE POLICY "mt_outbox_insert" ON public.faturacao_outbox
  FOR INSERT TO authenticated WITH CHECK (has_renting_faturacao_access());
CREATE POLICY "mt_outbox_update" ON public.faturacao_outbox
  FOR UPDATE TO authenticated
  USING (has_renting_faturacao_access())
  WITH CHECK (has_renting_faturacao_access());
CREATE POLICY "Service role full access to faturacao_outbox" ON public.faturacao_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Claim atómico ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.faturacao_outbox_claim(p_max integer)
RETURNS SETOF public.faturacao_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_capacity integer;
BEGIN
  -- FOR UPDATE SKIP LOCKED sozinho só impede duas invocações agarrarem a MESMA
  -- linha — não impede que duas sobrepostas, cada uma vendo "há folga",
  -- reclamem em conjunto mais do que p_max.
  IF NOT pg_try_advisory_xact_lock(hashtext('faturacao_outbox_claim')) THEN
    RETURN;
  END IF;

  -- Reaper: linha presa vai DIRETO para 'suspenso'. Uma execução interrompida
  -- deixa o resultado no provider desconhecido, e na v1 desconhecido nunca é
  -- reemitido automaticamente. Voltar a 'pendente' só gastaria um ciclo de claim.
  UPDATE public.faturacao_outbox
     SET estado = 'suspenso', needs_reconcile = true,
         ultimo_erro = 'Interrompida — estado no provider desconhecido'
   WHERE estado = 'em_curso' AND started_at < now() - interval '10 minutes';

  SELECT GREATEST(p_max - count(*), 0) INTO v_capacity
    FROM public.faturacao_outbox WHERE estado = 'em_curso';
  IF v_capacity = 0 THEN RETURN; END IF;

  RETURN QUERY
  UPDATE public.faturacao_outbox o
     SET estado = 'em_curso', started_at = now(), tentativas = o.tentativas + 1
    FROM (
      SELECT id FROM public.faturacao_outbox
       WHERE estado = 'pendente' AND proxima_tentativa <= now()
       ORDER BY proxima_tentativa ASC
       LIMIT v_capacity
       FOR UPDATE SKIP LOCKED
    ) c
   WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.faturacao_outbox_claim(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.faturacao_outbox_claim(integer) TO service_role;

COMMENT ON TABLE public.faturacao_outbox IS
  'Fila de emissão de documentos fiscais com garantia de não-duplicação. '
  'estado suspenso = resultado desconhecido no provider, aguarda decisão humana.';
