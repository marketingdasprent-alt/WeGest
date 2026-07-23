-- Corrige o escalonamento automático introduzido na migração anterior
-- (20260723100000_via_verde_sync_queue.sql): esse espalhava as integrações
-- por qualquer dia/hora da semana (168 combinações), mas há uma exigência
-- de negócio real — os dados de QUALQUER robô Apify (Via Verde incluído)
-- têm de estar todos importados até às 7h de Segunda-feira (o ciclo é
-- sempre Domingo à noite → Segunda de manhã). Espalhar por outros dias
-- da semana quebra essa expectativa.
--
-- Também descoberto ao corrigir isto: o cálculo de "semana anterior" em
-- robot-execute assume que corre numa Segunda-feira (dow=1) — se corresse
-- ao Domingo à noite (dow=0), o cálculo de data ficaria errado (uma semana
-- a mais para trás, por causa do caso especial dow===0 na fórmula). Por
-- isso a janela fica só em horas de Segunda-feira, nunca Domingo, para não
-- arriscar dados errados.
--
-- Janela escolhida: Segunda 00:00–05:00 (6 horas possíveis) — deixa folga
-- de quase 2h antes das 7h para a fila (via_verde_sync_queue, 2 de cada vez
-- a cada 5 min) escoar mesmo num pico grande na última hora da janela.
ALTER TABLE public.plataformas_configuracao
  ALTER COLUMN sync_dia_semana SET DEFAULT 1,
  ALTER COLUMN sync_hora SET DEFAULT
    COALESCE((((hashtext(get_current_org_id()::text || ':hour')::bigint % 6) + 6) % 6)::smallint, 4);
