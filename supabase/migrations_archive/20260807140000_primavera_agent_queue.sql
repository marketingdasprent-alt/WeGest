-- ============================================================================
-- Fila do agente local do Primavera (AS Connect) — multi-tenant, zero rede exposta
-- ============================================================================
--
-- PORQUÊ UMA FILA E UM AGENTE, EM VEZ DE LIGAR DIRECTO AO PRIMAVERA
-- O servidor Primavera de cada empresa vive dentro da rede privada dela, só
-- acessível por VPN interna. Uma edge function do WeGest (na nuvem) não
-- consegue chegar lá, e pedir a CADA empresa cliente que exponha o seu
-- servidor à internet (porta aberta, VPN especial, etc.) não escala — é
-- fricção técnica que a maioria não sabe resolver sozinha, multiplicada por
-- cada cliente novo.
--
-- Em vez disso, um pequeno agente corre DENTRO da rede da empresa (ao lado
-- do Primavera) e liga-se sempre PARA FORA — nunca precisa de porta aberta,
-- nunca precisa de VPN, atravessa qualquer firewall corporativo tal como um
-- browser normal. As credenciais do AS Connect (username/password/enterprise)
-- ficam só na configuração local do agente — NUNCA chegam a esta base de
-- dados. O WeGest só guarda uma "chave de agente" por organização, que serve
-- só para o agente se autenticar a fazer poll/a devolver resultados — não dá
-- acesso a nada do Primavera por si só.
--
-- FLUXO
--   1. Alguém no WeGest gera um documento (emit) -> providers/primavera.ts
--      insere uma linha aqui com status='pending'.
--   2. O agente, a correr na rede da empresa, chama primavera-agent-poll de
--      poucos em poucos segundos com a SUA chave -> reclama até N linhas
--      pending da SUA organização (nunca vê linhas de outra org).
--   3. O agente fala com o Primavera LOCALMENTE (localhost/rede interna) e
--      chama primavera-agent-result com o resultado.
--   4. providers/primavera.ts, que ficou à espera (poll curto na mesma
--      chamada síncrona de emit()), lê o resultado e devolve-o ao chamador.
--
-- Mesmo padrão de claim atómico de bolt_sync_queue (20260805100000): FOR
-- UPDATE SKIP LOCKED + advisory lock, para dois polls sobrepostos do mesmo
-- agente (ou de dois agentes por engano) nunca reclamarem a mesma linha nem
-- ultrapassarem o limite pedido.
--
-- IDEMPOTENTE E ADITIVA. Pode correr as vezes que forem precisas.
-- ============================================================================


-- ─── 1. Chave do agente, por organização ─────────────────────────────────────
-- Reaproveita a MESMA linha de plataformas_configuracao (plataforma='faturacao',
-- config.provider='primavera') que a UI já usa — client_secret passa a guardar
-- a CHAVE DO AGENTE (gerada pelo WeGest, mostrada uma vez), não a password do
-- AS Connect. A password/username/enterprise do Primavera deixam de ter
-- qualquer razão para estar nesta base de dados.

CREATE OR REPLACE FUNCTION public.gerar_chave_agente_primavera()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'pva_' || encode(gen_random_bytes(32), 'hex');
$$;

COMMENT ON FUNCTION public.gerar_chave_agente_primavera() IS
  'Gera uma chave de agente Primavera (prefixo pva_) — mostrada uma vez na UI, '
  'guardada em plataformas_configuracao.client_secret. Não dá acesso a nada do '
  'Primavera por si só: só autentica o agente a fazer poll/devolver resultados.';


-- ─── 2. A fila ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.primavera_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  -- 'emit' (documento de venda), 'health' (só confirmar que o agente/AS
  -- Connect autenticam). Mais tipos (cliente_inserir, etc.) entram aqui
  -- quando ficarem confirmados contra a documentação do AS Connect.
  tipo          text NOT NULL CHECK (tipo IN ('emit', 'health')),
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'claimed', 'done', 'failed')),
  resultado     jsonb,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  completed_at  timestamptz
);

COMMENT ON TABLE public.primavera_jobs IS
  'Fila de pedidos ao AS Connect, executados por um agente local (fora desta '
  'base de dados). Uma linha = um documento a emitir ou um teste de ligação. '
  'Nunca contém credenciais do AS Connect — só o payload de negócio (cliente, '
  'itens, tipo de documento).';
COMMENT ON COLUMN public.primavera_jobs.payload IS
  'Para tipo=emit: {tipo (FT), cliente, itens[], observacoes?, referencia_externa?}. '
  'Mesma forma de EmitInput (faturacao-emitir/types.ts), sem credenciais.';
COMMENT ON COLUMN public.primavera_jobs.resultado IS
  'Para tipo=emit, bem sucedido: {doctype, docnum, serie, numero, raw}. '
  'Para tipo=health: {ok:true}.';

CREATE INDEX IF NOT EXISTS idx_primavera_jobs_org_status
  ON public.primavera_jobs (org_id, status, created_at);

-- Limpeza: jobs terminados há muito não precisam de ficar para sempre —
-- mas isso é housekeeping (cron futuro), não parte desta migração.

ALTER TABLE public.primavera_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'primavera_jobs' AND policyname = 'mt_primavera_jobs_select') THEN
    CREATE POLICY "mt_primavera_jobs_select" ON public.primavera_jobs
      FOR SELECT TO authenticated
      USING (org_id = get_current_org_id() AND is_current_user_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'primavera_jobs' AND policyname = 'Service role full access to primavera_jobs') THEN
    CREATE POLICY "Service role full access to primavera_jobs" ON public.primavera_jobs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END;
$$;


-- ─── 3. Claim atómico (chamado por primavera-agent-poll) ─────────────────────
-- Recebe a org já resolvida pela edge function (a partir da chave do agente)
-- — esta RPC não conhece chaves, só reclama para o org_id indicado.

CREATE OR REPLACE FUNCTION public.primavera_jobs_claim(p_org_id uuid, p_max integer)
RETURNS SETOF public.primavera_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('primavera_jobs_claim:' || p_org_id::text)) THEN
    RETURN; -- outro poll da mesma org está a reclamar; tenta no próximo tick
  END IF;

  -- Um job "claimed" há mais de 2 minutos sem resultado voltou a pending: o
  -- agente pode ter caído a meio, ou a resposta perdeu-se. A emissão em si
  -- só é considerada "talvez tenha acontecido" do lado do adapter (que trata
  -- timeout como ambíguo) — aqui só se liberta a linha para se tentar de novo.
  UPDATE public.primavera_jobs
     SET status = 'pending', claimed_at = NULL
   WHERE org_id = p_org_id
     AND status = 'claimed'
     AND claimed_at < now() - interval '2 minutes';

  RETURN QUERY
  UPDATE public.primavera_jobs q
     SET status = 'claimed', claimed_at = now()
    FROM (
      SELECT id FROM public.primavera_jobs
       WHERE org_id = p_org_id AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT GREATEST(p_max, 0)
       FOR UPDATE SKIP LOCKED
    ) reclamados
   WHERE q.id = reclamados.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.primavera_jobs_claim(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.primavera_jobs_claim(uuid, integer) TO service_role;


-- ============================================================================
-- VERIFICAÇÃO — correr depois de aplicar
-- ============================================================================
--
--   SELECT count(*) FROM information_schema.tables WHERE table_name='primavera_jobs';
--   SELECT has_function_privilege('authenticated','public.primavera_jobs_claim(uuid,integer)','EXECUTE'); -- false
--   SELECT policyname, cmd, roles FROM pg_policies WHERE tablename='primavera_jobs';
-- ============================================================================
