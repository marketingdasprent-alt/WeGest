-- ============================================================
-- Migrar empresas (legada) → clientes tipo='empresa'
-- ============================================================
-- O sistema (emissor de reservas/contratos, document_templates,
-- faturação) usa `clientes` tipo='empresa' (UUID). A tabela `empresas`
-- (slugs) é legada. A aba "Empresas" em Configurações passa a gerir
-- clientes tipo='empresa', por isso copiamos as empresas existentes
-- para lá — senão sumiam da UI.
--
-- Idempotente: só insere uma empresa que ainda não exista em clientes
-- (match por org_id + NIF normalizado, ou por org_id + nome quando
-- não há NIF). Re-correr não duplica.
--
-- licenca_validade: empresas guarda TEXT livre ("26/12/2028",
-- "(informação a confirmar)"). clientes tem DATE. Convertemos só
-- quando o texto é uma data dd/mm/aaaa válida; caso contrário NULL.
-- ============================================================

-- Helper local TEMPORÁRIO (schema pg_temp): converte "dd/mm/aaaa" → date,
-- senão NULL (sem rebentar). Vive só nesta sessão; não polui public.
CREATE FUNCTION pg_temp.safe_date(_txt text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF _txt IS NULL OR btrim(_txt) !~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
    RETURN NULL;
  END IF;
  RETURN to_date(btrim(_txt), 'DD/MM/YYYY');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

INSERT INTO public.clientes (
  nome,
  nome_comercial,
  nif,
  sede,
  representante,
  cargo_representante,
  licenca_tvde,
  licenca_validade,
  papel_timbrado,
  tipo_cliente,
  is_empresa,
  org_id
)
SELECT
  e.nome,
  e.nome_completo,
  NULLIF(btrim(e.nif), ''),
  e.sede,
  e.representante,
  e.cargo_representante,
  e.licenca_tvde,
  pg_temp.safe_date(e.licenca_validade),
  e.papel_timbrado,
  'empresa',
  true,
  e.org_id
FROM public.empresas e
WHERE e.org_id IS NOT NULL
  AND COALESCE(e.ativo, true) = true
  AND NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.tipo_cliente = 'empresa'
      AND c.org_id = e.org_id
      AND c.deleted_at IS NULL
      AND (
        -- match por NIF quando ambos têm NIF
        (NULLIF(btrim(e.nif), '') IS NOT NULL
          AND btrim(c.nif) = btrim(e.nif))
        -- senão, match por nome
        OR (NULLIF(btrim(e.nif), '') IS NULL
          AND lower(btrim(c.nome)) = lower(btrim(e.nome)))
      )
  );
