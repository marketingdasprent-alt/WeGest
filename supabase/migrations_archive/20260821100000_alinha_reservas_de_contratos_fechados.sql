-- ============================================================
-- Alinha as reservas dos contratos reclassificados para 'fechado'
-- ============================================================
-- Dívida deixada por 20260820150200. Essa migração desligou os triggers de
-- propósito — sem isso, inativar_motorista_na_devolucao desactivaria em massa
-- condutores activos noutros contratos. O efeito lateral é que as reservas
-- não acompanharam a mudança de estado.
--
-- Concretamente: contratos que 20260820140200 já tinha levado a reserva a
-- 'cancelada' (enquanto ainda eram 'cancelado') passaram depois a 'fechado',
-- mas a reserva ficou onde estava. Ficam 55 linhas em que os dados dizem
-- "cancelada" e a cascata nova garante "concluida" para o mesmo estado.
--
-- Não muda disponibilidade — nem 'cancelada' nem 'concluida' ocupam viatura
-- (ver useViaturasOcupacao). É coerência: a partir daqui, fechar um contrato
-- conclui a reserva, e o histórico tem de dizer o mesmo.
--
-- SALVAGUARDA
-- Mesma regra de 20260820140200: não toca em reservas que ainda sirvam um
-- contrato vivo. Numa troca de viatura a reserva é partilhada pela cadeia, e
-- há 9 casos em produção (anteriores a este trabalho) em que o elo activo tem
-- a reserva já fechada — esses não são para aqui e ficam intactos.
--
-- Triggers de reservas ficam LIGADOS de propósito: queremos que
-- recalcular_disponibilidade_viatura corra. fn_slot_cobranca_entrada sai logo
-- à entrada, porque só age em 'confirmada'/'em_curso' — nenhuma cobrança pode
-- disparar por causa disto.
-- ============================================================

UPDATE public.reservas r
   SET estado = 'concluida'::reserva_estado_enum
 WHERE r.estado = 'cancelada'
   AND EXISTS (
     SELECT 1
       FROM public.contratos_renting c
      WHERE c.reserva_id = r.id
        AND c.deleted_at IS NULL
        AND c.substituido_em IS NULL
        AND c.estado_operacional = 'fechado'
   )
   AND NOT EXISTS (
     SELECT 1
       FROM public.contratos_renting c2
      WHERE c2.reserva_id = r.id
        AND c2.deleted_at IS NULL
        AND c2.substituido_em IS NULL
        AND c2.estado_operacional IN ('agendado', 'em_curso')
   );
