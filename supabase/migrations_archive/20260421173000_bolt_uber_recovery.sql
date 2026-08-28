-- 1. Reparar os órfãos da Bolt (retroativo)
-- Tenta associar registos que chegaram sem motorista_id
UPDATE public.bolt_resumos_semanais brs
SET motorista_id = m.id
FROM public.motoristas m
WHERE brs.motorista_id IS NULL
  AND (
    -- Match por telefone (últimos 9 dígitos)
    (replace(m.telefone, ' ', '') ILIKE '%' || right(replace(brs.telefone, ' ', ''), 9))
    OR
    -- Match por nome (fuzzy)
    (unaccent(lower(m.nome)) = unaccent(lower(brs.motorista_nome)))
    OR
    (unaccent(lower(brs.motorista_nome)) ILIKE '%' || unaccent(lower(m.nome)) || '%')
    OR
    (unaccent(lower(m.nome)) ILIKE '%' || unaccent(lower(brs.motorista_nome)) || '%')
  );

-- 2. Corrigir a associação da Uber (Sonia vs Nuno Costa)
-- Garante que cada um tem o seu UUID correto
UPDATE public.motoristas 
SET uber_uuid = '8f783b71-6aa1-4509-a731-45af01de30a8' 
WHERE nome = 'Sonia Sousa';

UPDATE public.motoristas 
SET uber_uuid = '86ef4559-03fa-4f6a-ab2b-76a2af580c01' 
WHERE nome = 'Nuno Costa';

-- 3. Garantir que as tabelas uber_drivers e bolt_drivers estão sincronizadas
UPDATE public.uber_drivers ud SET motorista_id = m.id FROM public.motoristas m WHERE ud.uber_driver_id = m.uber_uuid AND ud.motorista_id IS NULL;
UPDATE public.bolt_drivers bd SET motorista_id = m.id FROM public.motoristas m WHERE bd.driver_uuid = m.bolt_id AND bd.motorista_id IS NULL;
