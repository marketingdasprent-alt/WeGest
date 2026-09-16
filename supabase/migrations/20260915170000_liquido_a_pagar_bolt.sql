-- O que se paga ao motorista pela Bolt: uma coluna só, calculada pela base.
--
-- ⚠ SUBSTITUÍDA pela 20260915180000. A expressão abaixo soma a campanha
-- sempre — e nas linhas cujo líquido veio do CSV (fonte_viagens 'csv' ou
-- NULL) a campanha já está dentro do líquido, o que a duplicava. Fica aqui
-- porque já foi aplicada; a regra correcta está na migração seguinte.
--
-- O QUE ESTAVA MAL
-- Os três sítios que pagam ou mostram dinheiro Bolt — o fecho da semana, o
-- ecrã de contas e a ficha do motorista — lêem ganhos_liquidos. Numa
-- integração ligada à API oficial (auth_mode = 'oauth'), esse campo é escrito
-- pela API (migração 20260813220000: «o líquido segue as viagens»). A API
-- devolve viagens; não sabe o que é uma campanha. O CSV do portal traz as
-- campanhas e o importador guarda-as em ganhos_campanha — coluna que, até
-- hoje, nenhum ecrã e nenhuma função financeira lia.
--
-- Medido a 2026-09-15 na Década Ousada, semana de 2026-09-07, comparando o
-- CSV guardado em raw_data com o que a API escreveu, motorista a motorista:
--
--     viagens ........ API = CSV em 126 de 126
--     líquido ........ CSV 30 837,13  API 30 340,03  diferença 497,10
--        campanhas .................. 521,92   ← só o CSV traz
--        reembolsos de despesas .....   0,21
--        deriva de preços ........... -25,04   (14 motoristas; 0,08%)
--
-- Para 90 dos 126, API + campanha + reembolsos = CSV ao cêntimo. As campanhas
-- são para pagar ao motorista e não estavam a chegar-lhe: 984,28 EUR só nesta
-- semana, nas três integrações em oauth.
--
-- PORQUE UMA COLUNA GERADA E NÃO SOMAR PARA DENTRO DE ganhos_liquidos
--   · Não dessincroniza: o Postgres recalcula sempre que qualquer parcela muda,
--     venha da API ou do CSV e em qualquer ordem. Somar as campanhas para
--     dentro de ganhos_liquidos durava até à sincronização seguinte da API,
--     que o reescrevia e as apagava outra vez.
--   · Não reescreve o passado: ganhos_liquidos fica igual, e os acertos já
--     feitos continuam a bater com o que foi pago. A coluna nova diz o que
--     DEVIA ter sido pago — e, por decisão do dono, conta desde sempre.
--   · Diz o que é: quem ler daqui em diante não tem de se lembrar de somar.
--
-- SEM GORJETAS. Verificado nos motoristas com gorjeta e sem campanha: o
-- líquido do CSV e o da API já a incluem, ao cêntimo (Jorge Conceição 139,99 =
-- 139,99; Paulo Lopes 174,45 = 174,45). O frontend extrai-a e repõe-na para o
-- ajuste de IVA — está certo. Somá-la aqui duplicava-a.

ALTER TABLE public.bolt_resumos_semanais
  ADD COLUMN IF NOT EXISTS liquido_a_pagar numeric
  GENERATED ALWAYS AS (
      coalesce(ganhos_liquidos, 0)
    + coalesce(ganhos_campanha, 0)
    + coalesce(reembolsos_despesas, 0)
  ) STORED;

COMMENT ON COLUMN public.bolt_resumos_semanais.liquido_a_pagar IS
  'O que se paga ao motorista: ganhos_liquidos (API ou CSV) + campanhas + reembolsos de despesas, '
  'que só o CSV do portal traz. Sem gorjetas: já estão dentro de ganhos_liquidos. '
  'Calculada pela base — não se escreve. Ver src/config/bolt.ts.';

-- O PostgREST guarda o esquema em cache; sem isto o .select('liquido_a_pagar')
-- do frontend falha com "column does not exist" até ao próximo reload.
NOTIFY pgrst, 'reload schema';

-- Confirmação no próprio ficheiro: a coluna existe e é gerada.
DO $verificar$
DECLARE
  v_gerada text;
BEGIN
  SELECT is_generated INTO v_gerada
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'bolt_resumos_semanais'
     AND column_name = 'liquido_a_pagar';

  IF v_gerada IS DISTINCT FROM 'ALWAYS' THEN
    RAISE EXCEPTION 'liquido_a_pagar_bolt: a coluna não ficou como GENERATED ALWAYS (is_generated = %).', v_gerada;
  END IF;

  RAISE NOTICE 'liquido_a_pagar_bolt: coluna gerada criada em bolt_resumos_semanais.';
END;
$verificar$;
