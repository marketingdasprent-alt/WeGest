-- ============================================================
-- Folha de Danos: assinatura digital do motorista sobre o traço "Condutor".
--
-- A célula do Condutor passa a conter o sentinela {{assinatura_motorista}}.
-- O gerador de PDF desenha a imagem da assinatura sobre a linha tracejada
-- da célula (mecanismo signatureSrc — a <img class="sig-motorista"> só precisa
-- de estar DENTRO da <td> do Condutor). Sem assinatura → sentinela vazio →
-- traço em branco (comportamento actual).
--
-- Alvo: template_data->>'conteudo' em document_templates (tipo='anexo_danos',
-- ativo=true).
--
-- IMPORTANTE: o alvo do replace é o texto único e estável
-- "<p>O Condutor {{motorista_nome}}</p>" — NÃO depende de indentação nem de
-- \r\n, ao contrário do bloco <td> inteiro (que tem CRLF e não bateria num
-- literal SQL com \n). Insere-se o sentinela ANTES do traço da célula; o
-- gerador desenha a assinatura sobre o traço independentemente da posição.
--
-- Idempotente: após aplicar, o alvo passa a conter {{assinatura_motorista}}
-- e o replace de "<p>_...</p>\n      <p>O Condutor..." deixa de casar — na
-- verdade fazemos o replace sobre a string alvo que NÃO inclui o sentinela,
-- por isso re-aplicar volta a inserir. Guarda: só insere se ainda não existe.
-- ============================================================

UPDATE public.document_templates
SET template_data = jsonb_set(
  template_data,
  '{conteudo}',
  to_jsonb(
    replace(
      template_data->>'conteudo',
      '<p>_________________________________</p>' || chr(13) || chr(10) ||
        '      <p>O Condutor {{motorista_nome}}</p>',
      '{{assinatura_motorista}}<br>' || chr(13) || chr(10) ||
        '      <p>_________________________________</p>' || chr(13) || chr(10) ||
        '      <p>O Condutor {{motorista_nome}}</p>'
    )
  )
)
WHERE tipo = 'anexo_danos'
  AND ativo = true
  AND (template_data->>'conteudo') NOT LIKE '%{{assinatura_motorista}}%';
