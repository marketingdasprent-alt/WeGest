-- Reparação pontual do contrato #577 (v2 = 5b717dfc-5702-4785-9729-113c7923912d)
-- depois das 5 tentativas falhadas de troca de viatura em 2026-08-28.
--
-- NÃO é uma migração: é uma correcção de dados, para correr uma vez no SQL
-- editor do Supabase. O bug que causou isto já está corrigido em
-- 20260828230000 e 20260828230500.
--
-- O que faz:
--   1. Apaga os 5 eventos de recolha criados pelas tentativas falhadas
--      (motivos "RETORNA AO CARRO", "VOLTA PRO CARRO.", "OK", "EX",
--      "exemplo"). O evento legítimo de 2026-08-05 NÃO é tocado.
--   2. Reabre o contrato em 'em_curso', para a troca poder ser refeita.
--   3. Limpa km_entrada (400) e combustivel_entrada ('1/8'), que vieram de
--      uma tentativa falhada — a viatura tem 145 399 km, 400 é impossível.
--      Voltam a ser escritos quando o gestor refizer o fecho.

BEGIN;

DELETE FROM public.realizacao_tokens
 WHERE evento_id IN (
   '8fd08780-3435-4895-ba8b-2038a3de1457',
   'effc40ce-5ece-48d3-bd1f-737fe5372d82',
   'f36401cf-a4e7-4553-8ff0-50a7521800b2',
   'f034d119-26ef-4602-b4a2-c622c8b7865d',
   '43f4f7d3-3277-4fde-9d02-f9f5c4371a93'
 );

DELETE FROM public.calendario_eventos
 WHERE id IN (
   '8fd08780-3435-4895-ba8b-2038a3de1457',
   'effc40ce-5ece-48d3-bd1f-737fe5372d82',
   'f36401cf-a4e7-4553-8ff0-50a7521800b2',
   'f034d119-26ef-4602-b4a2-c622c8b7865d',
   '43f4f7d3-3277-4fde-9d02-f9f5c4371a93'
 );

UPDATE public.contratos_renting
   SET estado_operacional  = 'em_curso'::contrato_estado_operacional_enum,
       tipo_fecho          = NULL,
       km_entrada          = NULL,
       combustivel_entrada = NULL
 WHERE id = '5b717dfc-5702-4785-9729-113c7923912d';

-- Confere antes de confirmar.
SELECT versao, matricula, estado_operacional, tipo_fecho, km_entrada,
       combustivel_entrada, substituido_em
  FROM public.contratos_renting
 WHERE codigo = 577
 ORDER BY versao;

SELECT count(*) AS eventos_hoje_restantes
  FROM public.calendario_eventos
 WHERE origem_tipo = 'contrato_renting'
   AND origem_id   = '5b717dfc-5702-4785-9729-113c7923912d'
   AND created_at >= '2026-08-28';

COMMIT;
