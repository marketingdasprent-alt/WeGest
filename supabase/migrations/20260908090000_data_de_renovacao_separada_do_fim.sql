-- A data da próxima renovação deixa de viver na coluna do fim do contrato.
--
-- `data_fim` estava a guardar duas coisas incompatíveis:
--   · "o contrato acabou"        — o que o cálculo do aluguer e a trava de
--                                  overbooking lêem;
--   · "quando é a próxima renovação" — o que o formulário lá punha, para
--                                  contratos de longa duração.
--
-- Num TVDE só existe a segunda: o contrato não tem fim, o motorista fica
-- enquanto quiser e cobra-se à semana. Ao escrever ali a data da renovação,
-- passados 30 dias sem renovar (a renovação é manual) o sistema passava a ler
-- "este contrato acabou" e:
--
--   1. o aluguer deixava de ser calculado — o resumo semanal mostra 0,00 € de
--      aluguer com o motorista na rua com a viatura. 17 contratos TVDE assim,
--      em média há 4 meses;
--   2. a coluna gerada `periodo` fechava, e com ela a trava
--      `contratos_no_overbooking` deixava de proteger a viatura: ficava
--      "livre" para um contrato novo por cima. Daí 7 motoristas e 4 viaturas
--      em mais do que um contrato activo ao mesmo tempo;
--   3. e como não havia forma de renovar um contrato já expirado, abrir um
--      contrato novo era a única saída — está escrito à mão num dos motivos
--      de versão: "Troca, pois não consegui fazer de outra forma".
--
-- Esta migração só SEPARA os conceitos e copia os valores para o sítio certo.
-- Não mexe em `data_fim` de contrato nenhum: limpá-la faz o aluguer voltar a
-- ser calculado retroactivamente (~100 mil € em semanas passadas) e isso é
-- decisão de quem sabe o que já foi acertado com cada motorista, não de uma
-- migração.

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS proxima_renovacao_em timestamptz;

COMMENT ON COLUMN public.contratos_renting.proxima_renovacao_em IS
  'Quando toca renovar este contrato. NÃO é o fim do contrato: um TVDE não tem fim, cobra-se à semana e a renovação é um acto manual que se regista. Vive à parte de data_fim desde 20260908090000 — enquanto partilhavam coluna, uma renovação em atraso parava o aluguer e libertava a viatura para outro contrato.';

-- Backfill: onde a data_fim era, na prática, a data de renovação (longa
-- duração), copia-se para o sítio certo. Fica nos dois lados de propósito —
-- o código passa a ler a coluna nova e a antiga continua a alimentar o
-- cálculo e a trava até alguém decidir contrato a contrato.
UPDATE public.contratos_renting
   SET proxima_renovacao_em = data_fim
 WHERE proxima_renovacao_em IS NULL
   AND data_fim IS NOT NULL
   AND COALESCE(is_longa_duracao, false) = true
   AND deleted_at IS NULL;

-- Um TVDE de longa duração SEM data_fim renova na mesma: o prazo é virtual
-- (início + ciclo). Grava-se para o aviso deixar de o recalcular a cada leitura.
UPDATE public.contratos_renting
   SET proxima_renovacao_em = public.proxima_data_renovacao(
         data_inicio, renovacao_opcao::text, renovacao_intervalo_dias)
 WHERE proxima_renovacao_em IS NULL
   AND data_fim IS NULL
   AND regime = 'tvde'
   AND COALESCE(is_longa_duracao, false) = true
   AND deleted_at IS NULL
   AND substituido_em IS NULL
   AND estado_operacional = 'em_curso';

CREATE INDEX IF NOT EXISTS idx_contratos_renting_proxima_renovacao
    ON public.contratos_renting (proxima_renovacao_em)
 WHERE deleted_at IS NULL AND substituido_em IS NULL;
