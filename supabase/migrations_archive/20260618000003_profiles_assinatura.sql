-- ============================================================
-- Assinatura digital do utilizador
-- ============================================================
-- Cada utilizador pode guardar UMA assinatura (desenhada no canvas das
-- Definições). Guardada como data URL PNG (base64) na própria linha do
-- profile — assinaturas são imagens pequenas (~20-50KB) e há sempre só uma
-- por utilizador, por isso uma coluna TEXT é mais simples que um bucket.
--
-- A coluna é nullable: sem assinatura, o contrato mantém a linha em branco.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assinatura_url text;

COMMENT ON COLUMN public.profiles.assinatura_url IS
  'Assinatura digital do utilizador (data URL PNG base64). NULL = sem assinatura. '
  'Inserida automaticamente nos contratos de aluguer na zona "O Colaborador".';

-- RLS: a policy de UPDATE de profiles já permite o próprio (id = auth.uid()).
-- Nada a acrescentar — gravar a assinatura é um UPDATE da própria linha.

-- ------------------------------------------------------------
-- Template "Contrato Aluguer": sentinela da assinatura do colaborador
-- ------------------------------------------------------------
-- A célula "O Colaborador" passa a ter o placeholder {{assinatura_colaborador}}
-- imediatamente ANTES de <strong>{{colaborador_nome}}</strong>. O motor de PDF
-- deteta esta sentinela na célula e desenha lá a imagem da assinatura (o texto
-- é descartado). Sem assinatura, o placeholder resolve para vazio e a linha
-- fica como hoje (traço + nome).
--
-- Robusto a variações de whitespace no traço: ancora-se em
-- <strong>{{colaborador_nome}}</strong> (que no template só aparece na célula do
-- colaborador). regexp_replace com flag 'g' é idempotente porque a 2ª condição
-- do WHERE exclui conteúdos que já tenham a sentinela.
-- ::text força o tipo do literal (senão `unknown` → erro 42804 em to_jsonb).

UPDATE public.document_templates t
SET template_data = jsonb_set(
  t.template_data,
  '{conteudo}',
  to_jsonb(
    regexp_replace(
      (t.template_data->>'conteudo')::text,
      '(<strong>\{\{colaborador_nome\}\}</strong>)',
      '{{assinatura_colaborador}}\1',
      'g'
    )::text
  )
)
WHERE t.tipo = 'contrato_aluguer'
  AND t.template_data ? 'conteudo'
  AND (t.template_data->>'conteudo') LIKE '%<strong>{{colaborador_nome}}</strong>%'
  AND (t.template_data->>'conteudo') NOT LIKE '%{{assinatura_colaborador}}%';

-- Diagnóstico: avisa se algum template de aluguer ativo ficou SEM a sentinela
-- (ex.: HTML editado manualmente, sem o {{colaborador_nome}} esperado). Não
-- falha a migração — só regista para o admin saber que esse template precisa de
-- adicionar {{assinatura_colaborador}} à mão na zona do colaborador.
DO $$
DECLARE
  n_falta int;
BEGIN
  SELECT count(*) INTO n_falta
  FROM public.document_templates t
  WHERE t.tipo = 'contrato_aluguer'
    AND COALESCE(t.ativo, true)
    AND t.template_data ? 'conteudo'
    AND (t.template_data->>'conteudo') NOT LIKE '%{{assinatura_colaborador}}%';
  IF n_falta > 0 THEN
    RAISE WARNING 'Assinatura: % template(s) de aluguer sem {{assinatura_colaborador}} — adicione o placeholder na zona "O Colaborador".', n_falta;
  END IF;
END $$;
