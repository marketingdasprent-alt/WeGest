-- ============================================================
-- Nota de Crédito visível no livro-razão quando a cobrança já foi anulada
-- ============================================================
-- ATENÇÃO — FICHEIRO RECONSTRUÍDO, NÃO É O ORIGINAL.
--
-- Esta migração está aplicada em produção desde 2026-07-30 às 10:00:31
-- (`supabase_migrations.schema_migrations` versão 20260730100031, nome
-- `nota_credito_visivel_sobre_cobranca_anulada`) e o ficheiro não existia em
-- nenhum ramo, commit ou stash — procurado com `git log --all`. Um clone novo
-- não a recriava.
--
-- O corpo abaixo foi extraído de `pg_get_functiondef()` na produção, portanto o
-- CÓDIGO é exactamente o que está a correr. O que não se recupera é o texto
-- original do autor: os comentários desta migração são uma reconstrução do
-- raciocínio a partir do `COMMENT ON FUNCTION` que ficou na base de dados e da
-- migração anterior. Se o original aparecer, prefira-o a este ficheiro.
--
-- CONTEXTO — corrige a migração imediatamente anterior
-- A `nota_credito_sobre_cobranca_anulada` (versão 20260730093619, ficheiro
-- 20260730110000_nota_credito_sobre_cobranca_anulada.sql, nos ramos
-- `ParcelamentoFaturas` e `BranchDinis`) passou a permitir emitir uma NC sobre
-- uma cobrança já anulada internamente — o que era necessário, porque a
-- anulação interna não cancela o documento fiscal e só uma NC o reverte no
-- KeyInvoice.
--
-- Para não creditar o titular duas vezes, essa migração fazia a NC **saltar**
-- o lançamento em `conta_movimentos` quando a cobrança estava anulada. O saldo
-- ficava certo, mas a NC deixava de aparecer no livro-razão: existia
-- fiscalmente e não existia na conta-corrente do cliente.
--
-- A SOLUÇÃO desta migração: em vez de saltar o lançamento, lança **os dois** —
-- um crédito e um débito do mesmo valor, ambos com a data da nota. O efeito
-- líquido no saldo continua a ser zero (que é o correcto: o anulamento já
-- creditou o titular), mas a NC passa a estar visível no extracto, com o
-- débito a explicar-se a si próprio na descrição.
--
-- No sentido inverso, anular a NC deixa de estornar só o crédito e passa a
-- inverter TODOS os lançamentos que a criação produziu — o que é o que torna a
-- operação simétrica agora que a criação pode produzir dois.
-- ============================================================

create or replace function public.fn_nota_credito_posta_movimento()
returns trigger
language plpgsql
as $function$
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
$function$;

comment on function public.fn_nota_credito_posta_movimento() is
  'Posta o(s) lançamento(s) da NC em conta_movimentos. Cobrança normal: 1 '
  'crédito. Cobrança já anulada: crédito + débito do mesmo valor (visível no '
  'livro-razão, sem efeito no saldo — o anulamento já tinha creditado o '
  'titular). Anular a NC inverte todos os lançamentos que a criação fez.';
