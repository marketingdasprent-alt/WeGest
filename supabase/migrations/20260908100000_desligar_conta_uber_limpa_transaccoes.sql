-- Desligar uma conta Uber de um motorista passa a limpar as transacções dela.
--
-- `sync_motorista_id_to_transactions` propagava a ligação num só sentido:
--
--     IF NEW.motorista_id IS NOT NULL AND (OLD.motorista_id IS NULL OR ...) THEN
--       UPDATE uber_transactions SET motorista_id = NEW.motorista_id ...
--
-- Ligar uma conta a um motorista carimbava todas as transacções dela. Desfazer
-- a ligação não desfazia nada: `uber_drivers.motorista_id` voltava a NULL e as
-- transacções ficavam carimbadas para sempre.
--
-- Caso real: as contas Uber da "Década Ousada, Lda.", da "URBANGO Lda" e do
-- motorista THIAGO QUEIROZ estiveram associadas à ficha do Nuno Costa. A
-- associação foi desfeita — as três estão a NULL em uber_drivers — mas oito
-- transacções continuaram a apontar para ele. Somadas, punham a facturação
-- Uber dele em −16.345 € em vez dos +5.072 € que são mesmo dele: contas de
-- empresa têm movimentos de sentido contrário (pagamentos, acertos).
--
-- O estrago não ficou aí: o backfill de 20260825120000 leu
-- `uber_resumos_semanais.motorista_id` — já contaminado — e transformou-o em
-- identidades permanentes em motorista_plataforma_identidades, que é a fonte
-- que as triggers de resolução consultam. Um erro de um clique tornou-se
-- estrutural.
--
-- O ecrã de Resumos escapou porque resolve pelo `uber_uuid` da ficha, não pela
-- tabela de identidades — foi por isso que ninguém deu por nada.

CREATE OR REPLACE FUNCTION public.sync_motorista_id_to_transactions() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Ligar: carimba as transacções desta conta com o motorista.
  IF NEW.motorista_id IS NOT NULL
     AND (OLD.motorista_id IS NULL OR OLD.motorista_id <> NEW.motorista_id) THEN
    UPDATE public.uber_transactions
       SET motorista_id = NEW.motorista_id
     WHERE uber_driver_id = NEW.uber_driver_id
       AND integracao_id  = NEW.integracao_id
       AND (motorista_id IS NULL OR motorista_id <> NEW.motorista_id);
  END IF;

  -- Desligar: limpa o que a ligação tinha carimbado. Sem isto, desfazer uma
  -- associação errada deixava o rasto nas transacções — e o backfill seguinte
  -- transformava esse rasto numa identidade permanente.
  --
  -- Só se apagam as que apontam para o motorista que saiu: uma transacção
  -- atribuída a outra pessoa entretanto não é deste assunto.
  IF NEW.motorista_id IS NULL AND OLD.motorista_id IS NOT NULL THEN
    UPDATE public.uber_transactions
       SET motorista_id = NULL
     WHERE uber_driver_id = NEW.uber_driver_id
       AND integracao_id  = NEW.integracao_id
       AND motorista_id   = OLD.motorista_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_motorista_id_to_transactions() IS
  'Mantém uber_transactions.motorista_id em linha com uber_drivers, nos DOIS sentidos: ligar carimba, desligar limpa. Antes só ligava — e desfazer uma associação errada deixava as transacções carimbadas para sempre (caso Nuno Costa, 20260908100000).';
