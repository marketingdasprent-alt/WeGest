-- ============================================================
-- Salvaguarda: 1 conta ↔ no máximo 1 perfil de motorista
-- ============================================================
-- motoristas_ativos.user_id não tinha UNIQUE (só um índice normal,
-- 20260123141353). Como o novo fluxo email-first liga contas a
-- perfis por email (além do telefone), convém garantir que a mesma
-- conta nunca fica ligada a >1 perfil — o portal (PainelMotorista)
-- lê o perfil com .maybeSingle()/.single() e partiria com duplicados.
--
-- Aplicação SEGURA: se já existirem user_id duplicados na BD, o
-- índice UNIQUE NÃO é criado (evita falhar o deploy) e é emitido um
-- NOTICE a listar quantos. Deduplicar e reaplicar. Se estiver limpo,
-- o índice é criado.
--
-- Deploy: aplicar à mão no SQL editor (CI não faz db push).
-- ============================================================

DO $$
DECLARE
  _dupes integer;
BEGIN
  SELECT count(*) INTO _dupes
  FROM (
    SELECT user_id
    FROM public.motoristas_ativos
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 1
  ) d;

  IF _dupes > 0 THEN
    RAISE NOTICE 'motoristas_ativos: % user_id duplicado(s) — indice UNIQUE parcial NAO criado. Deduplicar e reaplicar esta migration.', _dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_motoristas_ativos_user_id
      ON public.motoristas_ativos (user_id)
      WHERE user_id IS NOT NULL;
    RAISE NOTICE 'Indice UNIQUE parcial uq_motoristas_ativos_user_id criado com sucesso.';
  END IF;
END $$;

-- ============================================================
-- Deteção de duplicados (correr para diagnosticar, se o NOTICE avisar):
--   SELECT user_id, count(*) FROM public.motoristas_ativos
--   WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1;
-- ============================================================
