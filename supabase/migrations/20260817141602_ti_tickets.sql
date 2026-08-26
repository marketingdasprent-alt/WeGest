-- ============================================================
-- Tickets de informática (TI)
-- ============================================================
-- Domínio próprio, deliberadamente separado de `assistencia_tickets`: essa é
-- da oficina (viatura_id NOT NULL, km, combustível, mecânico, viatura
-- substituta) e um ticket de "o portátil não liga" não caberia lá sem tornar
-- viatura_id opcional numa tabela que meia aplicação lê.
--
-- Quem submete pode não ter conta nenhuma. O acesso anónimo NÃO passa por
-- estas políticas: passa pelas edge functions ti-ticket-submeter,
-- ti-ticket-por-token e ti-sugestao-responder, que usam a service role e
-- fazem a autorização lá dentro (token do link / token do ticket). A RLS aqui
-- serve a aplicação autenticada.

-- Token do LINK: dá direito a SUBMETER nesta organização. Cópia do padrão de
-- quadro_tokens, incluindo o `ativo` que permite rodar um link que vazou sem
-- perder histórico.
CREATE TABLE public.ti_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL DEFAULT get_current_org_id()
             REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  token      uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.ti_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  numero       integer,
  autor_nome   text NOT NULL CHECK (btrim(autor_nome) <> ''),
  autor_email  text NOT NULL CHECK (position('@' in autor_email) > 1),
  descricao    text NOT NULL CHECK (btrim(descricao) <> ''),
  status       text NOT NULL DEFAULT 'aberto'
               CHECK (status IN ('aberto','com_sugestao','nao_resolvido','presencial','resolvido')),
  -- Nulo quando o ticket vem do link público; preenchido quando o admin o abre
  -- dentro da aplicação.
  criado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Token do TICKET: dá direito a ler e responder A ESTE ticket, e só a ele.
  -- Não confundir com ti_tokens.token, que só dá direito a submeter. Se fossem
  -- o mesmo, quem tivesse o link de submissão lia os tickets de todos.
  acesso_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.ti_ticket_sugestoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES public.ti_tickets(id) ON DELETE CASCADE,
  texto         text NOT NULL CHECK (btrim(texto) <> ''),
  criado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Nulo até o autor responder. true = ajudou, false = não ajudou.
  util          boolean,
  respondida_em timestamptz,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Contagem do limite por hora do endpoint público. Guarda o HASH da origem,
-- nunca o IP: um endereço é dado pessoal e não há razão para o reter em claro
-- só para contar cinco pedidos. Linhas com mais de 24h são descartáveis.
CREATE TABLE public.ti_submissoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  origem_hash text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX ti_submissoes_origem_tempo ON public.ti_submissoes (origem_hash, created_at DESC);
CREATE INDEX ti_tickets_org_status ON public.ti_tickets (org_id, status, created_at DESC);
CREATE INDEX ti_sugestoes_ticket ON public.ti_ticket_sugestoes (ticket_id, created_at DESC);

-- Numeração por organização, para se dizer "ticket 14" e não um UUID. Mesmo
-- padrão de set_reserva_codigo_por_org, incluindo o advisory lock que evita
-- dois tickets com o mesmo número.
CREATE OR REPLACE FUNCTION public.set_ti_ticket_numero_por_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'ti_tickets.org_id é obrigatório para gerar número por org';
  END IF;
  IF NEW.numero IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ti_tickets_numero:' || NEW.org_id::text));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO NEW.numero
    FROM public.ti_tickets WHERE org_id = NEW.org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ti_ticket_numero_por_org
  BEFORE INSERT ON public.ti_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ti_ticket_numero_por_org();

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE public.ti_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ti_tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ti_ticket_sugestoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ti_submissoes       ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_deny_anon ON public.ti_tokens           AS RESTRICTIVE TO anon USING (false);
CREATE POLICY rls_deny_anon ON public.ti_tickets          AS RESTRICTIVE TO anon USING (false);
CREATE POLICY rls_deny_anon ON public.ti_ticket_sugestoes AS RESTRICTIVE TO anon USING (false);
CREATE POLICY rls_deny_anon ON public.ti_submissoes       AS RESTRICTIVE TO anon USING (false);

CREATE POLICY rls_org_isolation ON public.ti_tokens           AS RESTRICTIVE USING (org_id = get_current_org_id());
CREATE POLICY rls_org_isolation ON public.ti_tickets          AS RESTRICTIVE USING (org_id = get_current_org_id());
CREATE POLICY rls_org_isolation ON public.ti_ticket_sugestoes AS RESTRICTIVE USING (org_id = get_current_org_id());
CREATE POLICY rls_org_isolation ON public.ti_submissoes       AS RESTRICTIVE USING (org_id = get_current_org_id());

-- Quem gere tickets de TI vê e escreve. NÃO se reutiliza `tickets_gerir`, que é
-- da assistência a viaturas: quem trata da oficina não trata necessariamente da
-- informática.
CREATE POLICY ti_gestao ON public.ti_tickets FOR ALL
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'ti_tickets_gerir'));
CREATE POLICY ti_gestao ON public.ti_ticket_sugestoes FOR ALL
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'ti_tickets_gerir'));
CREATE POLICY ti_gestao ON public.ti_tokens FOR ALL
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'ti_tickets_gerir'));

-- Uma linha por organização, para o botão da dashboard ter sempre um link.
INSERT INTO public.ti_tokens (org_id)
SELECT o.id FROM public.organizacoes o
WHERE NOT EXISTS (
  SELECT 1 FROM public.ti_tokens t WHERE t.org_id = o.id AND t.ativo
);

COMMENT ON TABLE public.ti_tickets IS
  'Tickets de informática. Podem nascer do link público (criado_por NULL) ou da '
  'aplicação (criado_por preenchido). acesso_token dá acesso a UM ticket.';
