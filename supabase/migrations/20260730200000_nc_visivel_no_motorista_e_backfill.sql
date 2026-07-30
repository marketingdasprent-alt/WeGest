-- supabase/migrations/20260730200000_nc_visivel_no_motorista_e_backfill.sql
-- ============================================================
-- NC visível no perfil do motorista + backfill da origem dos movimentos
-- ============================================================
-- Dois reparos reportados pelo utilizador (30/07/2026), a olhar para a aba
-- Financeiro do motorista:
--
-- 1) "tudo o que é ações relacionadas a isto devem ter todas 'Gerido na
--    fatura'" — as linhas "Fatura cedida …" e "Estorno — fatura cedida foi
--    anulada" continuavam com ✓/✗/✏️. Não é um bug de lógica: são linhas
--    criadas ANTES de 20260730180000, quando cobranca_ceder_a_motorista
--    ainda escondia o id da cobrança dentro de `referencia` (texto livre)
--    em vez de o gravar em cobranca_id. Sem cobranca_id, a UI não as
--    reconhecia como geridas pela faturação. Backfill abaixo.
--
-- 2) "continuam sem aparecer notas de crédito de faturas aqui; o valor é
--    creditado ok mas não aparece o movimento" — as NCs testadas foram
--    todas sobre faturas JÁ ANULADAS. Nesse caso a dívida do motorista já
--    tinha sido revertida pela anulação (débito da cessão + crédito do
--    estorno = 0), por isso creditá-lo outra vez deixá-lo-ia CREDOR de um
--    valor que ninguém lhe deve. O saldo estava certo — o que faltava era
--    a NC aparecer.
--
--    A solução é a mesma que esta função já usa do lado do titular: um par
--    crédito+débito que se auto-cancela, para o documento ficar VISÍVEL no
--    extrato sem alterar um saldo que já estava a zero. `estado='anulada'`
--    é o sinal de que a cessão já foi revertida — a reversão só acontece
--    pelo caminho da anulação (anularCobrancasFaturacao).

CREATE OR REPLACE FUNCTION public.fn_nota_credito_posta_movimento()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cobranca_estado text;
  v_motorista       uuid;
  v_anulada         boolean;
  v_precisa_par     boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ativo' THEN
      SELECT estado, responsavel_motorista_id
        INTO v_cobranca_estado, v_motorista
        FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id;

      v_anulada := v_cobranca_estado IS NOT DISTINCT FROM 'anulada';

      -- O titular precisa de um débito a anular o crédito quando o crédito
      -- não lhe pertence de facto: fatura já anulada (já foi creditado uma
      -- vez pelo anulamento) ou dívida cedida a um motorista (está a zero
      -- desde a cessão). Um único par nos dois casos.
      v_precisa_par := v_anulada OR (v_motorista IS NOT NULL);

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
           CASE WHEN v_anulada THEN 'sem efeito adicional no saldo (fatura já anulada)'
                ELSE 'creditada ao motorista responsável (dívida cedida)' END);
      END IF;

      -- Lado do motorista: a NC aparece SEMPRE que a fatura lhe foi cedida.
      -- Se a fatura ainda está viva, o crédito é real (baixa a dívida dele).
      -- Se já foi anulada, a dívida dele já foi revertida no estorno — o
      -- crédito leva um débito a acompanhar, para o documento ficar visível
      -- sem o pôr credor de um valor que ninguém lhe deve.
      IF v_motorista IS NOT NULL THEN
        INSERT INTO public.motorista_financeiro
          (org_id, motorista_id, tipo, categoria, descricao, valor,
           data_movimento, status, cobranca_id)
        VALUES
          (NEW.org_id, v_motorista, 'credito', 'outro',
           'Nota de Crédito Nº ' || NEW.codigo || ' — ' || NEW.motivo,
           NEW.valor, NEW.data_nota, 'pendente', NEW.cobranca_id);

        IF v_anulada THEN
          INSERT INTO public.motorista_financeiro
            (org_id, motorista_id, tipo, categoria, descricao, valor,
             data_movimento, status, cobranca_id)
          VALUES
            (NEW.org_id, v_motorista, 'debito', 'outro',
             'Nota de Crédito Nº ' || NEW.codigo ||
             ' — sem efeito adicional no saldo (dívida já revertida na anulação)',
             NEW.valor, NEW.data_nota, 'pendente', NEW.cobranca_id);
        END IF;
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

    -- Simétrico: inverte TODAS as linhas que esta NC lançou ao motorista
    -- (uma ou o par), para não deixar metade por reverter.
    SELECT responsavel_motorista_id INTO v_motorista
      FROM public.contrato_cobrancas WHERE id = NEW.cobranca_id;
    IF v_motorista IS NOT NULL THEN
      INSERT INTO public.motorista_financeiro
        (org_id, motorista_id, tipo, categoria, descricao, valor,
         data_movimento, status, cobranca_id)
      SELECT NEW.org_id, v_motorista,
             CASE WHEN mf.tipo = 'credito' THEN 'debito' ELSE 'credito' END,
             'outro',
             'Estorno — nota de crédito Nº ' || NEW.codigo || ' anulada',
             mf.valor, current_date, 'pendente', NEW.cobranca_id
        FROM public.motorista_financeiro mf
       WHERE mf.cobranca_id = NEW.cobranca_id
         AND mf.descricao LIKE 'Nota de Crédito Nº ' || NEW.codigo || ' —%';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- ── Backfill 1 — origem explícita nos movimentos antigos ─────────────────
-- Linhas criadas antes de 20260730180000 guardavam o id da cobrança em
-- `referencia` (texto). Passa-o para cobranca_id (para a UI as reconhecer
-- como geridas pela faturação) e limpa a referência, que aparecia ao
-- utilizador como um UUID cru por baixo da descrição.
UPDATE public.motorista_financeiro mf
   SET cobranca_id = cc.id,
       referencia  = NULL
  FROM public.contrato_cobrancas cc
 WHERE mf.cobranca_id IS NULL
   AND mf.referencia IS NOT NULL
   AND mf.referencia ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND cc.id = mf.referencia::uuid;

-- ── Backfill 2 — NCs já emitidas sobre faturas cedidas ───────────────────
-- Emitidas antes de 20260730190000/200000, por isso nunca chegaram ao
-- perfil do motorista. Repõe as linhas que o trigger teria criado hoje.
INSERT INTO public.motorista_financeiro
  (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, cobranca_id)
SELECT nc.org_id, cc.responsavel_motorista_id, t.tipo, 'outro', t.descricao,
       nc.valor, nc.data_nota, 'pendente', nc.cobranca_id
  FROM public.notas_credito nc
  JOIN public.contrato_cobrancas cc ON cc.id = nc.cobranca_id
 CROSS JOIN LATERAL (
   VALUES
     ('credito', 'Nota de Crédito Nº ' || nc.codigo || ' — ' || nc.motivo),
     ('debito',  'Nota de Crédito Nº ' || nc.codigo ||
                 ' — sem efeito adicional no saldo (dívida já revertida na anulação)')
 ) AS t(tipo, descricao)
 WHERE nc.estado = 'ativo'
   AND cc.responsavel_motorista_id IS NOT NULL
   -- só o par completo, e só para faturas anuladas (as vivas teriam um
   -- crédito real — nenhuma existe neste estado de momento)
   AND cc.estado = 'anulada'
   AND NOT EXISTS (
     SELECT 1 FROM public.motorista_financeiro mf
      WHERE mf.cobranca_id = nc.cobranca_id
        AND mf.descricao LIKE 'Nota de Crédito Nº ' || nc.codigo || ' —%'
   );
