-- ============================================================
-- Folha de Danos: célula esquerda deixa de ser "O Cliente" e passa a ser o
-- RESPONSÁVEL que fez o check-in/out ("Entregue por" / "Recolhido por" +
-- {{responsavel_nome}}), com a assinatura digital do responsável desenhada
-- sobre o traço (mecanismo signatureSrc — <img class="sig-responsavel"> na <td>).
--
-- Alvo do replace: o texto único e estável "<p>O Cliente {{cliente_nome}}</p>"
-- precedido do traço (não depende de indentação além do \r\n + 6 espaços que o
-- template usa). Insere o sentinela {{assinatura_responsavel}} antes do traço e
-- troca o rótulo por {{momento_responsavel}} {{responsavel_nome}}.
--
-- Idempotente: só aplica se ainda não existir {{assinatura_responsavel}}.
-- ============================================================

UPDATE public.document_templates
SET template_data = jsonb_set(
  template_data,
  '{conteudo}',
  to_jsonb(
    replace(
      template_data->>'conteudo',
      '<p>_________________________________</p>' || chr(13) || chr(10) ||
        '      <p>O Cliente {{cliente_nome}}</p>',
      '{{assinatura_responsavel}}<br>' || chr(13) || chr(10) ||
        '      <p>_________________________________</p>' || chr(13) || chr(10) ||
        '      <p>{{momento_responsavel}} {{responsavel_nome}}</p>'
    )
  )
)
WHERE tipo = 'anexo_danos'
  AND ativo = true
  AND (template_data->>'conteudo') NOT LIKE '%{{assinatura_responsavel}}%';
