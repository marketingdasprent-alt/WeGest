-- ============================================================
-- Fechar um contrato liberta mesmo a viatura
-- ============================================================
-- Sintoma reportado na reunião: "a aba de fechar contrato fecha mas o carro
-- não fica disponível". Confirmado em produção: 39 contratos com
-- estado_operacional='cancelado' (badge "Fechado"), substituido_em IS NULL,
-- cuja reserva de origem continuava em 'confirmada'.
--
-- CAUSA
-- A cascata mapeava a transição agendado→cancelado para reserva 'confirmada',
-- com a intenção de "cancelou antes da entrega, o cliente mantém reserva
-- válida". Só que 'confirmada' é um dos estados que ocupam a viatura
-- (src/hooks/useViaturasOcupacao.ts) — o contrato fechava e a reserva ficava
-- a segurar o carro para sempre, sem nada na UI a explicar porquê.
--
-- PORQUE 'cancelada' É O ESTADO CERTO
-- O único caminho que produz esta transição é o diálogo "Fechar contrato…",
-- que pede estação, data, motivo, km, combustível, fotos e devolução da DUA.
-- Ninguém preenche isso para MANTER a reserva viva. Quem quer voltar atrás e
-- ficar só com a reserva tem acção própria — "Reverter para reserva"
-- (useReverterParaReserva), que remove o contrato e devolve a reserva intacta.
--
-- Só muda esta transição. devolvido→'concluida' e em_curso→cancelado→'cancelada'
-- mantêm-se, tal como a regra "história é inerte" (substituido_em) e o DELETE
-- de eventos só em 'cancelado'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo_estado_reserva text;
BEGIN
  -- Só age quando estado_operacional muda de facto.
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  -- Versões substituídas são história: fechar o antigo numa renovação não
  -- pode cascatear para a reserva (partilhada com o sucessor) nem apagar
  -- eventos já realizados.
  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sem reserva associada, nada a cascatear (não devia acontecer mas
  -- defendemo-nos contra contratos legacy).
  IF NEW.reserva_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapear nova transição → estado da reserva
  IF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'agendado' THEN
    -- Fechado antes da entrega: o aluguer não chegou a acontecer e a viatura
    -- tem de voltar à frota. Antes ficava 'confirmada' e continuava a ocupar
    -- o carro — ver cabeçalho.
    v_novo_estado_reserva := 'cancelada';
  ELSIF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'em_curso' THEN
    -- Cancelado durante uso: terminar tudo.
    v_novo_estado_reserva := 'cancelada';
  ELSIF NEW.estado_operacional = 'devolvido' THEN
    -- Ciclo terminado naturalmente.
    v_novo_estado_reserva := 'concluida';
  ELSE
    -- Outras transições (ex. agendado→em_curso) não exigem cascata
    -- sobre a reserva — ela já está 'em_curso' desde o INSERT.
    RETURN NEW;
  END IF;

  -- Aplicar transição na reserva
  UPDATE public.reservas
     SET estado = v_novo_estado_reserva::reserva_estado_enum
   WHERE id = NEW.reserva_id;

  -- Apagar eventos derivados SÓ quando o contrato é cancelado (compromisso
  -- que não se concretizou). Em 'devolvido' os eventos já foram realizados e
  -- mantêm-se como histórico — é o que alimenta o Relatório de Eventos.
  IF NEW.estado_operacional = 'cancelado' THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.contrato_renting_cascata_estado() IS
  'Cascata contrato→reserva. cancelado (de agendado OU em_curso) → reserva '
  'cancelada e viatura libertada; devolvido → reserva concluida com eventos '
  'preservados. Versões substituídas (substituido_em) não cascateiam.';
