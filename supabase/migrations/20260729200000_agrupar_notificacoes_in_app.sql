-- ============================================================
-- Agrupamento de notificações in-app — o digest, mas para o sino
-- ============================================================
-- Medido a 2026-07-29: cada pessoa da equipa recebeu ~270 notificações num
-- único dia. Não são duplicados — a multiplicação é entidades × destinatários:
--
--   "Contrato a renovar"          1806 = 86 contratos × 21 pessoas
--   "Seguro de viatura a expirar" 1672 = 88 viaturas  × 19 pessoas
--   "Inspeção (IPO) a expirar"    1596 = 84 viaturas  × 19 pessoas
--
-- Cada linha é um facto distinto, mas 88 do mesmo tipo no mesmo dia treina a
-- fechar tudo sem ler — o oposto do objectivo de um alerta.
--
-- O modo digest (20260727360000) já resolveu isto para EMAIL: agrega por
-- destinatário/dia num único envio. Ninguém fez o equivalente para o in-app.
-- Esta migração fá-lo, com a mesma forma: uma linha por (org, destinatário,
-- tipo, dia), e a lista de todas as entidades afectadas no campo `itens`.
--
-- PORQUE UM TRIGGER, E NÃO ALTERAR execute_automation_runs()
-- Há 8 funções que inserem em `notificacoes`. Alterá-las uma a uma multiplicava
-- o risco, e `execute_automation_runs()` em particular foi reescrita várias
-- vezes esta semana e está na origem de vários incidentes. Um trigger BEFORE
-- INSERT na própria tabela cobre os 8 escritores de uma vez, incluindo os que
-- vierem depois, e desfaz-se largando o trigger. É o mesmo padrão que o
-- AGENTS.md §5B documenta para o soft-delete: o trigger devolve NULL e converte
-- a operação em vez de a deixar passar.
-- Verificado antes de aplicar: nenhum dos 8 escritores usa INSERT ... RETURNING
-- (que receberia NULL e podia quebrar com o cancelamento do insert).
--
-- DUAS REGRAS DE DESENHO
-- 1. Urgentes NUNCA agrupam. Um escalonamento toca som e exige acção
--    individual; colapsá-lo esconderia o segundo alerta.
-- 2. Nada é apagado sem prova. A fusão dos dados existentes só passa se o total
--    de itens dentro dos arrays `itens` for exactamente igual ao número de
--    linhas originais. Se não bater, levanta excepção e desfaz tudo — melhor
--    garantia do que uma tabela de backup (anti-padrão que esta auditoria já
--    critica nos _backup_viaturas_20260710).
--
-- Impacto medido no preview: 5125 linhas não-resolvidas → 217. Todos os links
-- preservados, dentro do `itens`. Urgentes (7) e resolvidas (2023) intocadas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas
-- ------------------------------------------------------------
alter table public.notificacoes
  add column if not exists itens jsonb,
  add column if not exists agrupadas integer not null default 1;

comment on column public.notificacoes.itens is
  'Entidades afectadas por esta notificação agrupada, uma por elemento, cada uma com o seu link. É aqui que os links das notificações fundidas vivem — nada se perde ao agrupar.';
comment on column public.notificacoes.agrupadas is
  'Quantos avisos do mesmo tipo/dia/destinatário esta linha representa. 1 = notificação única (comportamento igual ao de antes do agrupamento).';

-- Suporta a procura do grupo do dia feita pelo trigger a cada insert.
create index if not exists idx_notificacoes_grupo_dia
  on public.notificacoes (org_id, destinatario_id, tipo, created_at)
  where resolvida = false;

-- ------------------------------------------------------------
-- 2. Fusão dos dados existentes (com asserção)
-- ------------------------------------------------------------
do $$
declare
  v_antes integer;
  v_itens integer;
  v_depois integer;
  v_soma_agrupadas integer;
begin
  select count(*) into v_antes
  from public.notificacoes
  where not resolvida and severidade <> 'urgente';

  create temp table _grupos on commit drop as
  select
    org_id, destinatario_id, tipo, created_at::date as dia,
    (array_agg(id order by created_at, id))[1] as manter_id,
    count(*)::int as n,
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'link', link,
        'viatura_id', viatura_id,
        'candidatura_id', candidatura_id,
        'evento_id', evento_id,
        'mensagem', mensagem,
        'em', created_at
      )) order by created_at, id
    ) as itens
  from public.notificacoes
  where not resolvida and severidade <> 'urgente'
  group by org_id, destinatario_id, tipo, created_at::date;

  -- Asserção 1: nenhum aviso perdido na agregação.
  select coalesce(sum(jsonb_array_length(itens)), 0) into v_itens from _grupos;
  if v_itens <> v_antes then
    raise exception 'Fusão abortada: % linhas originais mas % itens agregados. Nenhum aviso pode ser perdido.', v_antes, v_itens;
  end if;

  update public.notificacoes n
  set agrupadas = g.n, itens = g.itens
  from _grupos g
  where n.id = g.manter_id;

  delete from public.notificacoes n
  where not n.resolvida
    and n.severidade <> 'urgente'
    and not exists (select 1 from _grupos g where g.manter_id = n.id);

  -- Asserção 2: o que ficou representa exactamente o que existia.
  select count(*), coalesce(sum(agrupadas), 0) into v_depois, v_soma_agrupadas
  from public.notificacoes
  where not resolvida and severidade <> 'urgente';

  if v_soma_agrupadas <> v_antes then
    raise exception 'Fusão abortada: soma de agrupadas (%) <> linhas originais (%).', v_soma_agrupadas, v_antes;
  end if;

  raise notice 'Fusão concluída: % linhas -> % linhas (soma agrupadas = %).', v_antes, v_depois, v_soma_agrupadas;
end;
$$;

-- Notificações que já existiam ANTES desta migração e ficaram sozinhas (ou são
-- urgentes/resolvidas) não têm `itens`. Preenche-as com o seu próprio item para
-- o frontend ter sempre a mesma forma e não precisar de dois caminhos de leitura.
update public.notificacoes
set itens = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'link', link, 'viatura_id', viatura_id, 'candidatura_id', candidatura_id,
      'evento_id', evento_id, 'mensagem', mensagem, 'em', created_at
    )))
where itens is null;

-- ------------------------------------------------------------
-- 3. Trigger: agrupa os inserts futuros
-- ------------------------------------------------------------
create or replace function public.fn_notificacoes_agrupar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  v_item := jsonb_strip_nulls(jsonb_build_object(
    'link', new.link,
    'viatura_id', new.viatura_id,
    'candidatura_id', new.candidatura_id,
    'evento_id', new.evento_id,
    'mensagem', new.mensagem,
    'em', coalesce(new.created_at, now())
  ));

  -- Regra 1: urgentes nunca agrupam — cada uma fica visível por si.
  if new.severidade = 'urgente' then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Dois inserts concorrentes do mesmo grupo criariam ambos a "primeira" linha
  -- (o SELECT de baixo não encontra nada em nenhum dos dois). O lock serializa
  -- por grupo — mesmo padrão de pg_try_advisory_xact_lock já usado na fila do
  -- Via Verde. Liberta no fim da transacção, sem necessidade de unlock.
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.org_id::text, '') || '|' ||
    coalesce(new.destinatario_id::text, '') || '|' ||
    new.tipo || '|' ||
    (coalesce(new.created_at, now()))::date::text, 0));

  select id into v_id
  from public.notificacoes
  where org_id is not distinct from new.org_id
    and destinatario_id is not distinct from new.destinatario_id
    and tipo = new.tipo
    and resolvida = false
    and severidade <> 'urgente'
    and created_at >= date_trunc('day', coalesce(new.created_at, now()))
    and created_at <  date_trunc('day', coalesce(new.created_at, now())) + interval '1 day'
  order by created_at, id
  limit 1;

  -- Primeira do grupo neste dia: entra como linha normal, já com o array.
  if v_id is null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Já existe: acrescenta ao grupo e cancela este INSERT.
  update public.notificacoes
  set agrupadas = agrupadas + 1,
      itens = coalesce(itens, '[]'::jsonb) || v_item
  where id = v_id;

  return null;
end;
$$;

comment on function public.fn_notificacoes_agrupar() is
  'Agrupa notificações in-app por (org, destinatário, tipo, dia), acumulando as entidades afectadas em `itens`. Urgentes nunca agrupam. Devolve NULL para cancelar o INSERT quando o grupo do dia já existe.';

drop trigger if exists trg_notificacoes_agrupar on public.notificacoes;
create trigger trg_notificacoes_agrupar
  before insert on public.notificacoes
  for each row execute function public.fn_notificacoes_agrupar();
