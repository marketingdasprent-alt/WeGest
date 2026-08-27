-- ============================================================
-- Tickets de TI: explicação da recusa + aviso em tempo real
-- ============================================================

-- Quando o autor diz que a sugestão não resolveu, pode explicar porquê. É
-- opcional de propósito: obrigar a escrever levaria a "não resolveu" escrito à
-- pressa, que não ajuda ninguém, ou a ninguém carregar no botão.
--
-- A coluna fica na SUGESTÃO e não no ticket porque é a resposta àquela
-- tentativa. No ticket, uma segunda recusa apagaria o que falhou na primeira —
-- e é precisamente essa sequência (tentativa 1 → o que falhou → tentativa 2)
-- que a lista do admin mostra.
ALTER TABLE public.ti_ticket_sugestoes
  ADD COLUMN IF NOT EXISTS resposta_texto text;

COMMENT ON COLUMN public.ti_ticket_sugestoes.resposta_texto IS
  'O que o autor escreveu ao dizer que a sugestão não resolveu. Opcional; '
  'nulo quando recusou sem explicar ou quando a sugestão ajudou.';

-- A bolinha do dashboard conta pedidos por resolver e tem de mexer sozinha
-- quando entra ou fecha um pedido. Sem a tabela na publicação, o cliente
-- subscreve um canal que nunca recebe nada: o número só mudava no refetch, e o
-- sintoma pareceria "às vezes actualiza" em vez de "não está ligado".
--
-- A RLS continua a mandar: o Realtime aplica as políticas da tabela a cada
-- subscritor, por isso só recebe eventos quem já podia ler estas linhas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ti_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ti_tickets;
  END IF;
END $$;
