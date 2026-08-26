-- ============================================================
-- Um motorista, uma viatura de cada vez
-- ============================================================
-- Ninguém conduz dois carros ao mesmo tempo, e um carro não anda com duas
-- pessoas ao mesmo tempo. A motorista_viaturas deixava as duas coisas
-- acontecer: 91 motoristas com períodos sobrepostos, 24 linhas com fim antes
-- do início.
--
-- O efeito prático foi este, no Adair Pinheiro: quatro viaturas todas a
-- "começar" em 2025-11-01, e o resumo — que faz `order by data_inicio desc
-- limit 1` — a escolher uma à sorte. Mostrou a BV-87-QO numa semana em que ele
-- andou na BT-21-UN e depois na BS-59-ZA. Com os períodos certos, o cálculo
-- reparte os dias por cada viatura, que é o que o fecho já sabe fazer.
--
-- A opção aqui NÃO é recusar a escrita. Recusar partiria fluxos que estão a
-- funcionar (tickets, check-in, associação manual) e a pessoa do outro lado
-- só via um erro. Em vez disso, uma atribuição nova FECHA a anterior: é o que
-- acontece na vida real quando se entrega um carro e se recebe outro.
--
-- Convenção mantida, a mesma que os dados já usavam: o período anterior acaba
-- no dia da troca, e o novo começa nesse mesmo dia.
--
-- Não repara o passado — só impede que volte a acontecer.
-- ============================================================

-- 1) Um fim anterior ao início é lixo, não um período curto. Fica em aberto,
--    para alguém o fechar, em vez de virar um intervalo que nenhuma consulta
--    por datas consegue ler.
CREATE OR REPLACE FUNCTION public.fn_motorista_viaturas_normaliza()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.data_inicio IS NULL THEN
    NEW.data_inicio := CURRENT_DATE;
  END IF;
  IF NEW.data_fim IS NOT NULL AND NEW.data_fim < NEW.data_inicio THEN
    NEW.data_fim := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS motorista_viaturas_normaliza ON public.motorista_viaturas;
CREATE TRIGGER motorista_viaturas_normaliza
  BEFORE INSERT OR UPDATE ON public.motorista_viaturas
  FOR EACH ROW EXECUTE FUNCTION public.fn_motorista_viaturas_normaliza();

-- 2) Uma atribuição nova fecha o que estava aberto e a cobria.
CREATE OR REPLACE FUNCTION public.fn_motorista_viaturas_fecha_anteriores()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- O motorista larga o que tinha antes.
  UPDATE public.motorista_viaturas
     SET data_fim = NEW.data_inicio
   WHERE motorista_id = NEW.motorista_id
     AND id <> NEW.id
     AND viatura_id IS DISTINCT FROM NEW.viatura_id
     AND data_inicio <= NEW.data_inicio
     AND (data_fim IS NULL OR data_fim > NEW.data_inicio);

  -- E a viatura larga quem a tinha antes.
  UPDATE public.motorista_viaturas
     SET data_fim = NEW.data_inicio
   WHERE viatura_id = NEW.viatura_id
     AND id <> NEW.id
     AND motorista_id IS DISTINCT FROM NEW.motorista_id
     AND data_inicio <= NEW.data_inicio
     AND (data_fim IS NULL OR data_fim > NEW.data_inicio);

  RETURN NULL;
END $$;

-- AFTER INSERT apenas: os UPDATEs que faz não voltam a disparar isto.
DROP TRIGGER IF EXISTS motorista_viaturas_fecha_anteriores ON public.motorista_viaturas;
CREATE TRIGGER motorista_viaturas_fecha_anteriores
  AFTER INSERT ON public.motorista_viaturas
  FOR EACH ROW EXECUTE FUNCTION public.fn_motorista_viaturas_fecha_anteriores();

-- 3) Rede de segurança para o futuro. NOT VALID porque há 24 linhas antigas
--    por reparar — a restrição vale para tudo o que entrar de agora em diante.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'motorista_viaturas_fim_depois_do_inicio'
  ) THEN
    ALTER TABLE public.motorista_viaturas
      ADD CONSTRAINT motorista_viaturas_fim_depois_do_inicio
      CHECK (data_fim IS NULL OR data_fim >= data_inicio) NOT VALID;
  END IF;
END $$;
