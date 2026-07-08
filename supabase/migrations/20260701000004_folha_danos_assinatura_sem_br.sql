-- ============================================================
-- Folha de Danos: remover o <br> depois de {{assinatura_motorista}} e
-- {{assinatura_responsavel}}.
--
-- O <br> empurrava uma linha vazia extra na célula, fazendo a imagem da
-- assinatura (desenhada pelo gerador SOBRE a 1ª linha de texto = o traço)
-- ficar desalinhada / por cima do nome. Sem o <br>, a 1ª linha da célula
-- volta a ser o traço "_____", e a assinatura assenta sobre ele.
-- O <img> da assinatura é desenhado por signatureSrc (não depende de estar
-- em fluxo), por isso remover o <br> não afeta o desenho — só o alinhamento.
--
-- Idempotente: só remove se o <br> ainda lá estiver.
-- ============================================================

UPDATE public.document_templates
SET template_data = jsonb_set(
  template_data,
  '{conteudo}',
  to_jsonb(
    replace(
      replace(
        template_data->>'conteudo',
        '{{assinatura_motorista}}<br>',
        '{{assinatura_motorista}}'
      ),
      '{{assinatura_responsavel}}<br>',
      '{{assinatura_responsavel}}'
    )
  )
)
WHERE tipo = 'anexo_danos'
  AND ativo = true;
