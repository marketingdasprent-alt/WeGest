-- ============================================================
-- bolt_viagens: a referência é única POR FROTA, não globalmente
-- ============================================================
-- A tabela tinha UNIQUE(order_reference) global. Se duas frotas Bolt alguma
-- vez emitissem a mesma referência, o upsert do sync fazia UPDATE em vez de
-- INSERT e a viagem de uma frota passava a ter os dados da outra — em
-- silêncio, sem erro nenhum.
--
-- Hoje não há colisões (818.927 viagens, 0 referências em duas frotas), por
-- isso a mudança é segura. Mas a garantia certa é por integração: a Bolt não
-- promete referências únicas entre empresas diferentes, e nós tratávamos isso
-- como se prometesse.
--
-- Feito em 3 passos para não partir um sync em voo:
--   1. criar o índice novo (os dois coexistem, o antigo é mais estrito);
--   2. o código passa a arbitrar por (integracao_id, order_reference);
--   3. largar o UNIQUE global.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS bolt_viagens_ref_por_integracao
  ON public.bolt_viagens (integracao_id, order_reference);

COMMENT ON INDEX public.bolt_viagens_ref_por_integracao IS
  'Uma order_reference é única DENTRO de cada frota Bolt. Substitui o UNIQUE '
  'global, que deixava uma frota sobrepor a viagem de outra.';

ALTER TABLE public.bolt_viagens DROP CONSTRAINT IF EXISTS bolt_viagens_order_reference_key;

COMMENT ON TABLE public.bolt_viagens IS
  'Uma linha por viagem da Bolt. Unicidade por (integracao_id, order_reference) — '
  'até 2026-08-13 era só por order_reference, global, o que deixava duas frotas '
  'colidir. driver_earnings e total_price ficam a NULL de propósito (modo sombra).';
