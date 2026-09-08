-- Um contrato TVDE nasce sem data de fim.
--
-- Regra do negócio: o TVDE não tem fim. Abre-se com data de início, cobra-se à
-- semana, e a renovação é um acto manual que se regista — não um prazo que
-- expira. Quem escreveu isto no formulário fê-lo com boa intenção
-- (SectionEntregaRecolha: "data_fim passa a ser a próxima renovação"), mas a
-- coluna já significava outra coisa para quem a lê: o cálculo do aluguer e a
-- trava `contratos_no_overbooking`.
--
-- Esta trigger garante a regra em QUALQUER caminho de criação — formulário,
-- troca de viatura, renovação, importação — em vez de depender de cada sítio
-- se lembrar. Se vier lá uma data, ela é o que sempre foi na prática (a
-- próxima renovação) e vai para `proxima_renovacao_em`.
--
-- SÓ EM INSERT, de propósito. Em UPDATE limparia a data_fim dos contratos
-- TVDE que já existem, e isso faz o aluguer voltar a ser calculado
-- retroactivamente (~100 mil € em 17 contratos). Essa é uma decisão de
-- negócio, contrato a contrato — não um efeito colateral de alguém gravar
-- uma alteração qualquer numa ficha.

CREATE OR REPLACE FUNCTION public.fn_tvde_nasce_sem_data_fim() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- A data que vinha em data_fim era, na prática, a da próxima renovação.
  -- Aproveita-se em vez de se deitar fora.
  IF NEW.data_fim IS NOT NULL THEN
    IF NEW.proxima_renovacao_em IS NULL THEN
      NEW.proxima_renovacao_em := NEW.data_fim;
    END IF;
    NEW.data_fim := NULL;
  END IF;

  -- Longa duração sem data de renovação: se o contrato traz um ciclo, aplica-se.
  IF COALESCE(NEW.is_longa_duracao, false)
     AND NEW.proxima_renovacao_em IS NULL
     AND NEW.data_inicio IS NOT NULL THEN
    NEW.proxima_renovacao_em := public.proxima_data_renovacao(
      NEW.data_inicio, NEW.renovacao_opcao::text, NEW.renovacao_intervalo_dias);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_tvde_nasce_sem_data_fim() IS
  'Um TVDE não tem fim: força data_fim a NULL na criação e encaminha a data recebida para proxima_renovacao_em. Só em INSERT — em UPDATE mexeria nos contratos existentes e faria o aluguer voltar retroactivamente, o que é decisão de negócio.';

DROP TRIGGER IF EXISTS trg_tvde_nasce_sem_data_fim ON public.contratos_renting;

-- Nome com "a_" para correr cedo: a data_fim tem de ficar resolvida antes das
-- triggers que dela dependem (a coluna gerada `periodo` e a cascata de datas).
CREATE TRIGGER trg_a_tvde_nasce_sem_data_fim
  BEFORE INSERT ON public.contratos_renting
  FOR EACH ROW
  WHEN (NEW.regime = 'tvde')
  EXECUTE FUNCTION public.fn_tvde_nasce_sem_data_fim();
