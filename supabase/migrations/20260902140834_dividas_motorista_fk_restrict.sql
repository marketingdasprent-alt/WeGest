-- ON DELETE CASCADE apagava as dívidas de um motorista ao apagá-lo — o
-- oposto do que a snapshot de motorista_nome já tentava garantir (a lista
-- continuar legível mesmo depois do motorista ser removido). motoristas_ativos
-- não tem soft-delete; o mesmo padrão usado noutras tabelas de obrigação
-- deste domínio (acordos_pagamento, contrato_condutores, contratos_prestacao,
-- cartao_atribuicoes, reserva_condutores) já usa RESTRICT — alinha aqui.
-- IF EXISTS para o job "DB Rebuild + pgTAP": numa reconstrução a partir do
-- repo a constraint vem do REFERENCES inline da migração anterior, com o nome
-- automático do Postgres. É determinístico, mas se algum dia a criação mudar
-- de forma, o rebuild parava aqui em vez de seguir para o ADD CONSTRAINT.
ALTER TABLE public.dividas_motorista
  DROP CONSTRAINT IF EXISTS dividas_motorista_motorista_id_fkey;

ALTER TABLE public.dividas_motorista
  ADD CONSTRAINT dividas_motorista_motorista_id_fkey
  FOREIGN KEY (motorista_id) REFERENCES public.motoristas_ativos(id) ON DELETE RESTRICT;
