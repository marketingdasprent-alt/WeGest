-- Um dano imputado ao motorista passa a gerar o débito na conta corrente dele.
--
-- O portal do motorista já mostrava o estado de pagamento de cada dano, lido
-- de `motorista_financeiro.dano_id` — mas essa coluna nunca foi preenchida por
-- ninguém: 0 em 1305 movimentos. Resultado, TODOS os danos apareciam como "sem
-- débito", sempre. A coluna existia, o ecrã lia-a, e nada a escrevia.
--
-- Porquê `valor_cobrado` e não `valor`:
--   `valor`         = quanto custa reparar o dano (informação da frota)
--   `valor_cobrado` = quanto disso se imputa ao motorista (decisão de quem gere)
-- São coisas diferentes e a tabela já as separava desde sempre — nenhuma das
-- duas tinha sido usada (547 danos, ambas a zero). Fazer o débito nascer de
-- `valor` transformaria cada registo de custo numa cobrança automática, o que
-- ninguém pediu e seria impossível de desfazer sem apagar o custo.
--
-- Como é `valor_cobrado` a mandar, e hoje está a zero em todos os 547 danos,
-- esta migração não cria um único movimento retroactivo. Só age daqui para a
-- frente, quando alguém escrever lá um valor.
--
-- Categoria `dano`: cai no catch-all de débito do classificador
-- (movimentosMotorista.ts) e por isso CONTA no líquido, ao contrário de
-- `reparacao`, que é ignorada por o custo já vir de viatura_reparacoes.

CREATE OR REPLACE FUNCTION public.sincronizar_debito_dano()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_tem    boolean;
  v_valor  numeric;
BEGIN
  v_valor := COALESCE(NEW.valor_cobrado, 0);

  SELECT status INTO v_status
    FROM public.motorista_financeiro
   WHERE dano_id = NEW.id;
  v_tem := FOUND;

  -- Movimento já pago ou anulado é história fechada, tal como no resumo
  -- semanal: mudar o valor de um dano já cobrado tem de ser um acto
  -- deliberado de quem gere, não um efeito de editar a ficha.
  IF v_tem AND v_status IS DISTINCT FROM 'pendente' THEN
    RETURN NEW;
  END IF;

  -- Sem valor a cobrar, ou sem motorista a quem cobrar, não há débito.
  -- Passar de "cobro 200" para "não cobro" apaga o movimento pendente — é a
  -- forma de corrigir um lançamento errado sem ter de ir à conta corrente.
  IF v_valor <= 0 OR NEW.motorista_id IS NULL THEN
    IF v_tem THEN
      DELETE FROM public.motorista_financeiro WHERE dano_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_tem THEN
    UPDATE public.motorista_financeiro
       SET valor        = v_valor,
           motorista_id = NEW.motorista_id,
           descricao    = 'Dano: ' || COALESCE(NULLIF(btrim(NEW.descricao), ''), 'sem descrição'),
           data_movimento = COALESCE(NEW.data_ocorrencia, NEW.data_registo, CURRENT_DATE)
     WHERE dano_id = NEW.id;
  ELSE
    INSERT INTO public.motorista_financeiro
      (motorista_id, tipo, categoria, descricao, valor,
       data_movimento, status, org_id, criado_por, dano_id)
    VALUES
      (NEW.motorista_id,
       'debito',
       'dano',
       'Dano: ' || COALESCE(NULLIF(btrim(NEW.descricao), ''), 'sem descrição'),
       v_valor,
       COALESCE(NEW.data_ocorrencia, NEW.data_registo, CURRENT_DATE),
       'pendente',
       NEW.org_id,
       NEW.registado_por,
       NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS viatura_danos_gera_debito ON public.viatura_danos;
CREATE TRIGGER viatura_danos_gera_debito
  AFTER INSERT OR UPDATE OF valor_cobrado, motorista_id, descricao
  ON public.viatura_danos
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_debito_dano();

COMMENT ON FUNCTION public.sincronizar_debito_dano() IS
  'Espelha viatura_danos.valor_cobrado num debito de categoria ''dano'' em motorista_financeiro, preso ao dano por dano_id. valor_cobrado a zero apaga o movimento pendente; movimento ja pago ou anulado nao se reescreve. E o que faz o estado de pagamento aparecer no portal do motorista.';

-- Índice único: um movimento por dano, e é ele que torna a gravação
-- idempotente (o UPDATE pode disparar várias vezes na mesma transação).
CREATE UNIQUE INDEX IF NOT EXISTS motorista_financeiro_dano_unico
  ON public.motorista_financeiro (dano_id)
  WHERE dano_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
