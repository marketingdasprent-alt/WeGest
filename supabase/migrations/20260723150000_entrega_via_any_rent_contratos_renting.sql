-- ============================================================
-- Flag: contrato entregue via atalho "Any Rent" (marcarRealizacaoDireta)
-- ============================================================
-- O botão "Any Rent" em ContratoForm.tsx marca a entrega como realizada
-- sem passar pelo check-in (fotos/km/combustível/bateria) — usado para
-- contratos migrados de outro sistema onde essa informação nunca existiu.
-- Isso deixa km_saida/combustivel_saida/eletricidade_saida NULL para
-- sempre. Esta coluna identifica esses contratos para que a UI possa
-- oferecer um preenchimento manual só a eles (ver
-- AnyRentDadosSaidaAlert.tsx), sem afectar contratos entregues pelo fluxo
-- normal de check-in.
--
-- Deploy: aplicar à mão no SQL editor (CI não faz db push).
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS entrega_via_any_rent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contratos_renting.entrega_via_any_rent IS
  'true quando a entrega foi marcada via o atalho "Any Rent" (sem check-in) — usado para restringir o preenchimento manual de km/combustível/bateria de saída só a estes contratos.';
