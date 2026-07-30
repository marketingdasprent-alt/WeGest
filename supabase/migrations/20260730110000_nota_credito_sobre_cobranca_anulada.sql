-- supabase/migrations/20260730110000_nota_credito_sobre_cobranca_anulada.sql
-- ============================================================
-- Permite Nota de Crédito sobre uma cobrança já anulada internamente
-- ============================================================
-- Achado ao testar manualmente (30/07/2026): "Anular faturação" (bulk, aba
-- Faturar do contrato) só reverte o registo INTERNO — o próprio diálogo já
-- avisa "não cancela o documento fiscal no software de faturação; se já
-- tiver sido emitido um documento certificado, faça a reversão fiscal (NC)
-- separadamente" (correto: uma fatura certificada não pode ser apagada, só
-- uma Nota de Crédito reverte o efeito no KeyInvoice). Mas essa reversão
-- separada era IMPOSSÍVEL na prática: fn_nota_credito_valida só aceitava NC
-- sobre cobrança 'emitida'/'paga', e anularCobrancasFaturacao já tinha posto
-- a cobrança em 'anulada' antes de o utilizador conseguir sequer chegar ao
-- diálogo de NC. O próprio conselho do diálogo era impossível de seguir.
--
-- anularCobrancasFaturacao só transiciona 'emitida'/'paga' → 'anulada'
-- (nunca a partir de outro estado) — por isso uma cobrança 'anulada' teve
-- sempre, garantidamente, uma fatura fiscal real por creditar.

CREATE OR REPLACE FUNCTION public.fn_nota_credito_valida()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cob public.contrato_cobrancas%ROWTYPE;
  v_ja  numeric;
BEGIN
  SELECT * INTO v_cob FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança % não encontrada.', NEW.cobranca_id;
  END IF;

  NEW.org_id      := v_cob.org_id;
  NEW.entidade_id := v_cob.destinatario_id;
  NEW.contrato_id := v_cob.contrato_id;

  IF v_cob.estado NOT IN ('emitida', 'paga', 'anulada') THEN
    RAISE EXCEPTION
      'Só é possível emitir nota de crédito sobre uma cobrança emitida ou paga (estado atual: %).',
      v_cob.estado;
  END IF;

  IF NOT v_cob.emite_fatura_fiscal THEN
    RAISE EXCEPTION
      'Nota de crédito só é aplicável a cobranças com fatura fiscal (cobrança interna não tem fatura a retificar).';
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_ja
    FROM public.notas_credito
    WHERE cobranca_id = NEW.cobranca_id AND estado = 'ativo';

  IF NEW.valor > (v_cob.valor_total - v_ja) + 0.005 THEN
    RAISE EXCEPTION
      'Valor da nota de crédito (%) excede o saldo por creditar da cobrança (%).',
      NEW.valor, round(v_cob.valor_total - v_ja, 2);
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Não duplicar o crédito interno quando a cobrança já está anulada: o
-- "Anulamento de Factura" da anulação interna já creditou o titular pelo
-- valor total — postar TAMBÉM o crédito desta NC deixaria o cliente "a
-- haver" em vez de a zero. Nesse caso a NC serve só para o registo fiscal
-- (o documento no KeyInvoice), não repete o lançamento interno já feito.
-- Espelhado no sentido inverso: anular esta NC só estorna se ela chegou a
-- lançar um crédito.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_nota_credito_posta_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cobranca_estado text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ativo' THEN
      SELECT estado INTO v_cobranca_estado
        FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id;

      IF v_cobranca_estado IS DISTINCT FROM 'anulada' THEN
        INSERT INTO public.conta_movimentos
          (org_id, entidade_id, data_movimento, tipo, valor, origem,
           nota_credito_id, cobranca_id, contrato_id, descricao)
        VALUES
          (NEW.org_id, NEW.entidade_id, NEW.data_nota, 'credito', NEW.valor, 'nota_credito',
           NEW.id, NEW.cobranca_id, NEW.contrato_id,
           'Nota de Crédito Nº ' || NEW.codigo || ' — ' || NEW.motivo);
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'ativo' AND NEW.estado = 'anulado' THEN
    IF EXISTS (
      SELECT 1 FROM public.conta_movimentos
       WHERE nota_credito_id = NEW.id AND tipo = 'credito'
    ) THEN
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem,
         nota_credito_id, cobranca_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.entidade_id, 'debito', NEW.valor, 'nota_credito',
         NEW.id, NEW.cobranca_id, NEW.contrato_id, 'Estorno de nota de crédito anulada');
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_nota_credito_valida() IS
  'Valida uma Nota de Crédito: cobrança emitida/paga/anulada (uma cobrança só '
  'chega a anulada vindo de emitida/paga — teve sempre fatura fiscal real), '
  'com fatura fiscal, e valor dentro do saldo por creditar.';

COMMENT ON FUNCTION public.fn_nota_credito_posta_movimento() IS
  'Posta o crédito/estorno da NC em conta_movimentos — SALTA o lançamento '
  'quando a cobrança já está anulada internamente (o anulamento já creditou '
  'o titular; esta NC é só o registo fiscal/KeyInvoice, não um crédito extra).';
