-- ============================================================
-- Backfill: repor o código postal que a aprovação deitou fora
-- ============================================================
-- Acompanha 20260821130000, que corrige a aprovação daqui para a frente.
-- Este ficheiro trata do passivo: motoristas que vieram de uma candidatura
-- onde o próprio escreveu o código postal, e ficaram sem ele no perfil.
--
-- O dado nunca se perdeu — está na candidatura. É só copiá-lo para onde
-- devia ter ido. À data de 2026-08-21 são 14 motoristas (1 de Março, 6 de
-- Junho, 7 de Julho).
--
-- Confirmado antes de escrever: nenhum email tem mais do que uma candidatura,
-- por isso o UPDATE ... FROM não tem hipótese de escolher a linha errada.
--
-- LIGAÇÃO POR EMAIL, em minúsculas
-- É o que liga as duas tabelas de forma fiável: `motoristas_ativos` não
-- guarda referência à candidatura de origem, e o email é único por motorista.
-- Em minúsculas porque há registos com maiúsculas trocadas entre as duas.
--
-- Só preenche o que está vazio: nunca escreve por cima de um código postal
-- que alguém já corrigiu à mão — e há vários, porque foi assim que a equipa
-- contornou este bug durante meses.
--
-- Idempotente: correr duas vezes não muda nada na segunda.
-- ============================================================

UPDATE public.motoristas_ativos m
   SET codigo_postal = c.codigo_postal
  FROM public.motorista_candidaturas c
 WHERE lower(m.email) = lower(c.email)
   AND (m.codigo_postal IS NULL OR btrim(m.codigo_postal) = '')
   AND c.codigo_postal IS NOT NULL
   AND btrim(c.codigo_postal) <> '';
