-- supabase/migrations/20260730190000_nota_credito_sobre_fatura_cedida.sql
-- ============================================================
-- Nota de crédito sobre uma fatura cedida a um motorista
-- ============================================================
-- Reportado pelo utilizador (30/07/2026): no perfil do motorista (vista
-- de staff) a nota de crédito não aparece.
--
-- A causa é mais grave do que só não aparecer: fn_nota_credito_posta_movimento
-- credita sempre `notas_credito.entidade_id` (o cliente titular, destinatário
-- fiscal) e nunca olha para contrato_cobrancas.responsavel_motorista_id. Numa
-- fatura cedida a um motorista o razão ficava assim:
--
--   titular   : débito 225 (cobrança) + crédito 225 (cessão)        = 0
--   motorista : débito 225                                          = deve 225
--   NC de 225 : crédito 225 ao titular                              → titular +225 (credor!)
--                                                                     motorista continua a dever 225
--
-- Ou seja: o valor era creditado a quem já não devia nada, e quem devia
-- continuava a dever. Esta migração faz a NC seguir a dívida.
--
-- O padrão do par crédito+débito que se auto-cancela no titular já é o
-- usado nesta mesma função para uma cobrança já anulada (mantém a NC
-- VISÍVEL no extrato sem a contar duas vezes) — aqui reaproveita-se para o
-- mesmo efeito, e o crédito real vai para motorista_financeiro.

CREATE OR REPLACE FUNCTION public.fn_nota_credito_posta_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cobranca_estado text;
  v_motorista       uuid;
  v_precisa_par     boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ativo' THEN
      SELECT estado, responsavel_motorista_id
        INTO v_cobranca_estado, v_motorista
        FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id;

      -- O titular precisa de um débito a anular o crédito quando o crédito
      -- não lhe pertence de facto: ou porque a fatura já foi anulada (já foi
      -- creditado uma vez pelo anulamento), ou porque a dívida está cedida a
      -- um motorista (o titular já está a zero desde a cessão). Um único par
      -- nos dois casos — nunca dois débitos.
      v_precisa_par := (v_cobranca_estado IS NOT DISTINCT FROM 'anulada')
                       OR (v_motorista IS NOT NULL);

      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, data_movimento, tipo, valor, origem,
         nota_credito_id, cobranca_id, contrato_id, descricao)
      VALUES
        (NEW.org_id, NEW.entidade_id, NEW.data_nota, 'credito', NEW.valor, 'nota_credito',
         NEW.id, NEW.cobranca_id, NEW.contrato_id,
         'Nota de Crédito Nº ' || NEW.codigo || ' — ' || NEW.motivo);

      IF v_precisa_par THEN
        INSERT INTO public.conta_movimentos
          (org_id, entidade_id, data_movimento, tipo, valor, origem,
           nota_credito_id, cobranca_id, contrato_id, descricao)
        VALUES
          (NEW.org_id, NEW.entidade_id, NEW.data_nota, 'debito', NEW.valor, 'nota_credito',
           NEW.id, NEW.cobranca_id, NEW.contrato_id,
           'Nota de Crédito Nº ' || NEW.codigo || ' — ' ||
           CASE WHEN v_motorista IS NOT NULL
                THEN 'creditada ao motorista responsável (dívida cedida)'
                ELSE 'sem efeito adicional no saldo (fatura já anulada)' END);
      END IF;

      -- A NC segue a dívida: quem a deve é o motorista, é ele que tem de
      -- ser creditado. Sem isto a NC nunca aparecia no perfil dele e a
      -- dívida ficava por baixar.
      IF v_motorista IS NOT NULL THEN
        INSERT INTO public.motorista_financeiro
          (org_id, motorista_id, tipo, categoria, descricao, valor,
           data_movimento, status, cobranca_id)
        VALUES
          (NEW.org_id, v_motorista, 'credito', 'outro',
           'Nota de Crédito Nº ' || NEW.codigo || ' — ' || NEW.motivo,
           NEW.valor, NEW.data_nota, 'pendente', NEW.cobranca_id);
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

    -- Simétrico do INSERT: se a dívida está cedida, anular a NC devolve-a
    -- ao motorista. Sem isto o motorista ficava creditado para sempre por
    -- uma nota de crédito que já não existe.
    SELECT responsavel_motorista_id INTO v_motorista
      FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id;
    IF v_motorista IS NOT NULL THEN
      INSERT INTO public.motorista_financeiro
        (org_id, motorista_id, tipo, categoria, descricao, valor,
         data_movimento, status, cobranca_id)
      VALUES
        (NEW.org_id, v_motorista, 'debito', 'outro',
         'Estorno — nota de crédito Nº ' || NEW.codigo || ' anulada',
         NEW.valor, current_date, 'pendente', NEW.cobranca_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_nota_credito_posta_movimento() IS
  'Lança a nota de crédito na conta-corrente. Quando a fatura está cedida a '
  'um motorista, o crédito real vai para motorista_financeiro (é ele que '
  'deve) e o titular leva um par crédito+débito que se auto-cancela, para a '
  'NC continuar visível no extrato sem alterar um saldo que já estava a zero.';
