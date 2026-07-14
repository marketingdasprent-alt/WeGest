-- ============================================================
-- Restauro: km mensal / km adicional / franquia por modelo (TVDE - Base)
-- ============================================================
-- Continuação de 20260714120000 (que só restaurou preco_semana). Estes 3
-- campos nunca tinham sido lidos nesta sessão antes da perda de dados de
-- 14/07 09:09 UTC, por isso não havia registo deles para restaurar.
--
-- Fonte: foto da "Tabela de Preços TVDE" (Distância Arrojada) fornecida
-- pelo utilizador em 14/07/2026, conferida modelo a modelo com o que já
-- estava restaurado. Confirmado explicitamente pelo utilizador.
--
-- Duas correções de preco_semana onde a tabela em papel divergia do valor
-- já restaurado (jogger 7Lug. e ë-C4) — confirmadas pelo utilizador.
--
-- GLB não consta da tabela em papel — fica sem km/franquia (por preencher
-- manualmente quando houver fonte).
-- ============================================================

UPDATE public.renting_tarifa_precos_modelo
   SET km_mensal = v.km_mensal, km_adicional_valor = v.km_adicional_valor,
       franquia_valor = v.franquia_valor, updated_at = now()
  FROM (VALUES
    ('ca9ad30a-2da7-45c1-bdfc-5482c4fc3a0c'::uuid, 7500, 0.20, 3690.00), -- 116d / 118d
    ('4537eb9e-6400-4b2d-b036-f093a4b20acf'::uuid, 7500, 0.20, 3690.00), -- 216d / 218d
    ('a7bb82e3-6d11-4f0f-a469-249726afbcd1'::uuid, 6500, 0.21, 7995.00), -- 530e (versão gasóleo, é a que bate com o preço já gravado)
    ('385e4479-cb21-465c-af77-c5631bb0b64e'::uuid, 9000, 0.21, 6150.00), -- Model 3
    ('d4d73adb-5278-4879-a363-1a78b83b23a3'::uuid, 12000, 0.20, 3075.00), -- Leon
    ('4cac9cbc-eb69-4683-9b3d-9efe2f67c24b'::uuid, 12000, 0.19, 2829.00), -- Clio
    ('fcc928ba-49df-4935-9064-6eb72a8a4fe0'::uuid, 10000, 0.19, 2337.00), -- Panda
    ('11500422-16cb-44d1-95d1-e6343508ce67'::uuid, 12000, 0.19, 2250.00), -- Corsa
    ('72a01cef-7109-4dfd-98c4-b9dd767b386c'::uuid, 7500, 0.21, 4500.00), -- CLA
    ('2170a894-456e-4fff-8f0e-8a6563ed9d31'::uuid, 6500, 0.20, 3690.00), -- Classe A
    ('6becdc35-a793-4a5b-9e70-db876a4fdb57'::uuid, 6500, 0.21, 4500.00), -- C300de
    ('2309abfc-8edc-4a28-8040-a92078def01b'::uuid, 10000, 0.20, 3337.00), -- Grande Panda
    ('9080a808-918c-4ae7-baa4-ec4bf0ee810e'::uuid, 10000, 0.19, 2829.00), -- Tipo
    ('b3876d01-60fa-4230-baca-6652552ba5d0'::uuid, 9000, 0.19, 1600.00), -- Megane
    ('361e1f39-dff4-4790-a1b9-d9c47633affa'::uuid, 10000, 0.19, 2829.00), -- LEAF
    ('f0507bdb-79f6-4970-b9a3-b07421ce0f47'::uuid, 12000, 0.21, 5535.00), -- Qasqai
    ('7556cb87-ff7d-45cf-8ea6-b71237bd18c2'::uuid, 12000, 0.20, 3690.00), -- Ceed SW
    ('682e54df-d801-4e2d-a93f-31ba7c3dc870'::uuid, 7500, 0.20, 3075.00), -- jogger 7Lug.
    ('2feaf483-a7e8-432b-a650-2e10c9ed99bc'::uuid, 10000, 0.20, 3075.00), -- 2008
    ('671598d7-6e3e-40f1-87b1-55d352ceb8f5'::uuid, 10000, 0.20, 3075.00), -- Astra e
    ('2d2d0523-8cd3-40b4-bad7-0069e4a8d919'::uuid, 12000, 0.20, 3075.00), -- C4
    ('678cf4d0-ebb3-458e-9ce9-f9be73633a30'::uuid, 12000, 0.20, 3075.00), -- ë-C4
    ('ebcfd4ba-f1e9-424b-af68-17ea31c4d7ae'::uuid, 6500, 0.20, 3690.00), -- Classe A 180 / 200
    ('3c2eaa2d-5ad5-46ef-8642-aede0aa58e3d'::uuid, 6500, 0.21, 4500.00), -- Classe C 300 de
    ('6d76066f-b297-4f62-9064-38401763746c'::uuid, 6500, 0.21, 5535.00), -- V-Klasse
    ('d31474ad-57b1-4538-a7fd-b041733bf998'::uuid, 6500, 0.21, 5535.00), -- Vito
    ('a0c3217a-751c-447e-9e47-3efbd4c20734'::uuid, 12000, 0.21, 5535.00), -- Qashqai
    ('69c2ea77-193b-4dc3-9f67-0f950a8a5831'::uuid, 12000, 0.19, 2829.00), -- Astra
    ('5f279d6b-5a3d-46fa-8fa1-60c5217cbedb'::uuid, 10000, 0.20, 3075.00), -- Grandland
    ('902536cb-2889-427a-a9a1-88ab386a7248'::uuid, 9000, 0.20, 3075.00), -- Mokka-e
    ('5c76656d-bd5b-414a-82b9-bca19ded0321'::uuid, 6000, 0.19, 2829.00), -- 208
    ('e9b8e96f-57de-44d4-a3ac-38f5e6a70baf'::uuid, 9000, 0.20, 3075.00), -- 308
    ('ca0d038f-d606-4945-9045-fc0723e89c5b'::uuid, 6000, 0.20, 3075.00)  -- e-308
  ) AS v(modelo_id, km_mensal, km_adicional_valor, franquia_valor)
 WHERE renting_tarifa_precos_modelo.tarifa_id = '5d1d0427-e73b-47bc-b686-5bedc7b8ef03'
   AND renting_tarifa_precos_modelo.modelo_id = v.modelo_id;

-- Correções de preco_semana (papel diverge do que estava restaurado) —
-- confirmadas pelo utilizador.
UPDATE public.renting_tarifa_precos_modelo
   SET preco_semana = 300.00, updated_at = now()
 WHERE tarifa_id = '5d1d0427-e73b-47bc-b686-5bedc7b8ef03'
   AND modelo_id = '682e54df-d801-4e2d-a93f-31ba7c3dc870'; -- jogger 7Lug.: 275 → 300

UPDATE public.renting_tarifa_precos_modelo
   SET preco_semana = 275.00, updated_at = now()
 WHERE tarifa_id = '5d1d0427-e73b-47bc-b686-5bedc7b8ef03'
   AND modelo_id = '678cf4d0-ebb3-458e-9ce9-f9be73633a30'; -- ë-C4: 300 → 275

-- Caução também muda para os 2 modelos corrigidos (regra: caução = preço/semana).
UPDATE public.renting_tarifa_precos_modelo
   SET caucao_valor = preco_semana, updated_at = now()
 WHERE tarifa_id = '5d1d0427-e73b-47bc-b686-5bedc7b8ef03'
   AND modelo_id IN ('682e54df-d801-4e2d-a93f-31ba7c3dc870', '678cf4d0-ebb3-458e-9ce9-f9be73633a30');
