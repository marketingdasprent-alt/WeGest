-- Fila Primavera: cada job pertence a uma integração (empresa emissora), e um emit nunca corre duas vezes.
--
-- Com duas empresas na mesma organização (DASPWSTEST e DECAWSTEST), cada uma tem o seu agente. A fila
-- era por organização: o agente de uma empresa podia reclamar o job da outra e emitir a fatura na
-- empresa errada. Agora o job leva integracao_id e o agente só reclama os da sua integração.
--
-- Reemissão: um emit reclamado há mais de 2 minutos voltava à fila e era executado outra vez; um job
-- pendente nunca expirava, e o agente podia emitir muito depois de o WeGest ter desistido. Agora o
-- emit preso fica 'ambiguo' (nunca volta à fila), o pendente expira (expires_at) e fecha como falha
-- sem ter corrido, e o resultado do agente só fecha jobs ainda reclamados (edge primavera-agent-result).

ALTER TABLE public.primavera_jobs
  ADD COLUMN IF NOT EXISTS integracao_id uuid REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.primavera_jobs.integracao_id IS
  'Integração de faturação (plataformas_configuracao) a que o job pertence. Só o agente dessa integração o reclama.';
COMMENT ON COLUMN public.primavera_jobs.expires_at IS
  'Depois desta hora um job ainda pendente não é executado: o WeGest já desistiu de esperar. Fecha como failed ao reclamar.';

ALTER TABLE public.primavera_jobs DROP CONSTRAINT IF EXISTS primavera_jobs_status_check;
ALTER TABLE public.primavera_jobs
  ADD CONSTRAINT primavera_jobs_status_check
  CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'ambiguo'));

COMMENT ON COLUMN public.primavera_jobs.status IS
  'pending, claimed, done, failed, ou ambiguo: o agente reclamou e não respondeu, o documento pode existir no Primavera. Nunca reemitir sem confirmar lá.';

CREATE INDEX IF NOT EXISTS idx_primavera_jobs_integracao_status
  ON public.primavera_jobs (integracao_id, status, created_at);

-- Jobs antigos sem integração nunca mais seriam reclamados: fecham como falha, sem terem corrido.
UPDATE public.primavera_jobs
   SET status = 'failed',
       completed_at = now(),
       error_message = 'Fila migrada para integração por empresa (08/10/2026): pedido antigo sem integração, não executado.'
 WHERE integracao_id IS NULL
   AND status IN ('pending', 'claimed');

-- O claim por organização desaparece: com ele, o agente de uma empresa levava os jobs da outra.
DROP FUNCTION IF EXISTS public.primavera_jobs_claim(uuid, integer);

CREATE OR REPLACE FUNCTION public.primavera_jobs_claim_integracao(p_integracao_id uuid, p_max integer)
RETURNS SETOF public.primavera_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('primavera_jobs_claim:' || p_integracao_id::text)) THEN
    RETURN; -- outro poll da mesma integração está a reclamar; tenta no próximo tick
  END IF;

  -- Pendente que o WeGest já deu por perdido: não se executa.
  UPDATE public.primavera_jobs
     SET status = 'failed',
         completed_at = now(),
         error_message = 'Expirou antes de o agente o reclamar; o WeGest já tinha desistido de esperar. Nada foi emitido.'
   WHERE integracao_id = p_integracao_id
     AND status = 'pending'
     AND expires_at IS NOT NULL
     AND expires_at < now();

  -- Reclamado há mais de 2 minutos sem resultado: um teste de ligação volta à fila.
  UPDATE public.primavera_jobs
     SET status = 'pending', claimed_at = NULL
   WHERE integracao_id = p_integracao_id
     AND status = 'claimed'
     AND tipo <> 'emit'
     AND claimed_at < now() - interval '2 minutes';

  -- Um emit nessa situação NUNCA volta à fila: o documento pode ter sido criado.
  UPDATE public.primavera_jobs
     SET status = 'ambiguo',
         completed_at = now(),
         error_message = 'O agente reclamou o pedido e não devolveu resultado em 2 minutos. O documento pode ter sido criado: confirmar no Primavera antes de reemitir.'
   WHERE integracao_id = p_integracao_id
     AND status = 'claimed'
     AND tipo = 'emit'
     AND claimed_at < now() - interval '2 minutes';

  RETURN QUERY
  UPDATE public.primavera_jobs q
     SET status = 'claimed', claimed_at = now()
    FROM (
      SELECT id FROM public.primavera_jobs
       WHERE integracao_id = p_integracao_id AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT GREATEST(p_max, 0)
       FOR UPDATE SKIP LOCKED
    ) reclamados
   WHERE q.id = reclamados.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.primavera_jobs_claim_integracao(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.primavera_jobs_claim_integracao(uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
