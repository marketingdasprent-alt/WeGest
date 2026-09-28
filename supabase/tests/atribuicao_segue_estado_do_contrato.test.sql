-- ============================================================
-- A atribuição motorista↔viatura segue o estado do contrato — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Ticket: histórico da viatura a dizer "Encerrado" numa atribuição cujo
-- contrato está em curso (motorista_viaturas com status='encerrado' e
-- data_fim=NULL). A 20260928150000 põe fn_contrato_sincroniza_atribuicao a
-- escrever status E data_fim, a casar as duas observações dos automatismos,
-- a seguir só a linha mais recente de cada motorista na viatura, e a trigger
-- a ouvir também estado_operacional. As provas, por ordem:
--   (1) fechar o contrato (→ fechado, data_fim = agora) encerra as atribuições
--       das duas observações com essa data e liberta a viatura;
--   (2) reverter o fecho (→ em_curso, o UPDATE de patchContratoAoReverterFecho,
--       que não limpa data_fim) reactiva a atribuição e volta a ocupar a
--       viatura (esta parte já era de trg_contratos_disponibilidade);
--   (3) contrato em curso com data_fim passada → atribuição encerrada com essa
--       data; limpar a data_fim (o que a 20260924100000 fez) → as duas
--       observações voltam a ativo, sem fim;
--   (4) data_fim futura → a atribuição continua ativa e leva a data;
--   (5) um duplicado de renovação (mesmo motorista, viatura e observação,
--       início anterior, já encerrado com data) fica intacto quando a data_fim
--       do contrato é limpa; só a linha mais recente volta a ativo + NULL.
--
-- Nada depende do dia da semana: as datas são relativas a now() e a
-- comparação é feita como a trigger faz, em Europe/Lisbon. A trigger
-- trg_a_tvde_nasce_sem_data_fim desvia qualquer data_fim escrita num TVDE vivo
-- (e recusa limpar uma de legado anterior à segunda-feira corrente): nos casos
-- (3), (4) e (5) fica desligada só durante o UPDATE, como uma migração faz.
-- As atribuições entram por INSERT directo com as observações que
-- fn_contrato_condutor_liga_motorista e contrato_renting_liga_motorista_open
-- escrevem — é essa a chave que a trigger casa.
-- ============================================================

begin;
select plan(12);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d5aff', 'bootstrap@atribuicao.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000d5000', 'Org Atribuicao', 'atribuicao-a');

-- created_by: as cascatas do contrato criam eventos de calendário com
-- criado_por NOT NULL, e aqui não há auth.uid().
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d5a01', 'gestor@atribuicao.pt');

-- marca/modelo entram por id: trg_sync_viatura_marca_modelo preenche o texto
-- (e apaga o que se escrever à mão).
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d5aa1', '00000000-0000-0000-0000-0000000d5000', 'Opel');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000d5ab1', '00000000-0000-0000-0000-0000000d5000',
   '00000000-0000-0000-0000-0000000d5aa1', 'Corsa');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000000d5ae1', '00000000-0000-0000-0000-0000000d5000', 'AT-01-AA',
   '00000000-0000-0000-0000-0000000d5aa1', '00000000-0000-0000-0000-0000000d5ab1');

-- O cliente não está ligado a nenhum motorista de propósito: assim
-- contrato_renting_liga_motorista_open não resolve motorista nenhum e não
-- cria uma linha por sua conta.
insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d5ac1', '00000000-0000-0000-0000-0000000d5000', 'Cliente Atribuicao');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d5ad1', '00000000-0000-0000-0000-0000000d5000', 'Motorista Condutor'),
  ('00000000-0000-0000-0000-0000000d5ad2', '00000000-0000-0000-0000-0000000d5000', 'Motorista Aluguer');

-- reserva_id é NOT NULL; 'concluida' porque já virou contrato.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado) values
  ('00000000-0000-0000-0000-0000000d5c41', '00000000-0000-0000-0000-0000000d5000', 990001,
   now() - interval '10 days', '00000000-0000-0000-0000-0000000d5ae1',
   '00000000-0000-0000-0000-0000000d5ac1', 'concluida');

-- TVDE em curso há 10 dias, sem data_fim. codigo explícito: é a chave das
-- observações das atribuições.
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao, created_by)
values
  ('00000000-0000-0000-0000-0000000d5c01', '00000000-0000-0000-0000-0000000d5000', 990001,
   '00000000-0000-0000-0000-0000000d5c41', '00000000-0000-0000-0000-0000000d5ac1',
   '00000000-0000-0000-0000-0000000d5ae1', 'AT-01-AA', now() - interval '10 days', null,
   'em_curso', 'pendente', 'tvde', 23, false, '00000000-0000-0000-0000-0000000d5a01');

-- As duas atribuições que os automatismos escrevem, uma por motorista, com o
-- mesmo início (fn_motorista_viaturas_fecha_anteriores só fecha quem começou
-- ANTES do novo elo).
insert into public.motorista_viaturas (id, motorista_id, viatura_id, data_inicio, status, org_id, observacoes) values
  ('00000000-0000-0000-0000-0000000d5b01', '00000000-0000-0000-0000-0000000d5ad1',
   '00000000-0000-0000-0000-0000000d5ae1', (now() - interval '10 days')::date, 'ativo',
   '00000000-0000-0000-0000-0000000d5000', 'Gerado ao associar condutor ao contrato #990001'),
  ('00000000-0000-0000-0000-0000000d5b02', '00000000-0000-0000-0000-0000000d5ad2',
   '00000000-0000-0000-0000-0000000d5ae1', (now() - interval '10 days')::date, 'ativo',
   '00000000-0000-0000-0000-0000000d5000', 'Gerado automaticamente pelo contrato de aluguer #990001');

-- Lê uma atribuição como o ecrã a lê: status e fim numa só string.
create function pg_temp.atribuicao(p_id uuid) returns text language sql as $$
  select status || ' / ' || coalesce(data_fim::text, 'sem fim')
    from public.motorista_viaturas
   where id = p_id
$$;

-- ── A trigger ouve as duas colunas ─────────────────────────

select is(
  (select string_agg(a.attname, ',' order by a.attname)
     from pg_trigger t
     join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any(t.tgattr::int2[])
    where t.tgrelid = 'public.contratos_renting'::regclass
      and t.tgname = 'trg_contrato_sincroniza_atribuicao'),
  'data_fim,estado_operacional',
  'trg_contrato_sincroniza_atribuicao dispara em data_fim e em estado_operacional'
);

-- ── (1) Fechar o contrato ──────────────────────────────────

update public.contratos_renting
   set estado_operacional = 'fechado', data_fim = now(),
       updated_by = '00000000-0000-0000-0000-0000000d5a01'
 where id = '00000000-0000-0000-0000-0000000d5c01';

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b01'),
  'encerrado / ' || (now() at time zone 'Europe/Lisbon')::date::text,
  '(1) fechar o contrato encerra a atribuição "associar condutor" com a data do fecho'
);

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b02'),
  'encerrado / ' || (now() at time zone 'Europe/Lisbon')::date::text,
  '(1) e a atribuição "contrato de aluguer" também: a trigger casa as duas observações'
);

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-0000000d5ae1'),
  'disponivel',
  '(1) e a viatura fica disponível'
);

-- ── (2) Reverter o fecho ───────────────────────────────────
-- O mesmo UPDATE de patchContratoAoReverterFecho: só o estado, sem limpar
-- data_fim. A data do fecho é de hoje, por isso a atribuição volta a ativa e
-- guarda-a (a gravação seguinte do formulário TVDE limpa-a).

update public.contratos_renting
   set estado_operacional = 'em_curso',
       updated_by = '00000000-0000-0000-0000-0000000d5a01'
 where id = '00000000-0000-0000-0000-0000000d5c01';

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b01'),
  'ativo / ' || (now() at time zone 'Europe/Lisbon')::date::text,
  '(2) reverter o fecho reactiva a atribuição, com a data_fim que o contrato ainda tem'
);

select is(
  (select status from public.viaturas where id = '00000000-0000-0000-0000-0000000d5ae1'),
  'em_uso',
  '(2) e a viatura volta a ficar ocupada'
);

-- ── (3) Data de fim passada, depois limpa ──────────────────
-- Um TVDE vivo só tem data_fim por legado; a trigger de TVDE desviava-a para
-- proxima_renovacao_em. Desligada só aqui, como uma migração a escreveria.

alter table public.contratos_renting disable trigger trg_a_tvde_nasce_sem_data_fim;

update public.contratos_renting
   set data_fim = now() - interval '5 days',
       updated_by = '00000000-0000-0000-0000-0000000d5a01'
 where id = '00000000-0000-0000-0000-0000000d5c01';

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b01'),
  'encerrado / ' || ((now() - interval '5 days') at time zone 'Europe/Lisbon')::date::text,
  '(3) data_fim passada no contrato encerra a atribuição com essa data'
);

update public.contratos_renting
   set data_fim = null,
       updated_by = '00000000-0000-0000-0000-0000000d5a01'
 where id = '00000000-0000-0000-0000-0000000d5c01';

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b01'),
  'ativo / sem fim',
  '(3) limpar a data_fim de um contrato em curso reactiva a atribuição, sem fim'
);

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b02'),
  'ativo / sem fim',
  '(3) e a da observação "contrato de aluguer" também'
);

-- ── (4) Data de fim futura ─────────────────────────────────

update public.contratos_renting
   set data_fim = now() + interval '30 days',
       updated_by = '00000000-0000-0000-0000-0000000d5a01'
 where id = '00000000-0000-0000-0000-0000000d5c01';

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b01'),
  'ativo / ' || ((now() + interval '30 days') at time zone 'Europe/Lisbon')::date::text,
  '(4) data_fim futura: a atribuição continua ativa e leva a data'
);

-- ── (5) Duplicado de renovação fica quieto ─────────────────
-- A linha antiga do mesmo motorista na mesma viatura, com a mesma observação,
-- já encerrada com data (o que a reparação B deixa). Só a linha mais recente
-- segue o contrato; sem isto, limpar a data_fim punha as duas a "Presente".

insert into public.motorista_viaturas (id, motorista_id, viatura_id, data_inicio, data_fim, status, org_id, observacoes) values
  ('00000000-0000-0000-0000-0000000d5b03', '00000000-0000-0000-0000-0000000d5ad1',
   '00000000-0000-0000-0000-0000000d5ae1', (now() - interval '40 days')::date,
   (now() - interval '11 days')::date, 'encerrado',
   '00000000-0000-0000-0000-0000000d5000', 'Gerado ao associar condutor ao contrato #990001');

update public.contratos_renting
   set data_fim = null,
       updated_by = '00000000-0000-0000-0000-0000000d5a01'
 where id = '00000000-0000-0000-0000-0000000d5c01';

alter table public.contratos_renting enable trigger trg_a_tvde_nasce_sem_data_fim;

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b03'),
  'encerrado / ' || (now() - interval '11 days')::date::text,
  '(5) a linha antiga (duplicado de renovação) fica intacta: status e data_fim'
);

select is(
  pg_temp.atribuicao('00000000-0000-0000-0000-0000000d5b01'),
  'ativo / sem fim',
  '(5) e só a linha mais recente do motorista volta a ativo, sem fim'
);

select * from finish();
rollback;
