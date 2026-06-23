-- ============================================================
-- Regime SLOT — 3º valor do enum de regime
-- ============================================================
-- O motorista usa carro PRÓPRIO e paga semanalmente à empresa para
-- trabalhar como TVDE sob a sua licença. A reserva SLOT:
--   • NÃO se transforma em contratos_renting (fica só como reserva)
--   • é aberta (sem data_fim), cobrada semanalmente, por carro
--   • o contrato de prestação de serviços vive em contratos_prestacao
--
-- Nota: ADD VALUE a um enum NÃO pode ser usado na mesma transação em
-- que o valor é consumido — por isso esta migration é ISOLADA.
-- Idempotente via IF NOT EXISTS.
-- ============================================================

ALTER TYPE public.contrato_regime_enum ADD VALUE IF NOT EXISTS 'slot';
