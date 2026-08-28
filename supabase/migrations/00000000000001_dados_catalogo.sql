-- ============================================================================
-- DADOS DE CATÁLOGO — arranque de uma base de dados nova
-- ============================================================================
--
-- Corre logo a seguir a `00000000000000_baseline.sql`.
--
-- ── PORQUE ISTO EXISTE ──────────────────────────────────────────────────────
--
-- O baseline é `supabase db dump --schema public`: traz a ESTRUTURA e nenhum
-- dado. Isso é o que se quer para quase tudo — dados de clientes não vão para
-- o git. Mas há tabelas cujo conteúdo não é dado de cliente: é parte do
-- contrato da aplicação, e sem ele a base nasce funcional só na aparência.
--
-- Descoberto a 2026-08-28, quando os pgTAP correram contra uma base
-- reconstruída pela primeira vez:
--
--   · `recursos` vazia → nenhuma permissão existe, logo `has_permission()`
--     devolve sempre falso e todo o RBAC fica mudo. O teste
--     `automation_rules` deu por isso: «o recurso automacoes existe no
--     catálogo global» → 0.
--
--   · `automacao_execucao_manual_lock` vazia → `executar_jobs_automacao_manualmente`
--     faz `select * into v_lock … for update`, não encontra linha, e o rate
--     limit de 5 minutos nunca dispara: o botão «Correr agora» ficava sem
--     travão. O `update … where id = true` também não acertava em nada, pelo
--     que nunca se registava quem o carregou.
--
-- ── O QUE NÃO ESTÁ AQUI, DE PROPÓSITO ───────────────────────────────────────
--
-- `notification_templates` tem 100 linhas em produção e TODAS têm `org_id` —
-- são templates de cada organização, com o texto que vai para os clientes
-- delas. É conteúdo de cliente e não entra no repositório. Uma base
-- reconstruída fica sem templates de notificação, e isso é a decisão certa:
-- ver a tabela de divergências conhecidas em
-- docs/motor-automacao/reconstrucao-migracoes.md.
--
-- `recursos` entra porque NÃO tem `org_id` — é um catálogo global de nomes de
-- permissão, igual para toda a gente, e sem segredo nenhum.
-- ============================================================================

-- ── Catálogo de permissões ──────────────────────────────────────────────────
-- `on conflict do nothing`: numa base que já os tenha (produção), isto é um
-- no-op. Não há `delete` — remover um recurso é uma decisão de produto e tem
-- de ser uma migração própria, não um efeito lateral de re-semear.
insert into public.recursos (nome, descricao, categoria) values
  ('admin_campos_dinamicos', 'Gerir campos dinâmicos dos templates (catálogo)', 'Administração'),
  ('admin_configuracoes', 'Gestão de Configurações do sistema', 'Administração'),
  ('admin_convites', 'Gerir convites de colaborador e link de registo de motorista', 'Administração'),
  ('admin_documentos', 'Gestão de Templates de Documentos', 'Administração'),
  ('admin_documentos_preview', 'Pré-visualizar templates de documentos sem precisar de abrir um contrato', 'Administração'),
  ('admin_fiscal', 'Gerir definições fiscais (IVA)', 'Administração'),
  ('admin_formularios', 'Gestão de Formulários - criar, editar, deletar formulários', 'Administração'),
  ('admin_grupos', 'Gerir grupos e permissões', 'Administração'),
  ('admin_integracoes', 'Gerir integrações externas', 'Administração'),
  ('admin_minha_organizacao', 'Ver e editar os dados da organização (nome, código, logo, NIF, morada, telefone)', 'Administração'),
  ('admin_utilizadores', 'Gestão de Utilizadores - criar, editar, deletar utilizadores', 'Administração'),
  ('automacoes', 'Motor de automação e notificações', 'Administração'),
  ('administrativo_cartoes', 'Gerir cartões de frota e dispositivos OBE', 'Administrativo'),
  ('administrativo_importar', 'Importar dados das plataformas (CSV)', 'Administrativo'),
  ('administrativo_plataformas', 'Ver dados das plataformas (Bolt/Uber/BP/Repsol/EDP)', 'Administrativo'),
  ('administrativo_resumos', 'Ver resumos e contas dos motoristas', 'Administrativo'),
  ('administrativo_ver_gorjeta', 'Ver a coluna de gorjeta no resumo financeiro dos motoristas', 'Administrativo'),
  ('financeiro_recibos', 'Gestão de recibos verdes dos motoristas', 'Administrativo'),
  ('recibos_verdes_adicionar', 'Adicionar recibos verdes manualmente em nome do motorista', 'Administrativo'),
  ('assistencia_categorias', 'Gestão de categorias de assistência', 'Assistência'),
  ('assistencia_criar', 'Criar tickets de assistência', 'Assistência'),
  ('assistencia_disponivel', 'Grupo disponível para atribuição como assistente responsável nos tickets', 'Assistência'),
  ('assistencia_mecanicos', 'Gerir catálogo de mecânicos', 'Assistência'),
  ('assistencia_tickets', 'Gestão de tickets de assistência e reparações', 'Assistência'),
  ('assistencia_ver', 'Ver tickets de assistência', 'Assistência'),
  ('calendario_criar', 'Criar novos eventos', 'Calendário'),
  ('calendario_editar', 'Editar eventos existentes', 'Calendário'),
  ('calendario_eliminar', 'Eliminar eventos', 'Calendário'),
  ('calendario_exportar', 'Exportar dados do calendário (Relatórios)', 'Calendário'),
  ('calendario_gerir_todos', 'Gerir eventos de todos os gestores', 'Calendário'),
  ('calendario_recolhas', 'Aceder ao painel de recolhas pendentes de check-in', 'Calendário'),
  ('calendario_ver', 'Ver eventos do calendário', 'Calendário'),
  ('calendario_ver_gestores', 'Ver nomes dos gestores nos relatórios de eventos', 'Calendário'),
  ('contratos_criar', 'Criar novos contratos', 'Contratos'),
  ('contratos_reimprimir', 'Reimprimir contratos', 'Contratos'),
  ('contratos_reverter_reserva', 'Reverter um contrato agendado de volta a reserva', 'Contratos'),
  ('contratos_ver', 'Ver contratos', 'Contratos'),
  ('crm_campanhas', 'Gerir campanhas e tags', 'CRM'),
  ('crm_exportar', 'Exportar dados de leads', 'CRM'),
  ('crm_ver', 'Ver leads e pipeline', 'CRM'),
  ('dashboard_checkin_historico', 'Ver o histórico de check-ins no Dashboard', 'Dashboard'),
  ('marketing_ver', 'Acesso ao módulo de Marketing', 'Marketing'),
  ('motorista_painel', 'Acesso ao painel exclusivo do motorista', 'Motoristas'),
  ('motoristas_candidaturas', 'Gerir candidaturas', 'Motoristas'),
  ('motoristas_contactos', 'Gestão de Contactos', 'Motoristas'),
  ('motoristas_contratos', 'Gestão de Contratos - ver, criar, editar, reimprimir contratos', 'Motoristas'),
  ('motoristas_criar', 'Criar novos motoristas', 'Motoristas'),
  ('motoristas_crm', 'Gestão de CRM - leads e pipeline de vendas', 'Motoristas'),
  ('motoristas_editar', 'Editar dados de motoristas', 'Motoristas'),
  ('motoristas_editar_data_contrato', 'Editar a data do 1.º contrato de um motorista', 'Motoristas'),
  ('motoristas_eliminar', 'Eliminar motoristas', 'Motoristas'),
  ('motoristas_gestao', 'Gestão de Motoristas - ver, criar, editar, deletar, gerar contratos', 'Motoristas'),
  ('motoristas_ver', 'Ver lista de motoristas', 'Motoristas'),
  ('renting_clientes', 'Gestão de clientes de renting', 'Renting'),
  ('renting_contratos', 'Gestão de contratos de renting', 'Renting'),
  ('renting_movimentacoes', 'Entradas, saídas e trocas de viatura', 'Renting'),
  ('renting_reservas', 'Gestão de reservas de renting', 'Renting'),
  ('renting_ver_todos', 'Ver todos os contratos e reservas (ignora a privacidade por gestor)', 'Renting'),
  ('tickets_criar', 'Criar novos tickets', 'Tickets'),
  ('tickets_gerir', 'Gerir todos os tickets', 'Tickets'),
  ('tickets_ver', 'Ver tickets', 'Tickets'),
  ('viaturas_alterar_estado', 'Reativar viaturas inativas (mudar o Estado de "Inativo" para "Disponível")', 'Viaturas'),
  ('viaturas_criar', 'Criar novas viaturas', 'Viaturas'),
  ('viaturas_editar', 'Editar dados de viaturas', 'Viaturas'),
  ('viaturas_eliminar', 'Eliminar viaturas', 'Viaturas'),
  ('viaturas_financeiro', 'Ver dados financeiros das viaturas (rendas, custos, etc.)', 'Viaturas'),
  ('viaturas_grupos', 'Criar/editar grupos, tarifas, coberturas, extras e taxas de renting', 'Viaturas'),
  ('viaturas_imobilizar', 'Bloquear/desbloquear viaturas (imobilizador Cartrack)', 'Viaturas'),
  ('viaturas_marcas_modelos', 'Criar, editar e eliminar marcas, modelos e versões de viaturas', 'Viaturas'),
  ('viaturas_ver', 'Ver lista de viaturas', 'Viaturas')
on conflict (nome) do nothing;

-- ── Singleton do rate limit de «Correr agora» ───────────────────────────────
-- A tabela tem uma única linha, com `id = true`. `executar_jobs_automacao_manualmente`
-- conta com ela existir: sem linha, não há travão nenhum.
--
-- Semeada limpa (sem `ultima_execucao_em` nem `executado_por`) e não copiada de
-- produção: o valor real é quem carregou no botão pela última vez e quando —
-- não interessa a uma base nova e é dado de utilizador.
insert into public.automacao_execucao_manual_lock (id, ultima_execucao_em, executado_por)
values (true, null, null)
on conflict (id) do nothing;
