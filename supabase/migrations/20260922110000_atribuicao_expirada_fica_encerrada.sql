-- Atribuições motorista↔viatura: quem já expirou passa a dizê-lo no `status`.
--
-- `fn_motorista_viaturas_fecha_anteriores` chama-se "fecha" mas só escrevia a
-- `data_fim` — o `status` ficava em 'ativo'. Resultado: linhas com
-- status='ativo' E data_fim preenchida, que cada ecrã lia à sua maneira (uns
-- exigiam `data_fim IS NULL` e escondiam carros atribuídos, outros olhavam só
-- ao status e mostravam carros já devolvidos). Medido a 2026-09-22: 54 linhas
-- assim, 16 já expiradas e 38 com data de fim no futuro.
--
-- As 38 futuras NÃO se tocam: são atribuições legítimas a decorrer, carimbadas
-- por `fn_contrato_sincroniza_atribuicao` com o fim do contrato. 'ativo' com
-- data_fim futura é um estado válido — o critério de leitura vive em
-- src/utils/associacaoViatura.ts.

-- 1) A trigger passa a encerrar o que fecha, mas só quando a data de fim que
--    escreve já passou. Uma atribuição agendada para o futuro fecha a anterior
--    numa data futura, e essa continua a decorrer até lá.
CREATE OR REPLACE FUNCTION public.fn_motorista_viaturas_fecha_anteriores()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- O motorista larga o que tinha: acaba na véspera de pegar no novo.
  UPDATE public.motorista_viaturas
     SET data_fim = NEW.data_inicio - 1,
         status   = CASE WHEN NEW.data_inicio - 1 < CURRENT_DATE
                         THEN 'encerrado' ELSE status END
   WHERE motorista_id = NEW.motorista_id
     AND id <> NEW.id
     AND viatura_id IS DISTINCT FROM NEW.viatura_id
     AND data_inicio < NEW.data_inicio
     AND (data_fim IS NULL OR data_fim >= NEW.data_inicio);

  -- E a viatura larga quem a tinha.
  UPDATE public.motorista_viaturas
     SET data_fim = NEW.data_inicio - 1,
         status   = CASE WHEN NEW.data_inicio - 1 < CURRENT_DATE
                         THEN 'encerrado' ELSE status END
   WHERE viatura_id = NEW.viatura_id
     AND id <> NEW.id
     AND motorista_id IS DISTINCT FROM NEW.motorista_id
     AND data_inicio < NEW.data_inicio
     AND (data_fim IS NULL OR data_fim >= NEW.data_inicio);

  RETURN NULL;
END $function$;

COMMENT ON FUNCTION public.fn_motorista_viaturas_fecha_anteriores() IS
  'Fecha as atribuições que o novo elo substitui: escreve data_fim e, se essa data já passou, encerra o status. Ver migração 20260922110000.';

-- 2) Normaliza o passivo: as que já expiraram deixam de se dizer activas.
UPDATE public.motorista_viaturas
   SET status = 'encerrado'
 WHERE status = 'ativo'
   AND data_fim IS NOT NULL
   AND data_fim < CURRENT_DATE;

NOTIFY pgrst, 'reload schema';
