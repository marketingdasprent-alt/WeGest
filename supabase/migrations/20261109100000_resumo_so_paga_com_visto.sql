-- O resumo deixa de nascer pago. Decisão de 09/11/2026: em todas as empresas, um
-- movimento só passa a pago quando alguém marca o visto no Relatório de Pagamento
-- (sincronizar_pagamento_resumo, que continua). O pagamento ao gravar
-- (20261103110000) marcava pagas semanas da Premium Ride que ninguém tinha pago.

DROP TRIGGER IF EXISTS motorista_liquido_semanal_paga_sozinho ON public.motorista_liquido_semanal;
DROP FUNCTION IF EXISTS public.marcar_resumo_pago_ao_gravar();

NOTIFY pgrst, 'reload schema';
