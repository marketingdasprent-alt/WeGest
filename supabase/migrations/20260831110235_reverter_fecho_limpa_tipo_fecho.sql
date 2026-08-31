-- ============================================================
-- Contratos que ficavam a dizer "em curso" e "devolvido" ao mesmo tempo
-- ============================================================
-- Reverter o fecho de um contrato repunha o estado para 'em_curso' mas deixava
-- lá o `tipo_fecho`. O contrato passava a afirmar duas coisas incompatíveis, e
-- como a viatura só conta o ESTADO para saber se está ocupada, voltava a ficar
-- presa ao contrato. A única forma de os dois campos voltarem a concordar era
-- reverter e fechar outra vez — que foi exactamente o sintoma relatado.
--
-- Apanhou três contratos em produção (#441, #473, #713), todos tocados entre 26
-- e 28/08, portanto DEPOIS de as correcções do fecho de 20-24/08 já estarem
-- aplicadas: não era lixo antigo, era a porta que ficou aberta no reverter.
--
-- Limpa-se o `tipo_fecho` e a marca da DUA, NÃO o estado. O gestor reverteu o
-- fecho de propósito; decidir aqui que o contrato afinal está fechado seria
-- decidir por ele. O que se corrige é a contradição — se algum destes devia
-- mesmo estar fechado, fecha-se pela aplicação, que a partir de agora deixa os
-- dois campos a concordar (ver patchContratoAoReverterFecho).
--
-- Os quilómetros, o combustível, os danos e as fotos da recolha ficam intactos:
-- são factos físicos, medidos quando o carro foi visto. Quem reverte um fecho
-- para corrigir uma data não pode perder as fotos dos danos por causa disso.
UPDATE public.contratos_renting
   SET tipo_fecho = NULL,
       dua_devolvida_em = NULL
 WHERE deleted_at IS NULL
   AND substituido_em IS NULL
   AND tipo_fecho IS NOT NULL
   AND estado_operacional NOT IN ('fechado', 'cancelado');
