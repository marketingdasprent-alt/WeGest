-- O líquido positivo de uma semana nasce pago.
--
-- A semana paga-se sempre que o resumo é gerado, mas o movimento 'resumos' ficava
-- pendente até alguém marcar o visto "Pago" no Relatório de Pagamento. Sem o visto
-- o pendente acumulava e o motorista via 2 mil, 4 mil "a receber" no portal.
--
-- Em vez de uma segunda via, grava-se o mesmo visto que o diálogo grava: o
-- gatilho sincronizar_pagamento_resumo liquida o movimento e o Relatório fica
-- coerente com a ficha. Só líquido positivo: dívida do motorista (negativo)
-- continua pendente até ser cobrada. Uma vez pago o movimento não se reescreve
-- (sincronizar_movimento_resumo), por isso corrigir uma semana é um acto deliberado.
-- O nome do gatilho tem de ficar depois de motorista_liquido_semanal_gera_movimento
-- (os AFTER correm por ordem alfabética), que é quem cria o movimento.

CREATE OR REPLACE FUNCTION public.marcar_resumo_pago_ao_gravar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Também no UPDATE que tira o líquido de zero ou de negativo: uma semana
  -- gravada primeiro a 0 (dados em falta) e corrigida depois não fica por pagar.
  IF NEW.liquido > 0 AND (TG_OP = 'INSERT' OR OLD.liquido <= 0) THEN
    INSERT INTO public.relatorio_pagamento_pagos (org_id, motorista_id, semana_inicio, marcado_por)
    VALUES (NEW.org_id, NEW.motorista_id, NEW.semana_inicio, NEW.gravado_por)
    ON CONFLICT (org_id, motorista_id, semana_inicio) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_resumo_pago_ao_gravar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_resumo_pago_ao_gravar() TO authenticated, service_role;

DROP TRIGGER IF EXISTS motorista_liquido_semanal_paga_sozinho ON public.motorista_liquido_semanal;
CREATE TRIGGER motorista_liquido_semanal_paga_sozinho
  AFTER INSERT OR UPDATE OF liquido ON public.motorista_liquido_semanal
  FOR EACH ROW
  EXECUTE FUNCTION public.marcar_resumo_pago_ao_gravar();

COMMENT ON FUNCTION public.marcar_resumo_pago_ao_gravar() IS
  'Ao gravar pela primeira vez o líquido semanal (positivo), marca a semana como paga em relatorio_pagamento_pagos; sincronizar_pagamento_resumo liquida o movimento.';

NOTIFY pgrst, 'reload schema';
