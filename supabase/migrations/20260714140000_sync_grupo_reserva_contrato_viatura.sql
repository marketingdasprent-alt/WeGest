-- ============================================================
-- Fix sistémico: `grupo` (reservas/contratos_renting) só era escrito ao
-- trocar ACTIVAMENTE de viatura no formulário (aplicarDadosViatura) — uma
-- reserva/contrato que nasce já com a viatura associada, ou é editado sem
-- nunca reseleccionar a viatura, fica com `grupo` vazio para sempre, mesmo
-- a viatura tendo grupo_id atribuído. Isso bloqueava "Criar Contrato" (exige
-- reserva.grupo preenchido) com a mensagem enganadora "viatura sem grupo" —
-- caso real: reserva #56 (BS-42-XV, grupo "Compacto Médio" na viatura,
-- `reservas.grupo` NULL desde a criação a 2026-06-25).
--
-- Levantamento em produção (2026-07-14): 149 reservas e 147 contratos
-- activos com o mesmo padrão (viatura com grupo_id, grupo próprio vazio).
-- Não é um caso isolado — é sistémico.
--
-- Fix definitivo: `grupo` deixa de depender de um passo manual no
-- formulário — passa a ser sincronizado pela BD sempre que uma reserva ou
-- contrato é gravado, a partir do grupo da PRÓPRIA viatura associada. O
-- campo é sempre readOnly no formulário (placeholder "Definido pela
-- viatura") — nunca houve um valor manual legítimo para preservar.
-- Versões substituídas de contrato ficam de fora (imutáveis por desenho,
-- ver fn_contratos_renting_versao_imutavel) — o histórico não se reescreve.
-- ============================================================

-- Duas funções separadas (não uma partilhada por TG_TABLE_NAME): o corpo
-- PL/pgSQL é especializado para o tipo de `NEW` de cada trigger — uma função
-- só com `contratos_renting.substituido_em` já rebenta ao ser invocada por
-- um trigger em `reservas` (a coluna não existe nessa tabela), mesmo atrás
-- de um IF que nunca chega a ser verdadeiro para essa tabela.

CREATE OR REPLACE FUNCTION public.sync_grupo_reserva_from_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.viatura_id IS NULL THEN
    NEW.grupo := NULL;
    RETURN NEW;
  END IF;

  SELECT rg.nome INTO NEW.grupo
    FROM public.viaturas v
    LEFT JOIN public.renting_grupos rg ON rg.id = v.grupo_id
   WHERE v.id = NEW.viatura_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_grupo_reserva_from_viatura() IS
  'Mantém reservas.grupo sempre igual ao grupo da viatura associada — corre '
  'em qualquer INSERT/UPDATE, não só quando o formulário troca ativamente '
  'de viatura. Fix 2026-07-14 (reserva #56 e 149 registos com o mesmo padrão).';

DROP TRIGGER IF EXISTS trg_reservas_sync_grupo ON public.reservas;
CREATE TRIGGER trg_reservas_sync_grupo
  BEFORE INSERT OR UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.sync_grupo_reserva_from_viatura();

CREATE OR REPLACE FUNCTION public.sync_grupo_contrato_from_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Versão de contrato já substituída: imutável, não mexer.
  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.viatura_id IS NULL THEN
    NEW.grupo := NULL;
    RETURN NEW;
  END IF;

  SELECT rg.nome INTO NEW.grupo
    FROM public.viaturas v
    LEFT JOIN public.renting_grupos rg ON rg.id = v.grupo_id
   WHERE v.id = NEW.viatura_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_grupo_contrato_from_viatura() IS
  'Mantém contratos_renting.grupo sempre igual ao grupo da viatura associada '
  '— corre em qualquer INSERT/UPDATE de versão activa, não só quando o '
  'formulário troca ativamente de viatura. Fix 2026-07-14 (147 registos '
  'com o mesmo padrão da reserva #56).';

DROP TRIGGER IF EXISTS trg_contratos_renting_sync_grupo ON public.contratos_renting;
CREATE TRIGGER trg_contratos_renting_sync_grupo
  BEFORE INSERT OR UPDATE ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.sync_grupo_contrato_from_viatura();

-- ────────────────────────────────────────────────────────────
-- Backfill: repara já todas as reservas/contratos activos afetados,
-- sem esperar que cada um seja aberto individualmente no formulário.
-- ────────────────────────────────────────────────────────────
UPDATE public.reservas r
   SET grupo = rg.nome
  FROM public.viaturas v
  LEFT JOIN public.renting_grupos rg ON rg.id = v.grupo_id
 WHERE v.id = r.viatura_id
   AND r.deleted_at IS NULL
   AND (r.grupo IS NULL OR r.grupo = '')
   AND v.grupo_id IS NOT NULL;

UPDATE public.contratos_renting c
   SET grupo = rg.nome
  FROM public.viaturas v
  LEFT JOIN public.renting_grupos rg ON rg.id = v.grupo_id
 WHERE v.id = c.viatura_id
   AND c.deleted_at IS NULL
   AND c.substituido_em IS NULL
   AND (c.grupo IS NULL OR c.grupo = '')
   AND v.grupo_id IS NOT NULL;
