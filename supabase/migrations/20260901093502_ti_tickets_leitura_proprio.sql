-- Quem tem sessao mas nao gere tickets passa a poder LER (so leitura) os
-- proprios pedidos — "o meu historico". Ate agora so quem tem
-- ti_tickets_gerir (ou e admin) conseguia ler ti_tickets de todo; um
-- utilizador comum ficava de fora mesmo dos seus proprios pedidos.
CREATE POLICY ti_tickets_leitura_proprio ON public.ti_tickets
  AS PERMISSIVE FOR SELECT TO public
  USING (criado_por = auth.uid());

CREATE POLICY ti_ticket_sugestoes_leitura_proprio ON public.ti_ticket_sugestoes
  AS PERMISSIVE FOR SELECT TO public
  USING (
    ticket_id IN (SELECT id FROM public.ti_tickets WHERE criado_por = auth.uid())
  );

CREATE POLICY ti_ticket_anexos_leitura_proprio ON public.ti_ticket_anexos
  AS PERMISSIVE FOR SELECT TO public
  USING (
    ticket_id IN (SELECT id FROM public.ti_tickets WHERE criado_por = auth.uid())
  );
