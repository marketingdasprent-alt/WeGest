-- ============================================================
-- Pedidos de TI: numeração global em vez de por organização
-- ============================================================
-- A numeração era por empresa, e fazia sentido enquanto cada empresa via só a
-- sua lista. Agora que os pedidos de todas caem no mesmo sítio, dois pedidos
-- diferentes apareciam ambos como "#1" — e "trata do #1" deixava de identificar
-- coisa nenhuma.
--
-- Consequência assumida: o número que um cliente vê passa a ser o da fila
-- inteira da plataforma, não o da sua empresa. É o preço de ter uma referência
-- que serve para falar de um pedido sem dizer também de que empresa é.

-- 1. Renumerar por ordem de chegada, ANTES de existir índice único: a
--    renumeração é uma permutação e passa por estados onde dois pedidos
--    partilhariam número a meio do UPDATE.
WITH ordenados AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM public.ti_tickets
)
UPDATE public.ti_tickets t
   SET numero = o.n
  FROM ordenados o
 WHERE o.id = t.id
   AND t.numero IS DISTINCT FROM o.n;

-- 2. Passa a ser garantia da base de dados, não convenção do código. Sem isto,
--    um INSERT com `numero` explícito repetia um número sem nada se opor.
CREATE UNIQUE INDEX IF NOT EXISTS ti_tickets_numero_unico ON public.ti_tickets (numero);

-- 3. O trigger deixa de contar por organização. O nome antigo dizia
--    `_por_org` e passaria a mentir, por isso troca-se de função em vez de se
--    reescrever o corpo por baixo do mesmo nome.
DROP TRIGGER IF EXISTS trg_ti_ticket_numero_por_org ON public.ti_tickets;
DROP FUNCTION IF EXISTS public.set_ti_ticket_numero_por_org();

CREATE OR REPLACE FUNCTION public.set_ti_ticket_numero()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Uma chave só para toda a tabela, ao contrário do lock por org que aqui
  -- estava: com um lock por organização, dois pedidos de empresas diferentes
  -- entravam ao mesmo tempo e calculavam o mesmo MAX+1.
  PERFORM pg_advisory_xact_lock(hashtext('ti_tickets_numero'));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO NEW.numero FROM public.ti_tickets;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ti_ticket_numero
  BEFORE INSERT ON public.ti_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ti_ticket_numero();

COMMENT ON FUNCTION public.set_ti_ticket_numero() IS
  'Número sequencial global dos pedidos de TI. Global e não por organização '
  'porque a lista de pedidos é uma só para todas as empresas.';
