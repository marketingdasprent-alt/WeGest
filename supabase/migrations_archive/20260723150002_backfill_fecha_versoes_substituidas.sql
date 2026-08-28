-- ============================================================
-- Backfill: fechar versões substituídas que ficaram "abertas"
-- ============================================================
-- Antes do fix 20260723110000, a edição de contrato (criar_versao) marcava a
-- versão antiga como `substituido_em` mas SEM a fechar — ficava presa em
-- 'agendado'/'em_curso'. Estas versões são imutáveis (trigger
-- fn_contratos_renting_versao_imutavel), por isso o update tem de desligar
-- esse trigger só durante a operação.
--
-- Seguro: o trigger que inativa o motorista salta versões substituídas
-- (NEW.substituido_em IS NOT NULL → RETURN NEW); a disponibilidade da viatura
-- é recalculada pelo trigger normal (a versão sucessora, ativa, mantém a
-- ocupação). Só o trigger de imutabilidade é desligado, e só aqui.
-- ============================================================

ALTER TABLE public.contratos_renting DISABLE TRIGGER trg_contratos_renting_versao_imutavel;

UPDATE public.contratos_renting
   SET estado_operacional = 'cancelado'::contrato_estado_operacional_enum
 WHERE substituido_em IS NOT NULL
   AND deleted_at IS NULL
   AND estado_operacional IN ('agendado', 'em_curso');

ALTER TABLE public.contratos_renting ENABLE TRIGGER trg_contratos_renting_versao_imutavel;
