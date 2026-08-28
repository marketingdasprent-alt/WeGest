-- supabase/migrations/20260730120000_nota_credito_visivel_sobre_cobranca_anulada.sql
-- ============================================================
-- NC sobre cobrança anulada: visível na Faturação, sem duplicar o saldo
-- ============================================================
-- Achado ao testar manualmente (30/07/2026): a correção anterior
-- (20260730110000) evitava corretamente o duplo crédito saltando o
-- lançamento em conta_movimentos quando a cobrança já estava anulada — mas
-- isso deixava a NC invisível na aba Faturação (que é só uma vista sobre
-- conta_movimentos). O utilizador emitiu a NC com sucesso no KeyInvoice mas
-- não a via ali.
--
-- Corrigido lançando um PAR que se anula (crédito + débito do mesmo valor,
-- ambos ligados a esta nota_credito_id) — mesmo padrão já usado para
-- "Anulamento de Factura" + "Factura": duas linhas visíveis no livro-razão
-- que se cancelam no saldo, em vez de escondidas.
--
-- A reversão ("anular esta NC" mais tarde) passa a inverter TODOS os
-- lançamentos que a criação fez (1 no caso normal, 2 neste caso), em vez de
-- assumir sempre 1 — para continuar correta nos dois casos.

CREATE OR REPLACE FUNCTION public.fn_nota_credito_posta_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cobranca_estado text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ativo' THEN
      SELECT estado INTO v_cobranca_estado
        FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id;

      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, data_movimento, tipo, valor, origem,
         nota_credito_id, cobranca_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.entidade_id, NEW.data_nota, 'credito', NEW.valor, 'nota_credito',
         NEW.id, NEW.cobranca_id, NEW.contrato_id,
         'Nota de Crédito Nº ' || NEW.codigo || ' — ' || NEW.motivo);

      IF v_cobranca_estado IS NOT DISTINCT FROM 'anulada' THEN
        INSERT INTO public.conta_movimentos
          (org_id, entidade_id, data_movimento, tipo, valor, origem,
           nota_credito_id, cobranca_id, contrato_id, descricao)
        VALUES
          (NEW.org_id, NEW.entidade_id, NEW.data_nota, 'debito', NEW.valor, 'nota_credito',
           NEW.id, NEW.cobranca_id, NEW.contrato_id,
           'Nota de Crédito Nº ' || NEW.codigo || ' — sem efeito adicional no saldo (fatura já anulada)');
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'ativo' AND NEW.estado = 'anulado' THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, nota_credito_id, cobranca_id, contrato_id, descricao)
    SELECT
      NEW.org_id, NEW.entidade_id,
      CASE WHEN cm.tipo = 'credito' THEN 'debito' ELSE 'credito' END,
      cm.valor, 'nota_credito', NEW.id, NEW.cobranca_id, NEW.contrato_id,
      'Estorno de nota de crédito anulada'
    FROM public.conta_movimentos cm
    WHERE cm.nota_credito_id = NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_nota_credito_posta_movimento() IS
  'Posta o(s) lançamento(s) da NC em conta_movimentos. Cobrança normal: 1 '
  'crédito. Cobrança já anulada: crédito + débito do mesmo valor (visível '
  'no livro-razão, sem efeito no saldo — o anulamento já tinha creditado o '
  'titular). Anular a NC inverte todos os lançamentos que a criação fez.';
