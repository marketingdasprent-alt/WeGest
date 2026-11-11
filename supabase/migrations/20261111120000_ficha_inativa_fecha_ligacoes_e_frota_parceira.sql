-- Causas dos acertos de 09–11/11/2026 (Abraão, Lucas e 14 contratos com a Premium):
--  1. Desativar uma ficha não fechava nada: cartão de combustível, condutor de
--     contrato e viatura continuavam a cair na ficha inativa (resumos negativos).
--  2. O login ficava na ficha antiga quando o motorista mudava de empresa.
--  3. O aluguer de contratos com uma frota parceira (o cliente paga e cobra ele
--     ao motorista) era descontado também ao condutor.

-- (3) Cliente que é frota parceira: o aluguer é da empresa, não do condutor.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS frota_parceira BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.clientes.frota_parceira IS
  'Frota parceira (ex.: Premium Ride): paga o aluguer e cobra-o ao motorista na sua empresa. Os condutores destes contratos não pagam aluguer nos resumos.';

-- Só o cliente Premium Ride das OUTRAS empresas: na própria Premium ele é o
-- cliente dos contratos internos, onde o motorista paga o aluguer.
UPDATE public.clientes c SET frota_parceira = true
 WHERE c.tipo_cliente = 'empresa' AND c.nome ILIKE 'premium ride%' AND NOT c.frota_parceira
   AND c.org_id <> ALL (SELECT o.id FROM public.organizacoes o WHERE o.nome ILIKE 'premium ride%');

-- (1) e (2) Ao desativar a ficha.
CREATE OR REPLACE FUNCTION public.ao_desativar_ficha_motorista()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativa public.motoristas_ativos%ROWTYPE;
BEGIN
  UPDATE public.cartao_atribuicoes
     SET ate = GREATEST(current_date, de)
   WHERE motorista_id = NEW.id AND ate IS NULL;

  UPDATE public.contrato_condutores
     SET data_fim = GREATEST(now(), data_inicio + interval '1 second'),
         motivo_fim = COALESCE(motivo_fim, 'Ficha do motorista desativada')
   WHERE motorista_id = NEW.id AND data_fim IS NULL;

  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = GREATEST(current_date, data_inicio)
   WHERE motorista_id = NEW.id AND status = 'ativo';

  -- O login segue a pessoa (mesmo NIF) para a ficha ativa noutra empresa.
  IF NEW.user_id IS NOT NULL AND NULLIF(btrim(NEW.nif), '') IS NOT NULL THEN
    SELECT * INTO v_ativa FROM public.motoristas_ativos m
     WHERE m.nif = NEW.nif AND m.id <> NEW.id AND m.org_id <> NEW.org_id
       AND m.status_ativo AND m.user_id IS NULL
     ORDER BY m.updated_at DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      UPDATE public.motoristas_ativos SET user_id = NEW.user_id WHERE id = v_ativa.id;
      INSERT INTO public.user_organizacoes (user_id, org_id, is_admin)
      VALUES (NEW.user_id, v_ativa.org_id, false)
      ON CONFLICT DO NOTHING;
      UPDATE public.user_org_ativa SET org_id = v_ativa.org_id WHERE user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ao_desativar_ficha_motorista() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ao_desativar_ficha_motorista ON public.motoristas_ativos;
CREATE TRIGGER trg_ao_desativar_ficha_motorista
  AFTER UPDATE OF status_ativo ON public.motoristas_ativos
  FOR EACH ROW
  WHEN (OLD.status_ativo IS DISTINCT FROM false AND NEW.status_ativo = false)
  EXECUTE FUNCTION public.ao_desativar_ficha_motorista();

NOTIFY pgrst, 'reload schema';
