-- O "Pago" do Relatório de Pagamento passa a liquidar o movimento do resumo na
-- ficha financeira do motorista.
--
-- Até aqui `relatorio_pagamento_pagos` era uma tabela morta: só pintava a linha
-- de verde no diálogo e mais nada a lia. Um motorista podia estar todo verde no
-- relatório e continuar com a semana como dívida pendente no perfil e no portal
-- dele — dois estados a divergir por construção.
--
-- Fica na BD e não no ecrã pelo mesmo motivo de sincronizar_movimento_resumo():
-- quem quer que venha a marcar pagamentos (o diálogo, um import de extracto
-- bancário, uma correcção à mão) liquida o movimento por arrasto, sem ninguém
-- se lembrar de o chamar.

-- ─── Marcar/desmarcar no relatório → liquidar/reabrir o movimento ──────────
CREATE OR REPLACE FUNCTION public.sincronizar_pagamento_resumo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Só mexe no que está PENDENTE: um movimento 'cancelado' foi anulado de
    -- propósito e não ressuscita por causa de um visto no relatório.
    UPDATE public.motorista_financeiro f
       SET status         = 'pago',
           data_pagamento = COALESCE(f.data_pagamento, NEW.marcado_em::date)
      FROM public.motorista_liquido_semanal l
     WHERE f.liquido_semanal_id = l.id
       AND l.motorista_id  = NEW.motorista_id
       AND l.semana_inicio = NEW.semana_inicio
       AND l.org_id        = NEW.org_id
       AND f.status        = 'pendente';
    RETURN NEW;
  END IF;

  -- DELETE: desmarcar devolve o movimento a pendente. Só o que está 'pago' —
  -- 'cancelado' continua a ser história fechada.
  UPDATE public.motorista_financeiro f
     SET status         = 'pendente',
         data_pagamento = NULL
    FROM public.motorista_liquido_semanal l
   WHERE f.liquido_semanal_id = l.id
     AND l.motorista_id  = OLD.motorista_id
     AND l.semana_inicio = OLD.semana_inicio
     AND l.org_id        = OLD.org_id
     AND f.status        = 'pago';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS relatorio_pagamento_pagos_liquida_movimento
  ON public.relatorio_pagamento_pagos;

CREATE TRIGGER relatorio_pagamento_pagos_liquida_movimento
  AFTER INSERT OR DELETE
  ON public.relatorio_pagamento_pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_pagamento_resumo();

COMMENT ON FUNCTION public.sincronizar_pagamento_resumo() IS
  'Liga o "Pago" do Relatório de Pagamento (relatorio_pagamento_pagos) ao movimento de categoria ''resumos'' em motorista_financeiro: marcar liquida (status pago + data_pagamento), desmarcar devolve a pendente. Nunca toca em movimentos cancelados.';

-- ─── A outra ponta: um movimento NOVO numa semana já marcada nasce pago ────
-- sincronizar_movimento_resumo() recusa-se a reescrever um movimento que não
-- esteja pendente, por isso marcar como pago já protege a semana de ser
-- reescrita ao reabrir os Resumos. Falta o caso em que o movimento não existe
-- no momento da marcação e é criado depois (líquido que passou por zero, ou um
-- preenchimento de histórico): nascia 'pendente' e contradizia o relatório.
CREATE OR REPLACE FUNCTION public.sincronizar_movimento_resumo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_descricao   text;
  v_status      text;
  v_tem_movimento boolean;
  v_ja_pago     boolean;
BEGIN
  v_descricao := 'Resumo '
    || to_char(NEW.semana_inicio, 'DD/MM/YYYY') || ' – '
    || to_char(NEW.semana_fim,    'DD/MM/YYYY');

  SELECT status INTO v_status
    FROM public.motorista_financeiro
   WHERE liquido_semanal_id = NEW.id;
  v_tem_movimento := FOUND;

  -- Movimento já liquidado (pago) ou anulado é história fechada: não se
  -- reescreve. Corrigir o líquido de uma semana já paga tem de ser um acto
  -- deliberado de quem gere, não um efeito de reabrir um ecrã.
  IF v_tem_movimento AND v_status <> 'pendente' THEN
    RETURN NEW;
  END IF;

  -- Líquido zero não é nada a cobrar nem a pagar: não deixa movimento.
  IF round(NEW.liquido, 2) = 0 THEN
    IF v_tem_movimento THEN
      DELETE FROM public.motorista_financeiro WHERE liquido_semanal_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_tem_movimento THEN
    UPDATE public.motorista_financeiro
       SET tipo           = CASE WHEN NEW.liquido > 0 THEN 'credito' ELSE 'debito' END,
           categoria      = 'resumos',
           descricao      = v_descricao,
           valor          = abs(NEW.liquido),
           data_movimento = NEW.semana_fim
     WHERE liquido_semanal_id = NEW.id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.relatorio_pagamento_pagos p
       WHERE p.motorista_id  = NEW.motorista_id
         AND p.semana_inicio = NEW.semana_inicio
         AND p.org_id        = NEW.org_id
    ) INTO v_ja_pago;

    INSERT INTO public.motorista_financeiro
      (motorista_id, tipo, categoria, descricao, valor,
       data_movimento, status, data_pagamento, org_id, criado_por, liquido_semanal_id)
    VALUES
      (NEW.motorista_id,
       CASE WHEN NEW.liquido > 0 THEN 'credito' ELSE 'debito' END,
       'resumos',
       v_descricao,
       abs(NEW.liquido),
       NEW.semana_fim,
       CASE WHEN v_ja_pago THEN 'pago' ELSE 'pendente' END,
       CASE WHEN v_ja_pago THEN NEW.semana_fim END,
       NEW.org_id,
       NEW.gravado_por,
       NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Alinhar o que já está marcado ─────────────────────────────────────────
-- Semanas marcadas como pagas no relatório antes desta migração continuam com
-- o movimento pendente. Liquida-as com a data em que foram marcadas.
UPDATE public.motorista_financeiro f
   SET status         = 'pago',
       data_pagamento = COALESCE(f.data_pagamento, p.marcado_em::date)
  FROM public.motorista_liquido_semanal l
  JOIN public.relatorio_pagamento_pagos p
    ON p.motorista_id  = l.motorista_id
   AND p.semana_inicio = l.semana_inicio
   AND p.org_id        = l.org_id
 WHERE f.liquido_semanal_id = l.id
   AND f.status = 'pendente';
