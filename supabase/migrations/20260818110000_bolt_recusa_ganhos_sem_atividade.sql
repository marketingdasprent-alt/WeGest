-- ============================================================
-- Bolt: recusar ganhos sem atividade nenhuma por trás
-- ============================================================
-- A 10/08 um CSV do portal da Bolt foi importado para a semana 03–09/08 com
-- dados que não eram dessa semana. A 14/08 alguém percebeu e escreveu o
-- aviso "CSV removido... era copia identica da semana anterior" nas linhas
-- afectadas — mas só zerou os valores das semanas de Março a Maio. A semana
-- 03–09/08 ficou com 16 motoristas a somar ~1.844 EUR de ganhos que nunca
-- existiram, e ninguém deu por isso durante 4 dias (encontrado a 18/08 ao
-- verificar porque é que o motorista #1 tinha 5,09 EUR de Bolt numa semana
-- em que não trabalhou).
--
-- A assinatura destes dados é inconfundível e fisicamente impossível:
-- dinheiro sem UMA ÚNICA viagem, sem UM minuto online, sem UM quilómetro e
-- sem campanha nem reembolso que o justifique. Nenhuma fonte legítima
-- produz isso:
--   • ganhos de viagens implicam viagens (e minutos, e km);
--   • um prémio/campanha aparece em ganhos_campanha;
--   • um reembolso de despesa aparece em reembolsos_despesas.
--
-- Guarda na TABELA, não na função de import: há dois caminhos de escrita
-- (bolt_resumo_merge_csv e bolt_resumo_merge_api) e a barreira tem de valer
-- para os dois. Falha ALTO — quem importa o ficheiro errado vê o erro e
-- reimporta o certo, em vez de o número entrar em silêncio e ser pago.
--
-- Não toca em linhas já existentes: um trigger só vê escritas novas. As que
-- estão para trás foram/são tratadas à parte, uma a uma, com confirmação.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_bolt_recusa_ganhos_sem_atividade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.ganhos_liquidos, 0) > 0
     AND COALESCE(NEW.viagens_terminadas, 0) = 0
     AND COALESCE(NEW.tempo_online_min, 0) = 0
     AND COALESCE(NEW.distancia_total_km, 0) = 0
     AND COALESCE(NEW.ganhos_campanha, 0) = 0
     AND COALESCE(NEW.reembolsos_despesas, 0) = 0
  THEN
    RAISE EXCEPTION
      'Bolt: % EUR de ganhos sem atividade nenhuma (0 viagens, 0 min online, 0 km, '
      'sem campanha nem reembolso) para "%" no período %. Isto costuma ser um '
      'ficheiro de outra semana importado por engano — confirme o período do CSV '
      'antes de reimportar.',
      NEW.ganhos_liquidos, COALESCE(NEW.motorista_nome, NEW.chave_motorista, '?'),
      COALESCE(NEW.periodo, NEW.periodo_inicio::text, '?');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_bolt_recusa_ganhos_sem_atividade() IS
  'Trava ganhos Bolt sem qualquer atividade associada — a assinatura de um CSV '
  'de outra semana importado por engano (incidente de 10/08/2026, ~1.844 EUR '
  'fantasma em 16 motoristas). Vale para os dois caminhos de escrita.';

DROP TRIGGER IF EXISTS trg_bolt_recusa_ganhos_sem_atividade ON public.bolt_resumos_semanais;
CREATE TRIGGER trg_bolt_recusa_ganhos_sem_atividade
  BEFORE INSERT OR UPDATE ON public.bolt_resumos_semanais
  FOR EACH ROW EXECUTE FUNCTION public.fn_bolt_recusa_ganhos_sem_atividade();
