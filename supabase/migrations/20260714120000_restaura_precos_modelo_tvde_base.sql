-- ============================================================
-- Restauro: preços por modelo da tarifa TVDE - Base
-- ============================================================
-- A tarifa TVDE - Base (id 5d1d0427-e73b-47bc-b686-5bedc7b8ef03) teve o
-- campo `tipo` alterado de 'tvde' para 'renting' às 09:09:48 UTC de
-- 2026-07-14 e, no mesmo instante, as 34 linhas de
-- renting_tarifa_precos_modelo foram substituídas por 1 única linha lixo
-- (modelo "#1", preco_semana NULL) — provável efeito de gravar o
-- formulário de tarifa enquanto a secção de preços por modelo não estava
-- visível (por o tipo já não ser 'tvde' nesse momento).
--
-- Restaura os 34 pares (modelo, preço/semana) capturados numa leitura
-- anterior, na mesma sessão, antes da perda de dados. Autorizado
-- explicitamente pelo utilizador em 14/07/2026.
-- ============================================================

-- Remove a linha lixo criada pela gravação acidental.
DELETE FROM public.renting_tarifa_precos_modelo
WHERE tarifa_id = '5d1d0427-e73b-47bc-b686-5bedc7b8ef03'
  AND preco_semana IS NULL;

INSERT INTO public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_semana)
VALUES
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'ca9ad30a-2da7-45c1-bdfc-5482c4fc3a0c', 300.00), -- 116d / 118d
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '4537eb9e-6400-4b2d-b036-f093a4b20acf', 300.00), -- 216d / 218d
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'a7bb82e3-6d11-4f0f-a469-249726afbcd1', 475.00), -- 530e
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '385e4479-cb21-465c-af77-c5631bb0b64e', 375.00), -- Model 3
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'd4d73adb-5278-4879-a363-1a78b83b23a3', 275.00), -- Leon
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '4cac9cbc-eb69-4683-9b3d-9efe2f67c24b', 225.00), -- Clio
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'fcc928ba-49df-4935-9064-6eb72a8a4fe0', 175.00), -- Panda
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '11500422-16cb-44d1-95d1-e6343508ce67', 224.99), -- Corsa
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '72a01cef-7109-4dfd-98c4-b9dd767b386c', 400.00), -- CLA
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '2170a894-456e-4fff-8f0e-8a6563ed9d31', 300.00), -- Classe A
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '6becdc35-a793-4a5b-9e70-db876a4fdb57', 500.00), -- C300de
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '2309abfc-8edc-4a28-8040-a92078def01b', 275.00), -- Grande Panda
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '9080a808-918c-4ae7-baa4-ec4bf0ee810e', 250.00), -- Tipo
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'b3876d01-60fa-4230-baca-6652552ba5d0', 225.00), -- Megane
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '361e1f39-dff4-4790-a1b9-d9c47633affa', 250.00), -- LEAF
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'f0507bdb-79f6-4970-b9a3-b07421ce0f47', 225.00), -- Qasqai
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '7556cb87-ff7d-45cf-8ea6-b71237bd18c2', 275.00), -- Ceed SW
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '682e54df-d801-4e2d-a93f-31ba7c3dc870', 275.00), -- jogger 7Lug.
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '2feaf483-a7e8-432b-a650-2e10c9ed99bc', 300.00), -- 2008
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '671598d7-6e3e-40f1-87b1-55d352ceb8f5', 325.00), -- Astra e
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '2d2d0523-8cd3-40b4-bad7-0069e4a8d919', 275.00), -- C4
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '678cf4d0-ebb3-458e-9ce9-f9be73633a30', 300.00), -- ë-C4
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'ebcfd4ba-f1e9-424b-af68-17ea31c4d7ae', 300.00), -- Classe A 180 / 200
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '3c2eaa2d-5ad5-46ef-8642-aede0aa58e3d', 500.00), -- Classe C 300 de
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'fbd5164a-a922-4890-9244-edace312b4a9', 475.00), -- GLB
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '6d76066f-b297-4f62-9064-38401763746c', 500.00), -- V-Klasse
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'd31474ad-57b1-4538-a7fd-b041733bf998', 549.99), -- Vito
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'a0c3217a-751c-447e-9e47-3efbd4c20734', 225.00), -- Qashqai
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '69c2ea77-193b-4dc3-9f67-0f950a8a5831', 275.00), -- Astra
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '5f279d6b-5a3d-46fa-8fa1-60c5217cbedb', 300.00), -- Grandland
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '902536cb-2889-427a-a9a1-88ab386a7248', 300.00), -- Mokka-e
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', '5c76656d-bd5b-414a-82b9-bca19ded0321', 200.00), -- 208
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'e9b8e96f-57de-44d4-a3ac-38f5e6a70baf', 375.00), -- 308
  ('11111111-1111-1111-1111-111111111111', '5d1d0427-e73b-47bc-b686-5bedc7b8ef03', 'ca0d038f-d606-4945-9045-fc0723e89c5b', 325.00)  -- e-308
ON CONFLICT (tarifa_id, modelo_id) DO UPDATE
  SET preco_semana = EXCLUDED.preco_semana;
