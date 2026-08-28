-- Alinhamento das integrações para Segunda-feira às 00:00
-- Este script faz com que todas as integrações marcadas com sync semanal (168h)
-- fiquem "vencidas" e prontas para rodar exatamente no início da próxima segunda-feira.

-- 1. Definir o próximo marco de segunda-feira 00:00
DO $$
DECLARE
    proxima_segunda TIMESTAMP;
BEGIN
    -- Calcula a próxima segunda-feira às 00:00
    proxima_segunda := date_trunc('week', now() + interval '1 week');
    
    RAISE NOTICE 'Alinhando sincronização para a próxima segunda-feira: %', proxima_segunda;

    -- 2. Ajustar o ultimo_sync para que falte exatamente 168h para a segunda-feira
    -- Assim, às 00:00 de segunda, 'now() - ultimo_sync' será >= 168h.
    UPDATE plataformas_configuracao
    SET ultimo_sync = (date_trunc('week', now() + interval '1 week') - interval '168 hours')
    WHERE sync_automatico = true 
      AND ativo = true
      AND intervalo_sync_horas = 168;

    -- 3. Garantir que o pg_cron está ativo para o orquestrador
    -- (O orquestrador roda a cada 10 min e processa 1 por vez da fila pending)
    
END $$;
