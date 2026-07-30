-- ============================================================
-- Fuga de dados anónima — 3631 linhas legíveis sem autenticação
-- ============================================================
-- Detectada e confirmada a 2026-07-29 pelo caminho real de ataque: pedidos
-- HTTP à API pública com a chave `anon` (que é pública por desenho — vem no
-- bundle do frontend). Não foi inferido do catálogo, foi reproduzido.
--
--   GET /rest/v1/uber_transactions   → 1878 linhas (750 399,64 € de receitas
--                                      de motoristas, 1365 com motorista_id)
--   GET /rest/v1/assistencia_anexos  → 1568 linhas (URLs de ficheiros)
--   GET /rest/v1/assistencia_tickets →  118 linhas (valores de reparação, nº fatura)
--   GET /rest/v1/document_templates  →   28 linhas
--   GET /rest/v1/cargos              →   22 linhas (as 5 orgs, não só a própria)
--   GET /rest/v1/organizacoes        →    5 linhas (nome, NIF, morada, telefone)
--   GET /rest/v1/empresas            →    4 linhas (NIF, sede, licença TVDE)
--
-- CAUSA RAIZ
-- A camada de isolamento multi-tenant são 139 políticas RESTRICTIVE
-- `rls_org_isolation`, e 138 delas estão declaradas `TO authenticated`. O papel
-- `anon` nunca é cruzado com `org_id = get_current_org_id()`. Logo, qualquer
-- política PERMISSIVE `USING (true)` criada `TO PUBLIC` (o default quando se
-- omite o TO) deixa de significar "leitura pública desta tabela" e passa a
-- significar "leitura anónima de todas as organizações".
--
-- O caso de `cargos` resume o problema: um utilizador autenticado vê 10 linhas
-- (a sua org, via mt_cargos_select); o anónimo via 22 (as cinco orgs). O
-- anónimo tinha MAIS acesso do que quem faz login.
--
-- PORQUE É SEGURO REMOVER
-- Todas estas tabelas já têm uma política `mt_*` correcta, org-scoped e com
-- verificação de permissão, para `authenticated`. As políticas removidas aqui
-- são resíduos anteriores a essa camada, que ficaram por cima. Nenhum
-- utilizador autenticado perde acesso — ver a nota por baixo de cada DROP.
--
-- Verificado antes de aplicar: nenhuma página pública, fluxo de token ou edge
-- function depende destas leituras (as edge functions que tocam estas tabelas
-- usam service_role, que ignora RLS e grants de anon).
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1 — resíduos com USING(true): remoção directa
-- ------------------------------------------------------------

-- Coberto por: mt_uber_transactions_all (org + can_view_financeiro()), que
-- preserva a intenção original do nome desta política, e
-- mt_uber_transactions_select (org + admin).
drop policy if exists "Financeiro pode ver transações Uber" on public.uber_transactions;

-- Coberto por: mt_assist_anexos_select (org + admin OU has_permission('assistencia_tickets')).
drop policy if exists "Acesso Total Anexos" on public.assistencia_anexos;

-- Coberto por: mt_assist_tickets_select (org + admin OU criado_por OU atribuido_a).
drop policy if exists "Acesso Total Assistencia" on public.assistencia_tickets;

-- Coberto por: mt_cargos_select (org). Fecha também a leitura cruzada entre orgs.
drop policy if exists "Todos podem ver cargos" on public.cargos;

-- Coberto por: mt_templates_select (org) e mt_templates_all. Os 10 consumidores
-- de document_templates são todos autenticados; /realizar/:token — o único que
-- parecia público — está dentro de ProtectedRoute.
drop policy if exists "Todos podem ver templates ativos" on public.document_templates;

-- Coberto por: mt_bolt_viagens_select (org + can_view_financeiro()), que preserva
-- a intenção do nome, e "Admins podem ver todas as viagens Bolt".
drop policy if exists "Financeiro pode ver todas as viagens Bolt" on public.bolt_viagens;

-- Esta era `FOR ALL`, ou seja permitia LEITURA E ESCRITA anónimas. O nome engana:
-- service_role ignora RLS por completo, nunca precisou de política nenhuma.
-- Coberto por: mt_uber_atividade_all e mt_uber_atividade_select.
drop policy if exists "Service role pode inserir atividade" on public.uber_atividade_motoristas;

-- ------------------------------------------------------------
-- PARTE 2 — empresas: substituir, não remover
-- ------------------------------------------------------------
-- `empresas_select` era `USING (true)` TO PUBLIC. Removê-la sem substituir
-- quebraria os utilizadores autenticados NÃO-admin: a única outra política de
-- leitura (`empresas_admin`) exige `user_roles.role = 'admin'`, e `user_roles` é
-- uma tabela legada com 4 linhas históricas. O único leitor da tabela é
-- src/hooks/useEmpresas.ts, que faz select('*').eq('ativo', true).
--
-- As 4 linhas existentes têm todas org_id preenchido (verificado), por isso a
-- política org-scoped não esconde nada que hoje esteja visível à própria org —
-- e fecha a leitura cruzada entre organizações.
drop policy if exists "empresas_select" on public.empresas;

create policy "empresas_select" on public.empresas
  for select
  to authenticated
  using (org_id = public.get_current_org_id());

-- ------------------------------------------------------------
-- PARTE 3 — organizacoes: manter a leitura pública, retirar-lhe o PII
-- ------------------------------------------------------------
-- Esta leitura anónima é FUNCIONALIDADE REAL e não pode ser removida: o login
-- por código de organização e o registo dependem dela. Mapeados todos os
-- caminhos anónimos, e usam exactamente 4 colunas:
--
--   src/pages/RegistarOrg.tsx      select('id')        .eq('codigo', …)
--   src/pages/Login.tsx            select('id, nome')  .eq('codigo', …).eq('ativa', true)
--   src/lib/org-codigo.ts          select('id, nome')  .eq('codigo', …).eq('ativa', true)
--     (usado por /motorista/registo, rota pública)
--
-- Nenhum caminho anónimo faz select('*'). Os consumidores que precisam das
-- colunas completas (MinhaOrganizacaoTab, OrganizacoesTab) são autenticados e
-- mantêm o grant de tabela intacto.
--
-- Em vez de mexer na política (que obrigaria a alterar frontend), restringe-se
-- o grant ao nível da coluna: o `anon` deixa de conseguir ler nif, morada,
-- telefone, logo_url, dominio_status, dominio_erro, created_at e updated_at.
revoke select on public.organizacoes from anon;
grant select (id, nome, codigo, ativa) on public.organizacoes to anon;
