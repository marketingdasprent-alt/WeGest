-- ============================================================
-- Corrigir o histórico tem de poder DESATRIBUIR
-- ============================================================
-- A migração 20260825120000 pôs uma guarda nos gatilhos: se a resolução vier
-- vazia, mantém-se o motorista que lá estava. A intenção era boa — impedir que
-- uma reimportação apagasse atribuições por acidente, já que o backfill só
-- conhece o detentor actual e o anterior.
--
-- Mas ela bloqueia o caso principal para que isto foi feito: tirar um cartão a
-- um motorista que não o tinha. A atribuição deixa de cobrir aquelas datas, a
-- resolução devolve vazio, a guarda entra ao barulho e o combustível fica na
-- conta dele à mesma. O utilizador corrige e não acontece nada — precisamente
-- o que se queria eliminar.
--
-- A distinção certa não é "vazio vs preenchido", é QUEM está a mandar:
--
--   · Importação a mexer numa linha antiga  -> guarda activa, não apaga nada.
--   · Correcção deliberada do histórico     -> manda, e pode desatribuir.
--
-- Marca-se a diferença com uma variável de sessão, local à transação, que só
-- o recálculo despoletado por uma alteração da cartao_atribuicoes activa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculo_e_forcado()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('wegest.recalculo_forcado', true), '0') = '1';
$$;

CREATE OR REPLACE FUNCTION public.tg_resolver_motorista_cartao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_numero text;
  v_resolvido uuid;
BEGIN
  IF TG_TABLE_NAME = 'bp_transacoes' THEN
    SELECT bc.card_number INTO v_numero
    FROM public.bp_cartoes bc WHERE bc.id = NEW.card_id;
  ELSE
    v_numero := NEW.card_number;
  END IF;

  v_resolvido := public.resolver_motorista_por_cartao(
    NEW.org_id, TG_ARGV[0], v_numero, NEW.transaction_date::date
  );

  IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' OR public.recalculo_e_forcado() THEN
    NEW.motorista_id := v_resolvido;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_resolver_motorista_viatura()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_resolvido uuid;
BEGIN
  v_resolvido := public.resolver_motorista_por_viatura(
    NEW.viatura_id, NEW.transaction_date::date
  );

  IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' OR public.recalculo_e_forcado() THEN
    NEW.motorista_id := v_resolvido;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;
  RETURN NEW;
END $$;

-- O recálculo passa a anunciar-se: dentro desta transação, a resolução manda,
-- mesmo quando o resultado é "ninguém".
CREATE OR REPLACE FUNCTION public.recalcular_movimentos_do_cartao(p_cartao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo   text;
  v_numero text;
  v_org    uuid;
BEGIN
  SELECT c.tipo, public.normalizar_numero_cartao(c.numero), c.org_id
    INTO v_tipo, v_numero, v_org
  FROM public.cartoes_frota c WHERE c.id = p_cartao_id;
  IF v_numero IS NULL THEN RETURN; END IF;

  PERFORM set_config('wegest.recalculo_forcado', '1', true);

  IF v_tipo = 'repsol' THEN
    UPDATE public.repsol_transacoes SET updated_at = updated_at
    WHERE org_id = v_org AND public.normalizar_numero_cartao(card_number) = v_numero;
  ELSIF v_tipo = 'edp' THEN
    UPDATE public.edp_transacoes SET updated_at = updated_at
    WHERE org_id = v_org AND public.normalizar_numero_cartao(card_number) = v_numero;
  ELSIF v_tipo = 'bp' THEN
    UPDATE public.bp_transacoes t SET updated_at = t.updated_at
    FROM public.bp_cartoes bc
    WHERE bc.id = t.card_id AND t.org_id = v_org
      AND public.normalizar_numero_cartao(bc.card_number) = v_numero;
  END IF;

  PERFORM set_config('wegest.recalculo_forcado', '0', true);
END $$;
