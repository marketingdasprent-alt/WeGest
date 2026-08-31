-- ============================================================
-- Assinaturas: o link deixa de expirar
-- ============================================================
-- Primeiro passo de duas migrações do mesmo dia, e fica aqui porque foi
-- aplicada em produção — um ficheiro que falte é deriva silenciosa, e o
-- `scripts/verificar-migracoes.mjs` existe por causa disso.
--
-- O prazo (`expires_at`) deixou de ser aplicado: um pedido antigo continua a
-- poder ser assinado. A coluna fica, como registo de quando o pedido foi feito.
--
-- A coluna `assinaturas_total` nasceu aqui para um desenho em que o MESMO link
-- aceitava assinaturas repetidas. Esse desenho foi corrigido no mesmo dia — o
-- link passou a ser de uma só utilização — e a migração seguinte
-- (20260831120000_assinatura_link_uma_utilizacao) volta a removê-la. Fica aqui
-- na mesma, para o histórico do repositório corresponder ao que a base de dados
-- viu acontecer.
ALTER TABLE public.documento_assinatura_pedidos
  ADD COLUMN IF NOT EXISTS assinaturas_total integer NOT NULL DEFAULT 0;
