-- ============================================================================
-- A frase de abertura sai dos templates que têm campos — e só desses
-- ============================================================================
--
-- Um email do motor lê-se como um painel: título, dados, botão. Nos templates
-- com estrutura de campos, a primeira linha só repetia o assunto por outras
-- palavras — "Contrato 805 (BS-96-XP) fechado com danos" seguido de "O
-- contrato 805 foi fechado e a recolha trouxe registo de danos."
--
-- ── PORQUE NÃO SAI DE TODOS ─────────────────────────────────────────────────
--
-- A maioria dos templates semeados é UM parágrafo de prosa e mais nada:
--
--   "O seguro da viatura {{matricula}} expira em {{seguro_validade}}.
--    Confirma se a renovação já está tratada."
--
-- Nesses, a prosa não é decoração à frente dos dados — é o conteúdo todo.
-- Removê-la deixava o email com título, nada, e um botão. Por isso a
-- condição: a introdução só sai quando o que resta ainda tem pelo menos uma
-- linha "Etiqueta: valor" — as mesmas que o corpo do email transforma em
-- tabela (ver buildGenericEmailHtml).
-- ============================================================================

update public.notification_templates
set corpo_template = regexp_replace(corpo_template, E'^[^\\n]+\\n\\s*\\n', ''),
    updated_at = now()
where canal = 'email'
  -- primeira linha seguida de linha em branco: a forma de uma introdução
  and corpo_template ~ E'^[^\\n]+\\n\\s*\\n'
  -- e o que sobra tem mesmo campos, senão o corpo ficava vazio
  and regexp_replace(corpo_template, E'^[^\\n]+\\n\\s*\\n', '') ~ E'(^|\\n)[^\\n:<]{1,24}: [^\\n]+';
