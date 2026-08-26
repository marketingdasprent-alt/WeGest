-- ============================================================
-- Um dia, uma viatura — nunca duas
-- ============================================================
-- O Adair Pinheiro apareceu com 410,71 € de aluguer numa semana:
--
--   BV-87-QO   17/08          1 dia   275 €/sem =  39,29 €
--   BT-21-UN   17/08 a 20/08  4 dias  325 €/sem = 185,71 €
--   BS-59-ZA   20/08 a 23/08  4 dias  325 €/sem = 185,71 €
--                             -------
--                             9 dias numa semana de 7
--
-- Duas causas, e a segunda é estrutural:
--
--   1. Um período antigo por reparar, ainda a começar em 2025-11-01.
--   2. A convenção: o período anterior acaba NO dia em que o seguinte começa.
--      O dia da troca é cobrado duas vezes, uma por cada viatura.
--
-- A partir daqui o limite é exclusivo: um período acaba na VÉSPERA do
-- seguinte. Assim a soma dos dias de uma semana nunca passa de sete, seja
-- quem for a contá-los — e não é preciso que cada ecrã se lembre de descontar
-- o dia da troca, que é o género de detalhe que se esquece e custa dinheiro.
--
-- Reparação incluída: encolhe (nunca estende) os períodos que invadem o
-- seguinte. Aplica-se a todos os motoristas, não só ao caso que a destapou.
-- ============================================================

-- 1) A regra, daqui para a frente
CREATE OR REPLACE FUNCTION public.fn_motorista_viaturas_fecha_anteriores()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- O motorista larga o que tinha: acaba na véspera de pegar no novo.
  UPDATE public.motorista_viaturas
     SET data_fim = NEW.data_inicio - 1
   WHERE motorista_id = NEW.motorista_id
     AND id <> NEW.id
     AND viatura_id IS DISTINCT FROM NEW.viatura_id
     AND data_inicio < NEW.data_inicio
     AND (data_fim IS NULL OR data_fim >= NEW.data_inicio);

  -- E a viatura larga quem a tinha.
  UPDATE public.motorista_viaturas
     SET data_fim = NEW.data_inicio - 1
   WHERE viatura_id = NEW.viatura_id
     AND id <> NEW.id
     AND motorista_id IS DISTINCT FROM NEW.motorista_id
     AND data_inicio < NEW.data_inicio
     AND (data_fim IS NULL OR data_fim >= NEW.data_inicio);

  RETURN NULL;
END $$;

-- 2) Reparação do que já lá está: cada período acaba, no máximo, na véspera do
--    seguinte do mesmo motorista. Só encolhe, e nunca abaixo do próprio início.
--
--    O "seguinte" é o próximo início ESTRITAMENTE posterior. Usar LEAD() aqui
--    seria um erro caro: o Adair Pinheiro tem três linhas a começar todas em
--    2025-11-01 (o defeito que esta migração vem resolver), e com o empate o
--    LEAD elegeria uma delas como "seguinte" — encolhendo a BN-44-ST, nove
--    meses de aluguer verdadeiro, para zero dias. Linhas com o mesmo início
--    ficam intocadas: são lixo a reparar caso a caso, não uma cadeia.
WITH a_corrigir AS (
  SELECT mv.id,
         (SELECT min(s.data_inicio)
            FROM public.motorista_viaturas s
           WHERE s.motorista_id = mv.motorista_id
             AND s.data_inicio > mv.data_inicio) - 1 AS novo_fim
  FROM public.motorista_viaturas mv
)
UPDATE public.motorista_viaturas mv
SET data_fim = c.novo_fim
FROM a_corrigir c
WHERE c.id = mv.id
  AND c.novo_fim IS NOT NULL
  AND c.novo_fim >= mv.data_inicio          -- nunca um fim antes do início
  AND (mv.data_fim IS NULL OR mv.data_fim > c.novo_fim);
