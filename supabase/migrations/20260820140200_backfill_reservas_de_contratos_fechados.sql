-- ============================================================
-- Backfill: libertar as viaturas presas por contratos já fechados
-- ============================================================
-- Acompanha 20260820140000_fecho_contrato_liberta_viatura.sql, que corrige a
-- cascata daqui para a frente. Este ficheiro trata do passivo: à data de
-- 2026-08-20 havia 39 contratos fechados ('cancelado', não substituídos) cuja
-- reserva continuava em 'confirmada' e, por isso, ainda ocupava a viatura em
-- useViaturasOcupacao — carros que a frota via como indisponíveis sem motivo
-- visível na aplicação (ex.: #479 BT-21-UN, #442 BI-93-XC, #397 BO-72-DF).
--
-- SALVAGUARDA
-- Só mexe em reservas que não sirvam nenhum contrato vivo. Se a mesma reserva
-- ainda tiver uma versão em 'agendado'/'em_curso' (não substituída), fica
-- intacta — essa reserva está legitimamente a ocupar a viatura.
-- ============================================================

UPDATE public.reservas r
   SET estado = 'cancelada'::reserva_estado_enum
 WHERE r.estado IN ('pendente', 'confirmada', 'em_curso')
   AND EXISTS (
     SELECT 1
       FROM public.contratos_renting c
      WHERE c.reserva_id = r.id
        AND c.deleted_at IS NULL
        AND c.substituido_em IS NULL
        AND c.estado_operacional = 'cancelado'
   )
   AND NOT EXISTS (
     SELECT 1
       FROM public.contratos_renting c2
      WHERE c2.reserva_id = r.id
        AND c2.deleted_at IS NULL
        AND c2.substituido_em IS NULL
        AND c2.estado_operacional IN ('agendado', 'em_curso')
   );
