-- ============================================================
-- Generaliza pedidos_troca_kms → pedidos_alteracao_contrato
-- ============================================================
-- Além de kms, o gestor pode agora pedir excepção de franquia e de
-- tarifa diária — mesmo fluxo (campo trava no contrato, pedido ao
-- Supervisor Gestor TVDE, notificação, aceitar/recusar aplica direto).
--
-- kms_incluidos_atual/pedido e km_adicional_valor_atual/pedido dão lugar
-- a valor_atual/valor_pedido (genéricos) + km_adicional_valor_atual/pedido
-- (só usados quando tipo='kms', mantidos com esse nome por já existirem
-- dados). Campo `tipo` novo discrimina 'kms' | 'franquia' | 'tarifa'.
-- ============================================================

ALTER TABLE public.pedidos_troca_kms RENAME TO pedidos_alteracao_contrato;

ALTER TABLE public.pedidos_alteracao_contrato
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'kms'
    CHECK (tipo IN ('kms', 'franquia', 'tarifa'));

ALTER TABLE public.pedidos_alteracao_contrato
  RENAME COLUMN kms_incluidos_atual TO valor_atual;
ALTER TABLE public.pedidos_alteracao_contrato
  RENAME COLUMN kms_incluidos_pedido TO valor_pedido;

ALTER TABLE public.pedidos_alteracao_contrato ALTER COLUMN tipo DROP DEFAULT;

COMMENT ON TABLE public.pedidos_alteracao_contrato IS
  'Pedido de excepção de kms/franquia/tarifa para um contrato específico, '
  'fora do valor sugerido pela tarifa do grupo. Só produz efeito no contrato '
  'depois de aceite pelo Supervisor Gestor TVDE. km_adicional_valor_atual/'
  'pedido só usados quando tipo=''kms''.';

-- Índices/constraints antigos referenciam o nome antigo da tabela — o
-- Postgres já os renomeia junto com o RENAME TABLE; só o índice único
-- de "pendente por contrato" precisa cobrir agora tipo+contrato (pode
-- haver pedidos pendentes de kms E de franquia ao mesmo tempo).
DROP INDEX IF EXISTS uq_pedidos_troca_kms_contrato_pendente;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_alteracao_contrato_pendente
  ON public.pedidos_alteracao_contrato(contrato_id, tipo)
  WHERE estado = 'pendente';

-- Notificação: mesmo tipo 'pedido_troca_kms' (o nome do enum de
-- notificações fica como está — renomear obrigaria a alterar RLS que já
-- funciona; o texto da notificação já discrimina o tipo).
CREATE OR REPLACE FUNCTION public.notificar_pedido_troca_kms()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo integer;
  v_titulo text;
  v_mensagem text;
BEGIN
  SELECT codigo INTO v_codigo FROM public.contratos_renting WHERE id = NEW.contrato_id;

  v_titulo := CASE NEW.tipo
    WHEN 'franquia' THEN format('Pedido de alteração de franquia — contrato #%s', COALESCE(v_codigo::text, '?'))
    WHEN 'tarifa'   THEN format('Pedido de alteração de tarifa — contrato #%s', COALESCE(v_codigo::text, '?'))
    ELSE format('Pedido de alteração de kms — contrato #%s', COALESCE(v_codigo::text, '?'))
  END;

  v_mensagem := CASE NEW.tipo
    WHEN 'franquia' THEN format('Franquia: %s € → %s €. Motivo: %s', NEW.valor_atual, NEW.valor_pedido, NEW.motivo)
    WHEN 'tarifa'   THEN format('Tarifa diária: %s € → %s €. Motivo: %s', NEW.valor_atual, NEW.valor_pedido, NEW.motivo)
    ELSE format('Kms incluídos: %s → %s. Motivo: %s', NEW.valor_atual, NEW.valor_pedido, NEW.motivo)
  END;

  INSERT INTO public.notificacoes (org_id, tipo, titulo, mensagem, severidade)
  VALUES (NEW.org_id, 'pedido_troca_kms', v_titulo, v_mensagem, 'normal');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_pedido_troca_kms ON public.pedidos_alteracao_contrato;
CREATE TRIGGER trg_notificar_pedido_troca_kms
AFTER INSERT ON public.pedidos_alteracao_contrato
FOR EACH ROW EXECUTE FUNCTION public.notificar_pedido_troca_kms();

-- ────────────────────────────────────────────────────────────
-- RPC: responder ao pedido — aplica o campo certo conforme o tipo
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
  v_pedido public.pedidos_alteracao_contrato%ROWTYPE;
BEGIN
  IF NOT (
    public.is_current_user_admin()
    OR public.current_user_cargo() = 'Supervisor Gestor TVDE'
  ) THEN
    RAISE EXCEPTION 'Só o Supervisor Gestor TVDE pode responder a este pedido.';
  END IF;

  SELECT * INTO v_pedido
    FROM public.pedidos_alteracao_contrato
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

  UPDATE public.pedidos_alteracao_contrato
     SET estado           = CASE WHEN p_aceite THEN 'aceite' ELSE 'recusado' END,
         resposta_motivo   = p_resposta_motivo,
         respondido_por    = auth.uid(),
         respondido_em     = now()
   WHERE id = p_pedido_id;

  IF p_aceite THEN
    IF v_pedido.tipo = 'kms' THEN
      UPDATE public.contratos_renting
         SET kms_incluidos      = v_pedido.valor_pedido,
             km_adicional_valor = COALESCE(v_pedido.km_adicional_valor_pedido, km_adicional_valor),
             updated_by         = auth.uid()
       WHERE id = v_pedido.contrato_id;
    ELSIF v_pedido.tipo = 'franquia' THEN
      UPDATE public.contratos_renting
         SET franquia_valor = v_pedido.valor_pedido,
             updated_by     = auth.uid()
       WHERE id = v_pedido.contrato_id;
    ELSIF v_pedido.tipo = 'tarifa' THEN
      UPDATE public.contratos_renting
         SET tarifa_diaria = v_pedido.valor_pedido,
             updated_by    = auth.uid()
       WHERE id = v_pedido.contrato_id;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.responder_pedido_troca_kms(uuid, boolean, text) IS
  'Supervisor Gestor TVDE aceita ou recusa um pedido de excepção de kms/'
  'franquia/tarifa. Se aceite, aplica o valor pedido directamente no campo '
  'correspondente do contrato, conforme pedidos_alteracao_contrato.tipo.';
