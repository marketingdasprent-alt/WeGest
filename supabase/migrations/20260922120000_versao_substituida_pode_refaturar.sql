-- Versões substituídas voltam a poder mudar de estado financeiro.
--
-- `fn_contratos_renting_versao_imutavel` bloqueava `estado_financeiro` em
-- qualquer versão com `substituido_em` preenchido. Mas anular a faturação de
-- uma versão antiga é operação legítima: o documento fiscal pertence ao
-- período daquela versão, e refaturá-lo não reescreve o contrato. O irmão
-- `fn_contratos_imutabilidade_facturados` já fazia essa distinção — este não.
--
-- O estrago é pior do que um botão que falta, porque
-- `ContratoTabFaturar.anularFaturacao()` não corre em transação: anula a
-- cobrança primeiro e só depois repõe o contrato. Com o bloqueio, o passo 1
-- ficava gravado e o passo 2 rebentava — contrato marcado 'facturado' sem
-- nenhuma cobrança activa, e sem botão para refaturar (o botão esconde-se com
-- `estado_financeiro !== 'pendente'`). Medido a 2026-09-22: contratos #831
-- (BC-23-ZN, anulado a 07-09) e #686 (BJ-96-GM) presos assim.
--
-- Os valores financeiros continuam protegidos: tarifa, desconto, IVA, valor
-- manual, franquia, caução e kms mantêm-se na lista, e
-- `fn_contratos_imutabilidade_facturados` cobre-os enquanto o contrato está
-- facturado.

CREATE OR REPLACE FUNCTION public.fn_contratos_renting_versao_imutavel()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.substituido_em IS NOT NULL THEN
    -- Permite só alterar deleted_at (soft-delete administrativo),
    -- estado_financeiro (anular/refaturar o período desta versão) e
    -- updated_at/updated_by (refrescados por triggers internos).
    IF (NEW.tarifa_diaria          IS DISTINCT FROM OLD.tarifa_diaria)
       OR (NEW.desconto_percentagem IS DISTINCT FROM OLD.desconto_percentagem)
       OR (NEW.taxa_iva             IS DISTINCT FROM OLD.taxa_iva)
       OR (NEW.valor_total_manual   IS DISTINCT FROM OLD.valor_total_manual)
       OR (NEW.franquia_valor       IS DISTINCT FROM OLD.franquia_valor)
       OR (NEW.caucao_valor         IS DISTINCT FROM OLD.caucao_valor)
       OR (NEW.kms_incluidos        IS DISTINCT FROM OLD.kms_incluidos)
       OR (NEW.km_adicional_valor   IS DISTINCT FROM OLD.km_adicional_valor)
       OR (NEW.estado_operacional   IS DISTINCT FROM OLD.estado_operacional)
       OR (NEW.viatura_id           IS DISTINCT FROM OLD.viatura_id)
       OR (NEW.cliente_id           IS DISTINCT FROM OLD.cliente_id)
       OR (NEW.emissor_id           IS DISTINCT FROM OLD.emissor_id)
       OR (NEW.data_inicio          IS DISTINCT FROM OLD.data_inicio)
       OR (NEW.data_fim             IS DISTINCT FROM OLD.data_fim)
       OR (NEW.regime               IS DISTINCT FROM OLD.regime)
       OR (NEW.transferista_id      IS DISTINCT FROM OLD.transferista_id)
       OR (NEW.motivo_versao        IS DISTINCT FROM OLD.motivo_versao)
       OR (NEW.versao               IS DISTINCT FROM OLD.versao)
       OR (NEW.contrato_anterior_id IS DISTINCT FROM OLD.contrato_anterior_id)
    THEN
      RAISE EXCEPTION
        'Versão substituída de contrato é imutável. Cria uma nova versão se queres editar.'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_contratos_renting_versao_imutavel() IS
  'Congela uma versão substituída, menos deleted_at e estado_financeiro — anular/refaturar o período dessa versão é legítimo. Ver migração 20260922120000.';

-- Repara as versões que ficaram presas: marcadas como facturadas mas sem
-- nenhuma cobrança activa. `fn_contratos_renting_freeze_totals` limpa os
-- totais e o `facturado_em` sozinha na transição facturado→pendente.
UPDATE public.contratos_renting c
   SET estado_financeiro = 'pendente'
 WHERE c.substituido_em IS NOT NULL
   AND c.deleted_at IS NULL
   AND c.estado_financeiro = 'facturado'
   AND NOT EXISTS (
     SELECT 1 FROM public.contrato_cobrancas cb
      WHERE cb.contrato_id = c.id
        AND cb.estado IN ('emitida', 'paga')
   );

NOTIFY pgrst, 'reload schema';
