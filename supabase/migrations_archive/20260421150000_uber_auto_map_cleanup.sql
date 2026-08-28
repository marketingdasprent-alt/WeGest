-- Migration: Manual UID matching for specific drivers and unaccent setup
-- Date: 2026-04-21

CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Tentativa de associação manual para os motoristas mencionados pelo USER
-- Estes motoristas partilham o telefone 910225915, o que dificultava o matching automático anterior.

-- Sonia Sousa
UPDATE public.uber_drivers
SET motorista_id = m.id
FROM public.motoristas_ativos m
WHERE uber_drivers.motorista_id IS NULL
  AND (
    unaccent(lower(m.nome)) ILIKE '%sonia sousa%'
    AND (
      unaccent(lower(uber_drivers.first_name || ' ' || uber_drivers.last_name)) ILIKE '%sonia sousa%'
      OR unaccent(lower(uber_drivers.full_name)) ILIKE '%sonia sousa%'
    )
  );

-- Cesar Martins
UPDATE public.uber_drivers
SET motorista_id = m.id
FROM public.motoristas_ativos m
WHERE uber_drivers.motorista_id IS NULL
  AND (
    unaccent(lower(m.nome)) ILIKE '%cesar martins%'
    AND (
      unaccent(lower(uber_drivers.first_name || ' ' || uber_drivers.last_name)) ILIKE '%cesar martins%'
      OR unaccent(lower(uber_drivers.full_name)) ILIKE '%cesar martins%'
    )
  );

-- Nuno Costa
UPDATE public.uber_drivers
SET motorista_id = m.id
FROM public.motoristas_ativos m
WHERE uber_drivers.motorista_id IS NULL
  AND (
    unaccent(lower(m.nome)) ILIKE '%nuno costa%'
    AND (
      unaccent(lower(uber_drivers.first_name || ' ' || uber_drivers.last_name)) ILIKE '%nuno costa%'
      OR unaccent(lower(uber_drivers.full_name)) ILIKE '%nuno costa%'
    )
  );

-- 2. Backfill genérico para outros motoristas que tenham nomes correspondentes
-- Apenas se o motorista_id ainda estiver nulo.
-- Priorizamos correspondência exacta de nome (sem acentos).

UPDATE public.uber_drivers ud
SET motorista_id = m.id
FROM public.motoristas_ativos m
WHERE ud.motorista_id IS NULL
  AND m.uber_uuid IS NULL
  AND unaccent(lower(m.nome)) = unaccent(lower(ud.first_name || ' ' || ud.last_name));

-- 3. Garantir que as bolt_drivers também estão mapeadas se o motorista existir e tiver o mesmo nome
UPDATE public.bolt_drivers bd
SET motorista_id = m.id
FROM public.motoristas_ativos m
WHERE bd.motorista_id IS NULL
  AND m.bolt_id IS NULL
  AND unaccent(lower(m.nome)) = unaccent(lower(bd.name));

-- NOTA: O trigger 'trigger_sync_uber_uuid' e 'trigger_sync_bolt_uuid' (se existirem) 
-- irão automaticamente atualizar 'motoristas.uber_uuid' e 'motoristas.bolt_id'.
