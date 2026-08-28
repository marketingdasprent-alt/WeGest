-- Add lista_espera to calendario_eventos.tipo CHECK constraint
ALTER TABLE calendario_eventos
  DROP CONSTRAINT IF EXISTS calendario_eventos_tipo_check;

ALTER TABLE calendario_eventos
  ADD CONSTRAINT calendario_eventos_tipo_check
  CHECK (tipo = ANY (ARRAY['entrega', 'recolha', 'devolucao', 'troca', 'upgrade', 'lista_espera']));
