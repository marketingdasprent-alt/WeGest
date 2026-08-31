-- ============================================================
-- Contrato revertido para reserva: ao voltar a contrato, mantém o número
-- ============================================================
-- Reverter um contrato para reserva marca-o com `deleted_at` e devolve a
-- reserva a "confirmada". Quando essa reserva voltava a virar contrato, o
-- contrato novo recebia MAX(codigo)+1 — um número diferente para o mesmo
-- negócio, com o mesmo cliente e a mesma viatura. Já aconteceu 20 vezes.
--
-- O número anterior está livre: o índice único `contratos_renting_codigo_org
-- _active_idx` é `(org_id, codigo) WHERE deleted_at IS NULL AND substituido_em
-- IS NULL`, e o contrato revertido tem `deleted_at`. Reutilizá-lo não colide
-- com nada — e a verificação abaixo confirma-o na mesma antes de o usar, em vez
-- de confiar no raciocínio.
--
-- Só toca em inserts com `codigo` nulo. A criação de versões copia a linha
-- inteira, com o código já preenchido, por isso continua a entrar pelo `return`
-- antecipado e as versões continuam a partilhar o número do contrato.
CREATE OR REPLACE FUNCTION public.set_contrato_renting_codigo_por_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo_anterior integer;
BEGIN
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'contratos_renting.org_id é obrigatório para gerar código por org';
  END IF;

  IF NEW.codigo IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('contratos_renting_codigo:' || NEW.org_id::text)
  );

  -- Esta reserva já teve contrato? Então o contrato novo é a continuação dele e
  -- fica com o mesmo número.
  IF NEW.reserva_id IS NOT NULL THEN
    SELECT c.codigo
      INTO v_codigo_anterior
      FROM public.contratos_renting c
     WHERE c.reserva_id = NEW.reserva_id
       AND c.org_id = NEW.org_id
       AND c.codigo IS NOT NULL
     ORDER BY c.created_at DESC
     LIMIT 1;

    -- A condição espelha EXACTAMENTE o índice único. Se por alguma razão o
    -- número já estiver ocupado por um contrato vivo, cai para a numeração
    -- normal em vez de rebentar a inserção na cara de quem está a gravar.
    IF v_codigo_anterior IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM public.contratos_renting c
       WHERE c.org_id = NEW.org_id
         AND c.codigo = v_codigo_anterior
         AND c.deleted_at IS NULL
         AND c.substituido_em IS NULL
    ) THEN
      NEW.codigo := v_codigo_anterior;
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(codigo), 0) + 1
    INTO NEW.codigo
    FROM public.contratos_renting
   WHERE org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_contrato_renting_codigo_por_org() IS
  'Número do contrato por organização. Uma reserva que volta a virar contrato '
  'recupera o número do contrato anterior (que está livre por estar em '
  'soft-delete); caso contrário, MAX+1.';
