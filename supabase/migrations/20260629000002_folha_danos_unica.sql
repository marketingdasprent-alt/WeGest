-- ============================================================
-- Consolida a Folha de Danos: UMA por organização (partilhada).
-- ============================================================
-- Antes havia um template anexo_danos por empresa emissora. Como a folha é
-- igual para todas (o cabeçalho {{empresa_*}} é resolvido em runtime a partir
-- do emissor do contrato), mantém-se apenas um por org e apaga-se o resto.
--
-- Idempotente: depois de correr, cada org fica com 1 anexo_danos partilhado
-- (cliente_empresa_id = NULL).
-- ============================================================

-- 1) Apagar duplicados: por org, manter só o de versão mais alta.
DELETE FROM public.document_templates t
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id
      ORDER BY versao DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.document_templates
  WHERE tipo = 'anexo_danos'
) ranked
WHERE t.id = ranked.id
  AND ranked.rn > 1;

-- 2) O template que sobra deixa de estar preso a uma empresa (partilhado).
UPDATE public.document_templates
SET cliente_empresa_id = NULL
WHERE tipo = 'anexo_danos'
  AND cliente_empresa_id IS NOT NULL;
