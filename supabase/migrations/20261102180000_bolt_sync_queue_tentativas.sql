-- Quantas vezes a linha da fila já voltou atrás por falha passageira (função
-- que não arrancou, 5xx, rede). O bolt-sync-drain repete até 3 tentativas.
ALTER TABLE public.bolt_sync_queue
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bolt_sync_queue.tentativas IS
  'Tentativas já falhadas por falha passageira; o bolt-sync-drain volta a pôr a linha em pending até 3 no total.';

NOTIFY pgrst, 'reload schema';
