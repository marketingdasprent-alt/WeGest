-- Abastecimento BP rejeitado pelo posto/Fleet Manager não aconteceu: o motorista não abasteceu
-- nada. Entrava em bp_transacoes como os aceites e era somado ao combustível do resumo (caso
-- Adair Pinheiro, 90,02 € de 28/09 com Status "Rejeitada"). O descarte é à entrada, por trigger,
-- para valer em todas as vias de import (CSV, API, assistente).

CREATE OR REPLACE FUNCTION public.fn_bp_descarta_rejeitada()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF COALESCE(NEW.raw_data ->> 'Status', NEW.raw_data ->> 'status', '') ILIKE 'rejeit%' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bp_descarta_rejeitada() FROM PUBLIC, anon;

-- "a_" para correr antes de resolver_motorista: não vale a pena resolver o titular de uma linha descartada.
DROP TRIGGER IF EXISTS a_bp_descarta_rejeitada ON public.bp_transacoes;
CREATE TRIGGER a_bp_descarta_rejeitada
  BEFORE INSERT OR UPDATE ON public.bp_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_bp_descarta_rejeitada();

-- As que já entraram (13 em 06/10/2026, 2 com motorista). Podem voltar a ser importadas do portal
-- da BP, mas o trigger descarta-as de novo.
DELETE FROM public.bp_transacoes
 WHERE COALESCE(raw_data ->> 'Status', raw_data ->> 'status', '') ILIKE 'rejeit%';

NOTIFY pgrst, 'reload schema';
