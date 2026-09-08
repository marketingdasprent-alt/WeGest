-- O líquido do resumo semanal passa a ser um movimento na ficha financeira do
-- motorista, criado pela própria base de dados. Fica preso à linha do líquido
-- (liquido_semanal_id) em vez de a uma descrição adivinhada: reabrir o resumo
-- actualiza o mesmo movimento, nunca cria um segundo.
--
-- Fica na BD e não no ecrã de propósito: assim qualquer futuro produtor do
-- líquido (o fecho, um cron, um preenchimento de histórico) gera o movimento
-- por arrasto, sem ninguém se lembrar de o chamar.

ALTER TABLE public.motorista_financeiro
  ADD COLUMN liquido_semanal_id uuid
    REFERENCES public.motorista_liquido_semanal(id) ON DELETE CASCADE,
  ADD COLUMN divida_id uuid;

-- Um movimento por semana. É esta unicidade que torna a gravação idempotente.
CREATE UNIQUE INDEX motorista_financeiro_liquido_semanal_unico
  ON public.motorista_financeiro (liquido_semanal_id)
  WHERE liquido_semanal_id IS NOT NULL;

CREATE INDEX motorista_financeiro_divida_idx
  ON public.motorista_financeiro (divida_id)
  WHERE divida_id IS NOT NULL;

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
    INSERT INTO public.motorista_financeiro
      (motorista_id, tipo, categoria, descricao, valor,
       data_movimento, status, org_id, criado_por, liquido_semanal_id)
    VALUES
      (NEW.motorista_id,
       CASE WHEN NEW.liquido > 0 THEN 'credito' ELSE 'debito' END,
       'resumos',
       v_descricao,
       abs(NEW.liquido),
       NEW.semana_fim,
       'pendente',
       NEW.org_id,
       NEW.gravado_por,
       NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER motorista_liquido_semanal_gera_movimento
  AFTER INSERT OR UPDATE OF liquido, semana_inicio, semana_fim
  ON public.motorista_liquido_semanal
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_movimento_resumo();
