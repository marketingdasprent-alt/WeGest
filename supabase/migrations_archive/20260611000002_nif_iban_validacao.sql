-- ============================================================
-- Validação de NIF e IBAN ao nível da base de dados
-- ============================================================
-- O frontend valida (pt-validators.ts), mas é UX — imports em massa,
-- edge functions e SQL directo contornavam tudo. Esta migration põe
-- a rede de segurança onde ela é real: na BD.
--
-- DESENHO PARA SISTEMA EM PRODUÇÃO (catraca, não bloqueio):
-- Em vez de CHECK constraints (que validam a linha INTEIRA em
-- qualquer UPDATE — editar as observações de um motorista antigo
-- com NIF legacy inválido falharia), usamos triggers que validam
-- APENAS em INSERT ou quando o valor do campo MUDA:
--   - dados antigos inválidos não bloqueiam trabalho não relacionado;
--   - ninguém consegue gravar um valor NOVO inválido;
--   - corrigir um campo obriga a corrigi-lo bem.
-- Depois de limpar os dados antigos (ver scripts/audit_nif_iban.sql),
-- pode opcionalmente promover-se a CHECK constraints.
--
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Função: NIF português válido (espelha src/lib/pt-validators.ts)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nif_pt_valido(p_nif text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE STRICT PARALLEL SAFE
AS $$
DECLARE
  n      text := regexp_replace(p_nif, '\s', '', 'g');
  soma   int := 0;
  resto  int;
  digito int;
BEGIN
  -- 9 dígitos exactos
  IF n !~ '^[0-9]{9}$' THEN
    RETURN false;
  END IF;

  -- Dígito de entidade válido (4 não existe em PT, 0 é reservado)
  IF substr(n, 1, 1) NOT IN ('1','2','3','5','6','7','8','9') THEN
    RETURN false;
  END IF;

  -- NIFs fictícios/de teste que passam o checksum
  IF n IN ('999999990', '999999999') THEN
    RETURN false;
  END IF;

  -- Checksum oficial AT: pesos 9→2, módulo 11
  FOR i IN 1..8 LOOP
    soma := soma + (10 - i) * substr(n, i, 1)::int;
  END LOOP;
  resto  := soma % 11;
  digito := CASE WHEN resto < 2 THEN 0 ELSE 11 - resto END;

  RETURN digito = substr(n, 9, 1)::int;
END;
$$;

COMMENT ON FUNCTION public.nif_pt_valido(text) IS
  'NIF PT: 9 dígitos + dígito de entidade + checksum AT (mod 11). '
  'Espelha validarNIF de src/lib/pt-validators.ts — manter em sincronia.';

-- ────────────────────────────────────────────────────────────
-- 2) Função: IBAN válido (ISO 13616, mod-97; PT = 25 chars)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.iban_valido(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE STRICT PARALLEL SAFE
AS $$
DECLARE
  ib       text := upper(regexp_replace(p_iban, '\s', '', 'g'));
  numerico text := '';
  c        text;
BEGIN
  IF ib !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' THEN
    RETURN false;
  END IF;

  IF ib LIKE 'PT%' AND length(ib) <> 25 THEN
    RETURN false;
  END IF;

  -- Mover os 4 primeiros chars para o fim e expandir letras (A=10 … Z=35)
  FOR i IN 1..length(ib) LOOP
    c := substr(substr(ib, 5) || substr(ib, 1, 4), i, 1);
    IF c BETWEEN 'A' AND 'Z' THEN
      numerico := numerico || (ascii(c) - 55)::text;
    ELSE
      numerico := numerico || c;
    END IF;
  END LOOP;

  -- numeric tem precisão arbitrária — mod-97 directo
  RETURN mod(numerico::numeric, 97) = 1;
END;
$$;

COMMENT ON FUNCTION public.iban_valido(text) IS
  'IBAN ISO 13616: formato + comprimento PT + checksum mod-97. '
  'Espelha validarIBAN de src/lib/pt-validators.ts — manter em sincronia.';

-- ────────────────────────────────────────────────────────────
-- 3) Trigger genérico: valida nif/iban só em INSERT ou mudança
-- ────────────────────────────────────────────────────────────
-- Genérico via to_jsonb(NEW): funciona em tabelas com nif, iban ou ambos.
CREATE OR REPLACE FUNCTION public.fn_validar_nif_iban()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_novo  jsonb := to_jsonb(NEW);
  v_velho jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_nif   text  := v_novo ->> 'nif';
  v_iban  text  := v_novo ->> 'iban';
BEGIN
  -- NIF: valida apenas valores novos ou alterados (catraca)
  IF v_novo ? 'nif'
     AND v_nif IS NOT NULL AND btrim(v_nif) <> ''
     AND (TG_OP = 'INSERT' OR v_nif IS DISTINCT FROM (v_velho ->> 'nif'))
  THEN
    IF NOT public.nif_pt_valido(v_nif) THEN
      RAISE EXCEPTION 'NIF inválido: "%" — verifica os 9 dígitos e o dígito de controlo.', v_nif
        USING ERRCODE = 'check_violation', HINT = 'Validação NIF (tabela ' || TG_TABLE_NAME || ')';
    END IF;
  END IF;

  -- IBAN: idem
  IF v_novo ? 'iban'
     AND v_iban IS NOT NULL AND btrim(v_iban) <> ''
     AND (TG_OP = 'INSERT' OR v_iban IS DISTINCT FROM (v_velho ->> 'iban'))
  THEN
    IF NOT public.iban_valido(v_iban) THEN
      RAISE EXCEPTION 'IBAN inválido: "%" — verifica os dígitos de controlo.', v_iban
        USING ERRCODE = 'check_violation', HINT = 'Validação IBAN (tabela ' || TG_TABLE_NAME || ')';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4) Triggers nas tabelas com NIF/IBAN introduzidos por utilizadores
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_validar_nif_iban ON public.motoristas_ativos;
CREATE TRIGGER trg_validar_nif_iban
  BEFORE INSERT OR UPDATE ON public.motoristas_ativos
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_nif_iban();

DROP TRIGGER IF EXISTS trg_validar_nif_iban ON public.clientes;
CREATE TRIGGER trg_validar_nif_iban
  BEFORE INSERT OR UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_nif_iban();

DROP TRIGGER IF EXISTS trg_validar_nif_iban ON public.empresas;
CREATE TRIGGER trg_validar_nif_iban
  BEFORE INSERT OR UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_nif_iban();

DROP TRIGGER IF EXISTS trg_validar_nif_iban ON public.organizacoes;
CREATE TRIGGER trg_validar_nif_iban
  BEFORE INSERT OR UPDATE ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_nif_iban();
