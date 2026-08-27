-- ============================================================
-- Tickets de TI — continuação: registo de resolução e de resposta
-- ============================================================
--
-- ⚠️ MIGRAÇÃO RECONSTRUÍDA (2026-08-28)
--
-- Esta migração foi aplicada em produção a 2026-08-27 (registada em
-- `supabase_migrations.schema_migrations` como `20260827111017`) mas o ficheiro
-- original não existe em nenhum objecto git — nem em `main`, nem em nenhum
-- ramo, nem no reflog. Foi reconstruída por introspecção do schema vivo
-- (`information_schema.columns`), comparando produção com o estado que
-- `20260817141602_ti_tickets.sql` deixa.
--
-- O QUE ISTO SIGNIFICA
--   · O EFEITO é fiel: as quatro colunas abaixo são exactamente as que
--     produção tem a mais do que o repositório, nesta família de tabelas.
--   · O TEXTO não é o original. Comentários, ordem e eventuais backfills que a
--     migração original pudesse ter não são recuperáveis.
--   · A atribuição destas colunas a ESTA migração (e não à `20260827113930`) é
--     inferida do nome — "continuação" do trabalho de tickets, por oposição a
--     "suporte plataforma". Se o original aparecer, prevalece.
--
-- Ver docs/motor-automacao/reconstrucao-migracoes.md para o procedimento e para
-- a lista de divergências conhecidas.

-- ── ti_tickets: quem resolveu e quando ──────────────────────────
-- `resolvido_por_nome` guarda o NOME e não o uuid: quem resolve pode ser um
-- admin da plataforma que não pertence à organização do ticket, e um FK para
-- auth.users obrigaria a expor esse utilizador do outro lado da fronteira.
-- Mesmo padrão de `notificacoes.resolvida_por_nome`.
ALTER TABLE public.ti_tickets
  ADD COLUMN IF NOT EXISTS resolvido_por_nome text,
  ADD COLUMN IF NOT EXISTS resolvido_em       timestamptz;

COMMENT ON COLUMN public.ti_tickets.resolvido_por_nome IS
  'Nome de quem marcou o ticket como resolvido. Texto e não FK: pode ser um '
  'admin da plataforma externo à organização do ticket.';

COMMENT ON COLUMN public.ti_tickets.resolvido_em IS
  'Momento em que o ticket passou a resolvido. Nulo enquanto estiver aberto.';

-- ── ti_ticket_sugestoes: a resposta do autor e quem sugeriu ─────
-- `util` (booleano) já existia desde a migração original e diz SE ajudou.
-- `resposta_texto` diz PORQUÊ — é o que o autor escreve quando carrega em
-- "não ajudou", e sem ele o circuito de sugestão fecha sem informação nenhuma
-- para quem tem de resolver o problema a sério.
ALTER TABLE public.ti_ticket_sugestoes
  ADD COLUMN IF NOT EXISTS resposta_texto   text,
  ADD COLUMN IF NOT EXISTS criado_por_nome  text;

COMMENT ON COLUMN public.ti_ticket_sugestoes.resposta_texto IS
  'Texto livre do autor ao responder à sugestão. Tipicamente preenchido quando '
  'util = false.';

COMMENT ON COLUMN public.ti_ticket_sugestoes.criado_por_nome IS
  'Nome de quem escreveu a sugestão. Mesma razão de ti_tickets.resolvido_por_nome: '
  'pode ser alguém de fora da organização do ticket.';
