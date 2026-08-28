-- ============================================================
-- Extensão: reservas.matricula também segue a troca de viatura
-- ============================================================
-- Sequela do fix 20260722100000 (reservas.viatura_id): confirmado em uso
-- real que a listagem de reservas (ReservasTabela.tsx) mostra
-- `reservas.matricula` directamente (snapshot de texto), NUNCA um join ao
-- vivo a viaturas — ao contrário do detalhe da reserva
-- (ReservaResumoSidebar.tsx), que resolve a viatura ao vivo por
-- `viatura_id` e por isso já mostrava a matrícula certa. Resultado: depois
-- da troca, a tabela continuava a mostrar a matrícula antiga (BH-84-HF)
-- enquanto o detalhe já mostrava a nova (BI-06-LD) — confirmado em
-- produção pelo utilizador.
--
-- A decisão de NÃO sincronizar `matricula` na migration anterior
-- (20260722100000) foi feita por analogia com o comentário existente em
-- contratos_renting.matricula ("snapshot que pode divergir de propósito").
-- Verificado agora: `reservas.matricula` NUNCA teve um COMMENT ON COLUMN
-- equivalente nem qualquer nota de design — a analogia não se aplicava a
-- esta tabela. Também afecta a pesquisa/ordenação por matrícula na
-- listagem e no seletor de reserva→contrato (ambos leem o mesmo
-- snapshot) — deixar por sincronizar não era só cosmético.
--
-- contratos_renting.matricula continua intocado — esse sim tem uma razão
-- de negócio documentada para poder divergir (mudança legal de matrícula
-- da viatura, rara mas possível).
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_reserva_viatura_from_contrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reserva_id IS NULL OR NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.reservas
     SET viatura_id = NEW.viatura_id,
         matricula  = NEW.matricula
   WHERE id = NEW.reserva_id
     AND deleted_at IS NULL
     AND (viatura_id IS DISTINCT FROM NEW.viatura_id OR matricula IS DISTINCT FROM NEW.matricula);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_reserva_viatura_from_contrato() IS
  'Mantém reservas.viatura_id e reservas.matricula sempre iguais aos da '
  'versão activa do contrato ligado (via reserva_id) — corre em qualquer '
  'INSERT/UPDATE de viatura_id/reserva_id. Fix 2026-07-22, estendido no '
  'mesmo dia para incluir matricula (a listagem de reservas lê-a '
  'directamente, sem join a viaturas).';

-- O trigger em si não muda (mesmo evento/colunas) — só o corpo da função
-- por trás é que passa a tocar também em `matricula`.

-- ────────────────────────────────────────────────────────────
-- Backfill: corrige a matrícula das reservas já dessincronizadas.
-- ────────────────────────────────────────────────────────────
UPDATE public.reservas r
   SET matricula = c.matricula
  FROM public.contratos_renting c
 WHERE c.reserva_id = r.id
   AND c.org_id = r.org_id
   AND c.deleted_at IS NULL
   AND c.substituido_em IS NULL
   AND r.deleted_at IS NULL
   AND r.matricula IS DISTINCT FROM c.matricula;
