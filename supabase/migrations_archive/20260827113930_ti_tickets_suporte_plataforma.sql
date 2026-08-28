-- ============================================================
-- Tickets de TI — balcão de suporte da plataforma
-- ============================================================
--
-- ⚠️ MIGRAÇÃO RECONSTRUÍDA (2026-08-28)
--
-- Aplicada em produção a 2026-08-27 (registada como `20260827113930`); o
-- ficheiro original não existe em nenhum objecto git. Reconstruída por
-- introspecção do schema vivo: `pg_get_functiondef`, `pg_get_triggerdef`,
-- `pg_policies` e `pg_indexes`. Ver o cabeçalho de
-- `20260827111017_ti_tickets_continuacao.sql` para o que "reconstruída"
-- implica.
--
-- ── O QUE ESTA MIGRAÇÃO MUDA, E PORQUÊ IMPORTA ──────────────────
--
-- Transforma os tickets de TI de um sistema POR ORGANIZAÇÃO num balcão de
-- suporte DA PLATAFORMA. São três mudanças acopladas:
--
--   1. Numeração deixa de ser por organização e passa a ser global.
--   2. `numero` ganha unicidade global.
--   3. Os admins da Década Ousada (dona do produto) passam a ver os tickets de
--      todas as organizações.
--
-- ⚠️ ATENÇÃO — EXCEPÇÃO DELIBERADA AO ISOLAMENTO MULTI-ORGANIZAÇÃO
--
-- O ponto 3 abre um buraco na política RESTRICTIVE `rls_org_isolation`, que em
-- todo o resto do schema é `org_id = get_current_org_id()` e mais nada.
-- Verificado a 2026-08-28: `ti_tickets` e `ti_ticket_sugestoes` são as ÚNICAS
-- DUAS tabelas de todo o schema onde essa política não é a igualdade pura.
--
-- É uma escolha de produto legítima — quem vende a plataforma tem de ler os
-- pedidos de suporte de quem a usa, como em qualquer SaaS — mas tem de ser
-- lida como aquilo que é: um admin da Década Ousada lê a descrição em texto
-- livre de qualquer ticket de qualquer cliente.
--
-- O buraco é estreito de propósito:
--   · `ti_tokens` NÃO o tem — o link de submissão continua estritamente por org;
--   · `ti_submissoes` NÃO o tem — a contagem de rate-limit continua por org;
--   · só leitura/gestão de tickets e sugestões atravessa a fronteira.
--
-- Consequência lateral do ponto 1, aceite: como a sequência é global, o número
-- do ticket revela a cadência de tickets das outras organizações — a org A vê
-- #14 e depois #23 e infere que foram criados 8 tickets noutro lado. É
-- metadado, não conteúdo, e é o preço de haver uma única fila de suporte.

-- ── CORRECÇÃO À RECONSTRUÇÃO (2026-08-28) ───────────────────────
--
-- Este ficheiro chegou a trazer também a numeração global (troca de
-- `set_ti_ticket_numero_por_org` por `set_ti_ticket_numero`, mais o índice
-- único). Estava mal atribuída: ao introspeccionar o schema, essa mudança já
-- lá estava e não havia como saber de que migração vinha.
--
-- Com o SQL original recuperado de `schema_migrations.statements`, sabe-se:
-- a numeração global é de `20260827151938_ti_tickets_numero_global.sql`, que
-- corre a seguir a esta. Foi movida para lá e retirada daqui, para a cadeia
-- reflectir o que aconteceu de facto.
--
-- O que fica aqui é o que o nome promete: o balcão de suporte da plataforma.

-- ── O balcão da plataforma vê todas as organizações ─────────────
-- Recriadas em vez de alteradas: o Postgres não tem ALTER POLICY que troque o
-- USING preservando o resto, e recriar deixa a condição inteira legível aqui.
DROP POLICY IF EXISTS rls_org_isolation ON public.ti_tickets;
CREATE POLICY rls_org_isolation ON public.ti_tickets
  AS RESTRICTIVE
  USING (org_id = get_current_org_id() OR is_decada_ousada_admin());

DROP POLICY IF EXISTS rls_org_isolation ON public.ti_ticket_sugestoes;
CREATE POLICY rls_org_isolation ON public.ti_ticket_sugestoes
  AS RESTRICTIVE
  USING (org_id = get_current_org_id() OR is_decada_ousada_admin());

DROP POLICY IF EXISTS ti_gestao ON public.ti_tickets;
CREATE POLICY ti_gestao ON public.ti_tickets FOR ALL
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'ti_tickets_gerir')
    OR is_decada_ousada_admin()
  );

DROP POLICY IF EXISTS ti_gestao ON public.ti_ticket_sugestoes;
CREATE POLICY ti_gestao ON public.ti_ticket_sugestoes FOR ALL
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'ti_tickets_gerir')
    OR is_decada_ousada_admin()
  );

-- `ti_tokens` fica deliberadamente de fora: o link de submissão é da
-- organização e de mais ninguém. Se um dia isto mudar, tem de ser uma decisão
-- explícita e não um alastramento acidental deste ficheiro.

COMMENT ON INDEX public.ti_tickets_numero_unico IS
  'Numeração global da plataforma (não por organização) — os tickets de TI são '
  'uma única fila de suporte. Ver 20260827113930.';
