-- ============================================================
-- Reservas — renomear aluguer_longa_duracao → is_longa_duracao
-- ============================================================
-- Alinha com convenção AGENTS.md §3 (booleans com prefix is/has/should/can)
-- e com o nome usado em contratos_renting (is_longa_duracao).
--
-- Permite extrair componentes UI partilhados entre Reserva e Contrato
-- (campos de ALD e Franquia/Kms) sem mapping de nomes.
-- ============================================================

DO $$
BEGIN
  -- Rename só se a coluna antiga existe e a nova ainda não
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reservas'
      AND column_name = 'aluguer_longa_duracao'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reservas'
      AND column_name = 'is_longa_duracao'
  ) THEN
    ALTER TABLE public.reservas
      RENAME COLUMN aluguer_longa_duracao TO is_longa_duracao;
  END IF;

  -- Comentário só se a coluna existir (depois do rename, ou se a coluna
  -- nova já existia previamente). Evita erro num estado corrupto.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reservas'
      AND column_name = 'is_longa_duracao'
  ) THEN
    EXECUTE $cmt$
      COMMENT ON COLUMN public.reservas.is_longa_duracao IS
        'true = reserva de aluguer de longa duração com renovação periódica.'
    $cmt$;
  END IF;
END $$;
