-- ============================================================
-- Apanha os fechos que o build antigo continuou a escrever como 'cancelado'
-- ============================================================
-- A base de dados foi corrigida em 20/08, mas o frontend em produção só
-- muda no deploy. Nessa janela, cada clique em "Fechar contrato" continuou
-- a escrever 'cancelado' — o build antigo não conhece 'fechado'.
--
-- Já apanhámos dois na manhã de 21/08: #752 (Postlog, BL-60-FQ, FACTURADO)
-- e #683 (Triângulo Resistente, BL-61-FQ), ambos com km registados. Um
-- contrato facturado em 'cancelado' fica fora do fechar-semana-financeiro,
-- que é precisamente a fuga que este trabalho todo veio tapar.
--
-- Esta migração corre NO DEPLOY, ou seja imediatamente antes de o frontend
-- novo entrar ao serviço. Apanha tudo o que se acumulou na janela e nada do
-- que vier depois: a partir do deploy, quem escreve 'cancelado' é a acção
-- "Cancelar contrato", que é intencional e não deve ser tocada.
--
-- Mesmo critério de 20260820150200 — só reclassifica com prova física de
-- que a viatura saiu ou voltou. Sem prova, fica 'cancelado', que é o que
-- um contrato nunca entregue deve ser.
--
-- Triggers desligados pela mesma razão de 20260820150200:
-- inativar_motorista_na_devolucao não verifica se o condutor está activo
-- noutro contrato, e desactivá-lo-ia indevidamente.
-- ============================================================

ALTER TABLE public.contratos_renting DISABLE TRIGGER USER;

UPDATE public.contratos_renting
   SET estado_operacional = 'fechado'::contrato_estado_operacional_enum
 WHERE deleted_at IS NULL
   AND substituido_em IS NULL
   AND estado_operacional = 'cancelado'
   AND (km_saida IS NOT NULL OR combustivel_saida IS NOT NULL
        OR km_entrada IS NOT NULL OR combustivel_entrada IS NOT NULL);

ALTER TABLE public.contratos_renting ENABLE TRIGGER USER;

-- Com os triggers desligados a cascata não corre, por isso as reservas
-- destes contratos ficariam desalinhadas — a mesma dívida que a
-- 20260821100000 veio pagar. Alinha-se aqui de imediato, com a salvaguarda
-- habitual de não tocar em reservas que ainda sirvam um contrato vivo.
UPDATE public.reservas r
   SET estado = 'concluida'::reserva_estado_enum
 WHERE r.estado = 'cancelada'
   AND EXISTS (
     SELECT 1 FROM public.contratos_renting c
      WHERE c.reserva_id = r.id
        AND c.deleted_at IS NULL
        AND c.substituido_em IS NULL
        AND c.estado_operacional = 'fechado'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.contratos_renting c2
      WHERE c2.reserva_id = r.id
        AND c2.deleted_at IS NULL
        AND c2.substituido_em IS NULL
        AND c2.estado_operacional IN ('agendado', 'em_curso')
   );
