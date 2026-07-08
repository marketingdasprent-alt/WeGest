-- ============================================================
-- Pedidos de troca de kms incluídos por contrato
-- ============================================================
-- kms_incluidos/km_adicional_valor do contrato vêm sempre da tarifa
-- do grupo da viatura (sugestão automática). Quando o km real do
-- veículo não bate com a tarifa do grupo, o gestor pode pedir uma
-- excepção pontual para AQUELE contrato — só entra em vigor depois
-- de aprovada pelo Supervisor Gestor TVDE.
--
-- Reaproveita o padrão de notificacoes já usado para
-- motorista_pendente/escalonamento (20260602000003) e lista de espera
-- de viatura (20260629000004): popup real-time + RPC SECURITY DEFINER
-- dedicada para responder.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pedidos_troca_kms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizacoes(id),
  contrato_id uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  kms_incluidos_atual numeric NOT NULL,
  kms_incluidos_pedido numeric NOT NULL,
  km_adicional_valor_atual numeric,
  km_adicional_valor_pedido numeric,
  motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aceite', 'recusado')),
  resposta_motivo text,
  respondido_por uuid REFERENCES auth.users(id),
  respondido_em timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_troca_kms_contrato ON public.pedidos_troca_kms(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_troca_kms_pendente
  ON public.pedidos_troca_kms(org_id)
  WHERE estado = 'pendente';

-- Só um pedido pendente por contrato de cada vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_troca_kms_contrato_pendente
  ON public.pedidos_troca_kms(contrato_id)
  WHERE estado = 'pendente';

ALTER TABLE public.pedidos_troca_kms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver pedidos de troca de kms da minha org" ON public.pedidos_troca_kms;
CREATE POLICY "ver pedidos de troca de kms da minha org" ON public.pedidos_troca_kms
  FOR SELECT
  USING (org_id = public.get_current_org_id());

DROP POLICY IF EXISTS "criar pedido de troca de kms" ON public.pedidos_troca_kms;
CREATE POLICY "criar pedido de troca de kms" ON public.pedidos_troca_kms
  FOR INSERT
  WITH CHECK (org_id = public.get_current_org_id() AND created_by = auth.uid());

COMMENT ON TABLE public.pedidos_troca_kms IS
  'Pedido de excepção de kms_incluidos/km_adicional_valor para um contrato '
  'específico, fora do valor sugerido pela tarifa do grupo. Só produz efeito '
  'no contrato depois de aceite pelo Supervisor Gestor TVDE.';

-- ────────────────────────────────────────────────────────────
-- Notificação ao Supervisor Gestor TVDE quando um pedido é criado
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notificar_pedido_troca_kms()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo integer;
BEGIN
  SELECT codigo INTO v_codigo FROM public.contratos_renting WHERE id = NEW.contrato_id;

  INSERT INTO public.notificacoes (org_id, tipo, titulo, mensagem, severidade)
  VALUES (
    NEW.org_id,
    'pedido_troca_kms',
    format('Pedido de alteração de kms — contrato #%s', COALESCE(v_codigo::text, '?')),
    format(
      'Kms incluídos: %s → %s. Motivo: %s',
      NEW.kms_incluidos_atual, NEW.kms_incluidos_pedido, NEW.motivo
    ),
    'normal'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_pedido_troca_kms ON public.pedidos_troca_kms;
CREATE TRIGGER trg_notificar_pedido_troca_kms
AFTER INSERT ON public.pedidos_troca_kms
FOR EACH ROW EXECUTE FUNCTION public.notificar_pedido_troca_kms();

-- Nova categoria de notificação — visível só ao Supervisor Gestor TVDE
-- (e Administrador, que já vê tudo por is_current_user_admin()).
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IN ('motorista_pendente', 'escalonamento', 'viatura_disponivel', 'pedido_troca_kms'));

DROP POLICY IF EXISTS "ver notificacoes do meu cargo" ON public.notificacoes;
CREATE POLICY "ver notificacoes do meu cargo" ON public.notificacoes
  FOR SELECT
  USING (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND (
      (
        tipo = 'motorista_pendente'
        AND (
          is_current_user_admin()
          OR current_user_cargo() IN ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
        )
      )
      OR (
        tipo IN ('escalonamento', 'pedido_troca_kms')
        AND (is_current_user_admin() OR current_user_cargo() = 'Supervisor Gestor TVDE')
      )
      OR (
        tipo = 'viatura_disponivel'
        AND destinatario_id = auth.uid()
      )
    )
  );

-- ────────────────────────────────────────────────────────────
-- RPC: responder ao pedido (aceitar/recusar)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.responder_pedido_troca_kms(
  p_pedido_id uuid,
  p_aceite boolean,
  p_resposta_motivo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido public.pedidos_troca_kms%ROWTYPE;
BEGIN
  IF NOT (
    public.is_current_user_admin()
    OR public.current_user_cargo() = 'Supervisor Gestor TVDE'
  ) THEN
    RAISE EXCEPTION 'Só o Supervisor Gestor TVDE pode responder a este pedido.';
  END IF;

  SELECT * INTO v_pedido
    FROM public.pedidos_troca_kms
   WHERE id = p_pedido_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_pedido.org_id <> public.get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este pedido.';
  END IF;

  IF v_pedido.estado <> 'pendente' THEN
    RAISE EXCEPTION 'Este pedido já foi respondido.';
  END IF;

  UPDATE public.pedidos_troca_kms
     SET estado           = CASE WHEN p_aceite THEN 'aceite' ELSE 'recusado' END,
         resposta_motivo   = p_resposta_motivo,
         respondido_por    = auth.uid(),
         respondido_em     = now()
   WHERE id = p_pedido_id;

  IF p_aceite THEN
    UPDATE public.contratos_renting
       SET kms_incluidos      = v_pedido.kms_incluidos_pedido,
           km_adicional_valor = COALESCE(v_pedido.km_adicional_valor_pedido, km_adicional_valor),
           updated_by         = auth.uid()
     WHERE id = v_pedido.contrato_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.responder_pedido_troca_kms(uuid, boolean, text) IS
  'Supervisor Gestor TVDE aceita ou recusa um pedido de excepção de kms. '
  'Se aceite, aplica kms_incluidos/km_adicional_valor pedidos directamente '
  'no contrato.';
