-- Três coisas, todas da mesma história: quem trata dos pedidos de informática
-- não era só quem devia, e o link não chegava a quem precisava dele.
--
-- 1) O recurso 'ti_tickets_gerir' NUNCA existiu na tabela `recursos`. Está
--    referenciado nas políticas RLS de ti_tickets/ti_tokens e no frontend
--    (RECURSOS.TI_TICKETS_GERIR), mas has_permission() faz join a `recursos`
--    pelo nome — sem a linha, devolvia sempre false para toda a gente. Na
--    prática o painel de gestão só aparecia a quem fosse admin, e era por ser
--    admin, nunca por permissão. Criar o recurso é o que torna a permissão
--    atribuível de todo.
--
-- 2) Atribui-o ao cargo "Suporte TI" da Década Ousada (3 pessoas: Thiago
--    Sousa, João Bahia e Dinis Silva). `pode_editar` tem de ser true, não só
--    `tem_acesso`: TicketsTI.tsx decide o painel com canEdit(), que lê
--    recursosEditaveis (pode_editar), não hasAccessToResource().
--
-- 3) O link público (ti_tokens) passa a ser legível por qualquer utilizador
--    autenticado da organização. É o link que se partilha com quem nem conta
--    tem — não há nada a proteger em lê-lo, e sem ele o botão de pedidos do
--    Dashboard falha com "A organização ainda não tem link de pedidos de
--    informática". Escrever continua restrito a admin/Suporte TI (ti_gestao),
--    e a isolação por org mantém-se: cada um vê o token da SUA organização.

INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'ti_tickets_gerir',
  'Gerir pedidos de informática (ver todos, sugerir, resolver, reabrir)',
  'Tickets'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar, org_id)
SELECT
  '2ceaefc4-eb62-48ab-83ef-84b139b9472c'::uuid,  -- cargo "Suporte TI" (Década Ousada)
  r.id,
  true,
  true,
  '11111111-1111-1111-1111-111111111111'::uuid   -- Década Ousada
FROM public.recursos r
WHERE r.nome = 'ti_tickets_gerir'
  AND NOT EXISTS (
    SELECT 1 FROM public.cargo_permissoes cp
     WHERE cp.cargo_id = '2ceaefc4-eb62-48ab-83ef-84b139b9472c'::uuid
       AND cp.recurso_id = r.id
  );

CREATE POLICY ti_tokens_leitura_autenticado ON public.ti_tokens
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
