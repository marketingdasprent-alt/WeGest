-- ============================================================
-- O mapa event_type -> tipo deixa de ser código copiado à mão
-- ============================================================
-- Este mapa vive hoje como um CASE de 18 ramos dentro de
-- execute_automation_runs(). Essa função foi reescrita 12 vezes em 4 dias e
-- cada reescritura copia o corpo inteiro — foi assim que se perderam
-- 'recibo_anulado', 'cobranca_tvde_zero', notifications.link e o cap de emails.
-- Em dados, o mapa não pode ser perdido por uma reescrita de função.
--
-- Aqui é apenas CRIADO e passa a ser a fonte para a supressão de re-emissão
-- (migração seguinte). execute_automation_runs() continua com o seu CASE por
-- agora: substituí-lo obriga a reescrever o corpo todo, que é exactamente o
-- movimento arriscado que esta tabela existe para tornar desnecessário.
-- Fica para a Fase 3, e os dois têm de bater certo — verificado ao aplicar:
-- 18 pares no mapa, 18 ramos no CASE, zero divergências.

create table if not exists public.notificacao_tipo_map (
  event_type  text primary key,
  tipo_legado text not null,
  descricao   text
);

insert into public.notificacao_tipo_map (event_type, tipo_legado) values
  ('viatura.seguro_expirando',                  'viatura_seguro_expirando'),
  ('viatura.inspecao_expirando',                'viatura_inspecao_expirando'),
  ('viatura.extintor_expirando',                'viatura_extintor_expirando'),
  ('viatura.iuc_a_pagar',                       'viatura_iuc_a_pagar'),
  ('viatura.manutencao_preventiva_expirando',   'viatura_manutencao_preventiva_expirando'),
  ('motorista.carta_expirando',                 'motorista_carta_expirando'),
  ('motorista.licenca_tvde_expirando',          'motorista_licenca_tvde_expirando'),
  ('motorista.candidatura_parada',              'motorista_candidatura_parada'),
  ('motorista.ficha_incompleta',                'motorista_ficha_incompleta'),
  ('motorista.reparacao_cobranca',              'motorista_reparacao_cobranca'),
  ('contrato_renting.criado',                   'contrato_renting_criado'),
  ('contrato_renting.renovacao_proxima',        'contrato_renting_renovacao_proxima'),
  ('contrato_renting.sem_checkin',              'contrato_renting_sem_checkin'),
  ('cobranca.gerada',                           'cobranca_gerada'),
  ('invoice.nao_enviada_ao_cliente',            'invoice_nao_enviada_ao_cliente'),
  ('utilizador.criado',                         'utilizador_criado'),
  ('assistencia_ticket.aberto_demasiado_tempo', 'assistencia_ticket_aberto_demasiado_tempo'),
  ('seguranca.login_suspeito',                  'seguranca_login_suspeito')
on conflict (event_type) do nothing;

comment on table public.notificacao_tipo_map is
  'event_type do motor -> tipo em notificacoes. Espelha o CASE de execute_automation_runs(). Em DADOS e não em código porque esse CASE já perdeu valores em reescritas (recibo_anulado, cobranca_tvde_zero).';

alter table public.notificacao_tipo_map enable row level security;
create policy mt_notificacao_tipo_map_select on public.notificacao_tipo_map
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Link canónico de uma entidade — mesma fórmula de execute_automation_runs().
-- ------------------------------------------------------------
create or replace function public.notificacao_link_entidade(p_entity_table text, p_entity_id uuid)
returns text
language sql
immutable
as $$
  select case p_entity_table
    when 'viaturas'              then '/viaturas/' || p_entity_id::text
    when 'motoristas_ativos'     then '/motoristas/' || p_entity_id::text
    when 'contratos_renting'     then '/renting/contratos/' || p_entity_id::text
    when 'profiles'              then '/admin/utilizadores'
    when 'motorista_candidaturas'then '/motoristas/candidaturas'
    when 'assistencia_tickets'   then '/assistencia/' || p_entity_id::text
    else null
  end
$$;

comment on function public.notificacao_link_entidade(text, uuid) is
  'Rota canónica de uma entidade. Espelha o CASE de execute_automation_runs(); é a chave usada para saber se já existe aviso por resolver para a entidade.';

-- ------------------------------------------------------------
-- Índices que tornam a supressão barata
-- ------------------------------------------------------------
-- A supressão corre por cada (evento x regra) de 5 em 5 minutos: tem de ser
-- indexada, senão faz um scan das ~3800 não-resolvidas por cada verificação.
create index if not exists idx_notificacoes_abertas_org_tipo
  on public.notificacoes (org_id, tipo) where not resolvida;

-- O agrupamento guarda as entidades em `itens`; sem GIN, procurar lá dentro
-- obrigava a expandir o array de cada linha (até 117 elementos) a cada teste.
create index if not exists idx_notificacoes_itens_gin
  on public.notificacoes using gin (itens jsonb_path_ops);
