ALTER TABLE calendario_eventos DROP CONSTRAINT calendario_eventos_tipo_check;
ALTER TABLE calendario_eventos ADD CONSTRAINT calendario_eventos_tipo_check 
  CHECK (tipo = ANY (ARRAY['entrega', 'recolha', 'devolucao']));