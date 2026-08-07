-- ============================================================
-- Restauro #2: preços por modelo da tarifa TVDE - Base
-- ============================================================
-- SEGUNDA perda de dados na mesma tarifa (a primeira foi a 2026-07-14,
-- ver 20260714120000_restaura_precos_modelo_tvde_base.sql).
--
-- Cronologia estabelecida a 2026-08-07:
--   • 11:17 (Lisboa) — a reserva #853 (Nissan Qashqai) ainda copiou da
--     tarifa 225 €/sem, 12.000 km, franquia 5.535 €. Os preços existiam.
--   • algures até às 17:13 — a tabela ficou a ZERO linhas.
--   • 17:13 — o utilizador, ao dar pela falta, gravou 1 linha (Grande
--     Panda) que ficou a ser a única existente.
--
-- Causa: `salvar_precos_modelo_tarifa` faz DELETE de todas as linhas da
-- tarifa e reinsere apenas o que o browser envia. O formulário constrói
-- essa lista a partir de um estado React que começa VAZIO e só é
-- preenchido quando a query dos preços responde (RentingTarifaForm.tsx,
-- `if (!precosModeloDb.length) return;`). Gravar antes disso apaga tudo,
-- sem aviso e com o toast a dizer "Tarifa actualizada".
--
-- FONTE DOS VALORES (não havendo auditoria nesta tabela):
--   1. `valor_total` da reserva TVDE mais recente de cada modelo anterior
--      ao apagamento — é o preço/semana copiado da linha do modelo.
--      15 modelos. Marcados [reserva] abaixo.
--   2. Lista de 14/07, validada pelo utilizador na altura, para os
--      modelos sem reserva recente. Marcados [14/07].
--   3. km / km adicional / franquia: snapshot mais recente de
--      reserva ou contrato; na falta dele, os valores de 14/07.
--   4. caucao_valor = preco_semana — regra do negócio confirmada pelo
--      utilizador em 14/07 (ver 20260714095652_restaura_caucao_tvde_base).
--
-- VALIDAÇÃO DO MÉTODO: as duas correcções que o utilizador confirmou à
-- mão em 14/07 (jogger 7Lug. → 300, ë-C4 → 275) são exactamente o que
-- esta reconstrução deriva das reservas, de forma independente.
--
-- Autorizado explicitamente pelo utilizador em 2026-08-07.
--
-- NOTA: Mercedes GLB fica sem km/franquia — nunca teve (já era assim
-- em 14/07, o modelo não consta da tabela em papel).
-- ============================================================

BEGIN;

DELETE FROM public.renting_tarifa_precos_modelo
 WHERE tarifa_id = '5d1d0427-e73b-47bc-b686-5bedc7b8ef03';

INSERT INTO public.renting_tarifa_precos_modelo
  (org_id, tarifa_id, modelo_id, preco_semana, caucao_valor,
   km_mensal, km_adicional_valor, franquia_valor)
SELECT '11111111-1111-1111-1111-111111111111',
       '5d1d0427-e73b-47bc-b686-5bedc7b8ef03',
       v.modelo_id, v.preco, v.preco, v.km, v.kmadd, v.franquia
  FROM (VALUES
    ('ca9ad30a-2da7-45c1-bdfc-5482c4fc3a0c'::uuid, 300.00, 7500, 0.20, 3690.00),  -- BMW 116d / 118d          [reserva]
    ('4537eb9e-6400-4b2d-b036-f093a4b20acf'::uuid, 300.00, 7500, 0.20, 3690.00),  -- BMW 216d / 218d          [14/07]
    ('a7bb82e3-6d11-4f0f-a469-249726afbcd1'::uuid, 475.00, 6500, 0.21, 7995.00),  -- BMW 530e                 [14/07]
    ('2d2d0523-8cd3-40b4-bad7-0069e4a8d919'::uuid, 275.00, 6500, 0.20, 4500.00),  -- Citroen C4               [reserva]
    ('678cf4d0-ebb3-458e-9ce9-f9be73633a30'::uuid, 275.00, 12000, 0.20, 3075.00), -- Citroen e-C4             [reserva]
    ('682e54df-d801-4e2d-a93f-31ba7c3dc870'::uuid, 300.00, 12000, 0.19, 2829.00), -- Dacia Jogger 7Lug.       [reserva]
    ('2309abfc-8edc-4a28-8040-a92078def01b'::uuid, 275.00, 10000, 0.20, 3337.00), -- Fiat Grande Panda        [reserva]
    ('fcc928ba-49df-4935-9064-6eb72a8a4fe0'::uuid, 175.00, 10000, 0.19, 2337.00), -- Fiat Panda               [reserva]
    ('9080a808-918c-4ae7-baa4-ec4bf0ee810e'::uuid, 250.00, 10000, 0.19, 2829.00), -- Fiat Tipo                [14/07]
    ('7556cb87-ff7d-45cf-8ea6-b71237bd18c2'::uuid, 275.00, 6500, 0.21, 5535.00),  -- Kia Ceed SW              [14/07]
    ('6becdc35-a793-4a5b-9e70-db876a4fdb57'::uuid, 500.00, 6500, 0.20, 4500.00),  -- Mercedes C300de          [14/07]
    ('72a01cef-7109-4dfd-98c4-b9dd767b386c'::uuid, 400.00, 7500, 0.21, 4500.00),  -- Mercedes CLA             [14/07]
    ('2170a894-456e-4fff-8f0e-8a6563ed9d31'::uuid, 300.00, 6500, 0.20, 3690.00),  -- Mercedes Classe A        [reserva]
    ('ebcfd4ba-f1e9-424b-af68-17ea31c4d7ae'::uuid, 300.00, 7500, 0.36, 3690.00),  -- Mercedes Classe A 180/200[reserva]
    ('3c2eaa2d-5ad5-46ef-8642-aede0aa58e3d'::uuid, 500.00, 6500, 0.21, 4500.00),  -- Mercedes Classe C 300 de [14/07]
    ('fbd5164a-a922-4890-9244-edace312b4a9'::uuid, 475.00, NULL, NULL, NULL),     -- Mercedes GLB             [14/07]
    ('6d76066f-b297-4f62-9064-38401763746c'::uuid, 500.00, 6500, 0.21, 5535.00),  -- Mercedes V-Klasse        [14/07]
    ('d31474ad-57b1-4538-a7fd-b041733bf998'::uuid, 549.99, 6500, 0.21, 5535.00),  -- Mercedes Vito            [14/07]
    ('361e1f39-dff4-4790-a1b9-d9c47633affa'::uuid, 250.00, 10000, 0.19, 2829.00), -- Nissan LEAF              [14/07]
    ('a0c3217a-751c-447e-9e47-3efbd4c20734'::uuid, 225.00, 12000, 0.21, 5535.00), -- Nissan Qashqai           [reserva]
    ('f0507bdb-79f6-4970-b9a3-b07421ce0f47'::uuid, 225.00, 12000, 0.21, 5535.00), -- Nissan Qasqai            [14/07]
    ('69c2ea77-193b-4dc3-9f67-0f950a8a5831'::uuid, 275.00, 12000, 0.19, 2829.00), -- Opel Astra               [reserva]
    ('671598d7-6e3e-40f1-87b1-55d352ceb8f5'::uuid, 325.00, 10000, 0.20, 3075.00), -- Opel Astra e             [reserva]
    ('11500422-16cb-44d1-95d1-e6343508ce67'::uuid, 224.99, 12000, 0.19, 2250.00), -- Opel Corsa               [14/07]
    ('61d8ae59-8ff6-4069-8afb-a635e2407786'::uuid, 275.00, 12000, 0.19, 2250.00), -- Opel Corsa E             [caucao]
    ('5f279d6b-5a3d-46fa-8fa1-60c5217cbedb'::uuid, 300.00, 10000, 0.20, 3075.00), -- Opel Grandland           [14/07]
    ('902536cb-2889-427a-a9a1-88ab386a7248'::uuid, 300.00, 9000, 0.20, 3075.00),  -- Opel Mokka-e             [14/07]
    ('2feaf483-a7e8-432b-a650-2e10c9ed99bc'::uuid, 300.00, 10000, 0.20, 3075.00), -- Peugeot 2008             [reserva]
    ('5c76656d-bd5b-414a-82b9-bca19ded0321'::uuid, 200.00, 6000, 0.19, 2829.00),  -- Peugeot 208              [14/07]
    ('e9b8e96f-57de-44d4-a3ac-38f5e6a70baf'::uuid, 375.00, 9000, 0.20, 3075.00),  -- Peugeot 308              [14/07]
    ('ca0d038f-d606-4945-9045-fc0723e89c5b'::uuid, 325.00, 10000, 0.20, 3075.00), -- Peugeot e-308            [caucao]
    ('4cac9cbc-eb69-4683-9b3d-9efe2f67c24b'::uuid, 225.00, 12000, 0.19, 2829.00), -- Renault Clio             [14/07]
    ('b3876d01-60fa-4230-baca-6652552ba5d0'::uuid, 225.00, 9000, 0.19, 1600.00),  -- Renault Megane           [reserva]
    ('d4d73adb-5278-4879-a363-1a78b83b23a3'::uuid, 275.00, 12000, 0.20, 3075.00), -- Seat Leon                [reserva]
    ('385e4479-cb21-465c-af77-c5631bb0b64e'::uuid, 375.00, 9000, 0.21, 6150.00)   -- Tesla Model 3            [reserva]
  ) AS v(modelo_id, preco, km, kmadd, franquia);

-- Salvaguarda: se o número de linhas não for o esperado, aborta tudo.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.renting_tarifa_precos_modelo
   WHERE tarifa_id = '5d1d0427-e73b-47bc-b686-5bedc7b8ef03';
  IF n <> 35 THEN
    RAISE EXCEPTION 'Restauro TVDE - Base: esperadas 35 linhas, obtidas %', n;
  END IF;
END $$;

COMMIT;
