-- Marca registos de viatura_danos que são apenas REGISTO FOTOGRÁFICO do
-- momento (entrega/recolha): têm fotos do estado da viatura mas não são um
-- dano catalogado. Não aparecem como linha na tabela de danos da folha, mas
-- as suas fotos entram na grelha e ficam visíveis na página do veículo.
ALTER TABLE public.viatura_danos
  ADD COLUMN IF NOT EXISTS registo_fotografico boolean NOT NULL DEFAULT false;
