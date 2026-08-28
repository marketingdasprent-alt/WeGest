-- ============================================================
-- Troca de viatura (mesmo grupo): folha de danos completa
-- ============================================================
-- Até agora, ao realizar um evento tipo='troca', a RPC só marcava
-- realizado_em — não gravava km/combustível/danos de nenhuma das duas
-- viaturas (a que sai do contrato e a que entra). A UI
-- (RealizarEntregaPage.tsx) só pedia dados da viatura NOVA, tratando a
-- troca como uma "entrega" simples — a recolha da viatura antiga nunca
-- era registada.
--
-- Fix: tabela dedicada para os dois blocos de dados físicos da troca
-- (não reaproveita contratos_renting.km_entrada/km_saida, que já servem
-- a entrega inicial/recolha final do contrato — sobrescrevê-los na troca
-- destruiria esse histórico). Danos continuam em viatura_danos, agora
-- discriminados por viatura_id correcta (a antiga OU a nova, conforme
-- o gestor documenta cada bloco).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.troca_viatura_registos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizacoes(id),
  evento_id uuid NOT NULL REFERENCES public.calendario_eventos(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,

  viatura_antiga_id uuid REFERENCES public.viaturas(id),
  km_antiga integer,
  combustivel_antiga text,

  viatura_nova_id uuid REFERENCES public.viaturas(id),
  km_nova integer,
  combustivel_nova text,

  registado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_troca_viatura_registos_evento
  ON public.troca_viatura_registos(evento_id);

ALTER TABLE public.troca_viatura_registos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver registos de troca da minha org" ON public.troca_viatura_registos;
CREATE POLICY "ver registos de troca da minha org" ON public.troca_viatura_registos
  FOR SELECT
  USING (org_id = public.get_current_org_id());

DROP POLICY IF EXISTS "criar registo de troca" ON public.troca_viatura_registos;
CREATE POLICY "criar registo de troca" ON public.troca_viatura_registos
  FOR INSERT
  WITH CHECK (org_id = public.get_current_org_id());

COMMENT ON TABLE public.troca_viatura_registos IS
  'Km/combustível das duas viaturas envolvidas numa troca (mesmo grupo) — '
  'a que sai do contrato e a que entra. Complementa viatura_danos (fotos/danos '
  'de cada uma, discriminadas por viatura_id) sem tocar em '
  'contratos_renting.km_entrada/km_saida (histórico da entrega/recolha do '
  'contrato inteiro).';

-- ────────────────────────────────────────────────────────────
-- RPC: realizar troca com dados das duas viaturas
-- ────────────────────────────────────────────────────────────
-- Substitui o branch 'troca' de realizar_token_realizacao — em vez de só
-- marcar realizado_em, recebe os dados físicos e grava-os antes de marcar.
CREATE OR REPLACE FUNCTION public.realizar_token_troca(
  p_token              uuid,
  p_viatura_antiga_id  uuid,
  p_km_antiga          integer,
  p_combustivel_antiga text,
  p_viatura_nova_id    uuid,
  p_km_nova            integer,
  p_combustivel_nova   text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token  realizacao_tokens%ROWTYPE;
  v_evento calendario_eventos%ROWTYPE;
  v_actor  uuid;
BEGIN
  SELECT * INTO v_token
    FROM public.realizacao_tokens
   WHERE id = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido.';
  END IF;
  IF v_token.expires_at < now() THEN
    RAISE EXCEPTION 'Token expirado.';
  END IF;
  IF v_token.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Token já foi usado.';
  END IF;
  IF v_token.tipo <> 'troca' THEN
    RAISE EXCEPTION 'Este token não é de troca.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;

  SELECT * INTO v_evento FROM public.calendario_eventos WHERE id = v_token.evento_id;
  IF v_evento.realizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Evento já realizado.';
  END IF;

  v_actor := COALESCE(auth.uid(), v_token.created_by);

  INSERT INTO public.troca_viatura_registos (
    org_id, evento_id, contrato_id,
    viatura_antiga_id, km_antiga, combustivel_antiga,
    viatura_nova_id, km_nova, combustivel_nova,
    registado_por
  ) VALUES (
    v_token.org_id, v_token.evento_id, v_token.contrato_id,
    p_viatura_antiga_id, p_km_antiga, p_combustivel_antiga,
    p_viatura_nova_id, p_km_nova, p_combustivel_nova,
    v_actor
  )
  ON CONFLICT (evento_id) DO UPDATE SET
    viatura_antiga_id  = EXCLUDED.viatura_antiga_id,
    km_antiga          = EXCLUDED.km_antiga,
    combustivel_antiga = EXCLUDED.combustivel_antiga,
    viatura_nova_id    = EXCLUDED.viatura_nova_id,
    km_nova            = EXCLUDED.km_nova,
    combustivel_nova   = EXCLUDED.combustivel_nova;

  -- Actualiza km_atual de ambas as viaturas.
  IF p_viatura_antiga_id IS NOT NULL AND p_km_antiga IS NOT NULL THEN
    UPDATE public.viaturas SET km_atual = p_km_antiga WHERE id = p_viatura_antiga_id;
  END IF;
  IF p_viatura_nova_id IS NOT NULL AND p_km_nova IS NOT NULL THEN
    UPDATE public.viaturas SET km_atual = p_km_nova WHERE id = p_viatura_nova_id;
  END IF;

  UPDATE public.calendario_eventos
     SET realizado_em     = now(),
         realizado_por_id = v_actor
   WHERE id = v_token.evento_id;

  UPDATE public.realizacao_tokens
     SET used_at = now()
   WHERE id = v_token.id;
END;
$$;

COMMENT ON FUNCTION public.realizar_token_troca(uuid, uuid, integer, text, uuid, integer, text) IS
  'Confirma uma troca de viatura (mesmo grupo): grava km/combustível de ambas '
  'as viaturas em troca_viatura_registos, actualiza viaturas.km_atual das duas, '
  'e marca o evento como realizado. Não toca estado_operacional (o contrato '
  'mantém-se em_curso).';
