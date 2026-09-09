-- ============================================================
-- O cartão de frota passa a poder ser de um CLIENTE, não só de um motorista
-- ============================================================
-- APLICADA EM PRODUÇÃO a 2026-09-09 (registada como
-- `cartao_de_frota_tambem_de_cliente`). Verificada depois de aplicar: as 6
-- colunas, as 2 restrições, as 4 funções com a assinatura nova e os grants
-- (authenticated sim, anon não). `resolver_titular_por_cartao` testada contra
-- períodos reais — devolve o motorista e cliente a NULL, como esperado enquanto
-- não houver cartões de cliente.
--
-- PORQUÊ
-- Hoje o dropdown de atribuição só mostra motoristas, mas metade da frota real
-- já está com empresas: `detentor` (texto livre) está preenchido em 807 dos 870
-- cartões, com "UrbanGo" (37), "DISTANCIA" (17), "DASPSUL"… Nenhum desses 334
-- valores distintos bate certo com um registo em `clientes`. Ou seja: atribuir
-- cartões a clientes já acontece — em texto, sem relação, sem histórico e sem
-- consumo imputado a ninguém.
--
-- Esta migração não inventa um modelo novo. Alarga o que já existe para o
-- motorista: o titular do cartão passa a ser motorista OU cliente, e o período
-- em `cartao_atribuicoes` — que é a fonte de verdade para imputar combustível —
-- passa a saber qual dos dois.
--
-- O QUE NÃO MUDA
-- O EXCLUDE contra sobreposições (é por `cartao_id`), o match pelos últimos 4
-- dígitos, o `recalcular_movimentos_do_cartao` que re-imputa o passado quando
-- se corrige uma atribuição, e as semanas marcadas para refecho. Tudo isso
-- funciona igual — só passa a haver duas colunas possíveis em vez de uma.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ (de propósito)
-- Não lança nada na conta corrente. `conta_movimentos` é um livro-razão
-- alimentado por cobranças e recibos; pôr combustível lá dentro é gerar dívida
-- ao cliente e, a seguir, documento fiscal. Aqui o consumo fica CARIMBADO no
-- cliente — a mesma forma que tem no motorista, onde `motorista_extrato_periodo`
-- soma ao vivo e nunca lança. Fechar o ciclo de facturação é passo separado, e
-- deve ser um botão explícito, não um gatilho.
--
-- ESTADO VERIFICADO ANTES DE APLICAR (2026-09-09)
--   0 cartões com motorista e cliente ao mesmo tempo
--   0 períodos em cartao_atribuicoes sem motorista
--   → as duas restrições entram sem backfill.
-- ============================================================

-- ------------------------------------------------------------
-- 1) O cartão: um titular, nunca dois
-- ------------------------------------------------------------
-- `cliente_id` já existia desde 20260528140000 — com FK e índice — mas nunca
-- teve forma de ser preenchido. Só faltava o par para a devolução e a regra.
alter table public.cartoes_frota
  add column if not exists ultimo_cliente_id uuid
    references public.clientes(id) on delete set null;

comment on column public.cartoes_frota.ultimo_cliente_id is
  'Último cliente que teve este cartão. Espelha ultimo_motorista_id.';

create index if not exists idx_cartoes_frota_ultimo_cliente
  on public.cartoes_frota (ultimo_cliente_id);

alter table public.cartoes_frota
  drop constraint if exists cartoes_frota_um_titular;
alter table public.cartoes_frota
  add constraint cartoes_frota_um_titular
    check (num_nonnulls(motorista_id, cliente_id) <= 1);

-- ------------------------------------------------------------
-- 2) O histórico: o período passa a poder ser de um cliente
-- ------------------------------------------------------------
-- `motorista_id` era NOT NULL. Deixa de ser, e a regra passa a ser "exactamente
-- um dos dois" — mais forte do que o NOT NULL que substitui: sem ela, tirar o
-- NOT NULL abria a porta a um período sem titular nenhum.
--
-- ON DELETE RESTRICT no cliente, igual ao motorista: apagar quem teve o cartão
-- não pode apagar em silêncio o registo de quem gastou o quê.
alter table public.cartao_atribuicoes
  alter column motorista_id drop not null,
  add column if not exists cliente_id uuid
    references public.clientes(id) on delete restrict;

alter table public.cartao_atribuicoes
  drop constraint if exists cartao_atribuicoes_um_titular;
alter table public.cartao_atribuicoes
  add constraint cartao_atribuicoes_um_titular
    check (num_nonnulls(motorista_id, cliente_id) = 1);

create index if not exists cartao_atribuicoes_cliente_idx
  on public.cartao_atribuicoes (cliente_id, de desc);

comment on column public.cartao_atribuicoes.cliente_id is
  'Cliente que teve o cartão neste período. Exclusivo com motorista_id.';

-- ------------------------------------------------------------
-- 3) As transacções ganham o cliente ao lado do motorista
-- ------------------------------------------------------------
-- ON DELETE SET NULL (e não RESTRICT): a transacção é um facto do fornecedor e
-- fica de pé sem titular. É o mesmo critério que `motorista_id` já tem aqui.
alter table public.bp_transacoes
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.repsol_transacoes
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.edp_transacoes
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists bp_transacoes_cliente_idx     on public.bp_transacoes (cliente_id);
create index if not exists repsol_transacoes_cliente_idx on public.repsol_transacoes (cliente_id);
create index if not exists edp_transacoes_cliente_idx    on public.edp_transacoes (cliente_id);

-- ------------------------------------------------------------
-- 4) Resolver o titular (não só o motorista) à data da transacção
-- ------------------------------------------------------------
-- Cópia fiel de `resolver_motorista_por_cartao`, com a mesma decisão de
-- desenho: dois cartões do mesmo tipo acabados nos mesmos 4 dígitos devolvem
-- NULL de propósito — imputar ao titular errado é pior do que deixar por
-- imputar. A ambiguidade anula os DOIS lados, nunca um só.
--
-- `resolver_motorista_por_cartao` fica de pé e correcta; não é removida porque
-- tem grants próprios e o custo de a manter é zero.
create or replace function public.resolver_titular_por_cartao(
  p_org_id uuid,
  p_tipo   text,
  p_numero text,
  p_data   date,
  out motorista_id uuid,
  out cliente_id   uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when count(*) = 1 then (array_agg(a.motorista_id))[1] end,
    case when count(*) = 1 then (array_agg(a.cliente_id))[1] end
  from public.cartao_atribuicoes a
  join public.cartoes_frota c on c.id = a.cartao_id
  where a.org_id = p_org_id
    and c.tipo = p_tipo
    and public.normalizar_numero_cartao(c.numero) = public.normalizar_numero_cartao(p_numero)
    and p_data >= a.de
    and (a.ate is null or p_data <= a.ate);
$$;

comment on function public.resolver_titular_por_cartao(uuid, text, text, date) is
  'Quem tinha este cartão naquela data: motorista ou cliente, nunca os dois. Ambíguo devolve os dois a NULL.';

revoke all on function public.resolver_titular_por_cartao(uuid, text, text, date) from public, anon;
grant execute on function public.resolver_titular_por_cartao(uuid, text, text, date) to authenticated;

-- ------------------------------------------------------------
-- 5) O gatilho carimba os dois campos
-- ------------------------------------------------------------
-- A guarda de sempre (uma resolução vazia não apaga o que lá está, excepto em
-- recálculo forçado) passa a valer para o PAR. O titular é uma coisa só com
-- duas colunas: escrever uma e manter a outra deixaria a linha com um motorista
-- e um cliente ao mesmo tempo — precisamente o que o ponto 1 proíbe no cartão.
create or replace function public.tg_resolver_motorista_cartao()
returns trigger
language plpgsql
as $$
declare
  v_numero text;
  r        record;
begin
  if TG_TABLE_NAME = 'bp_transacoes' then
    select bc.card_number into v_numero
    from public.bp_cartoes bc where bc.id = NEW.card_id;
  else
    v_numero := NEW.card_number;
  end if;

  select * into r from public.resolver_titular_por_cartao(
    NEW.org_id, TG_ARGV[0], v_numero, NEW.transaction_date::date
  );

  if r.motorista_id is not null
     or r.cliente_id is not null
     or TG_OP = 'INSERT'
     or public.recalculo_e_forcado() then
    NEW.motorista_id := r.motorista_id;
    NEW.cliente_id   := r.cliente_id;
  else
    NEW.motorista_id := OLD.motorista_id;
    NEW.cliente_id   := OLD.cliente_id;
  end if;

  return NEW;
end $$;

-- ------------------------------------------------------------
-- 6) A data do movimento passa a ser argumento
-- ------------------------------------------------------------
-- O diálogo de cartões sempre deixou escrever a data de entrega/devolução, mas
-- as RPC fixavam `current_date`. Ligar o formulário às RPC sem isto faria o
-- sistema aceitar a data e descartá-la em silêncio — e a data é o que decide a
-- que período pertence cada litro.
--
-- `default current_date` mantém a chamada de dois argumentos válida, mas a
-- versão antiga TEM de sair primeiro: com as duas vivas, uma chamada sem data
-- fica ambígua para o PostgREST.
--
-- A data continua a vir do servidor quando não é dada — nunca do relógio do
-- browser, que foi a razão original de a ter tirado do cliente.
drop function if exists public.atribuir_cartao_frota(uuid, uuid);
drop function if exists public.devolver_cartao_frota(uuid);

create or replace function public.atribuir_cartao_frota(
  p_cartao_id    uuid,
  p_motorista_id uuid,
  p_de           date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_tipo   text;
  v_numero text;
  v_de     date;
begin
  v_org := get_current_org_id();
  if v_org is null then
    raise exception 'Sem organização activa';
  end if;

  if not (
    is_current_user_admin()
    or has_permission(auth.uid(), 'administrativo_cartoes', 'editar')
  ) then
    raise exception 'Sem permissão para gerir cartões de frota';
  end if;

  select tipo, numero into v_tipo, v_numero
  from public.cartoes_frota
  where id = p_cartao_id and org_id = v_org
  for update;

  if not found then
    raise exception 'Cartão inexistente ou de outra organização';
  end if;

  if v_tipo not in ('bp', 'repsol', 'edp') then
    raise exception 'Tipo de cartão desconhecido: %', v_tipo;
  end if;

  if not exists (
    select 1 from public.motoristas_ativos
    where id = p_motorista_id and org_id = v_org
  ) then
    raise exception 'Motorista inexistente ou de outra organização';
  end if;

  update public.cartoes_frota
  set motorista_id = p_motorista_id,
      cliente_id   = null,
      status       = 'em_uso',
      data_entrega = coalesce(p_de, current_date)
  where id = p_cartao_id and org_id = v_org;

  update public.motoristas_ativos
  set cartao_bp     = case when v_tipo = 'bp'     then v_numero else cartao_bp end,
      cartao_repsol = case when v_tipo = 'repsol' then v_numero else cartao_repsol end,
      cartao_edp    = case when v_tipo = 'edp'    then v_numero else cartao_edp end
  where id = p_motorista_id and org_id = v_org;

  update public.cartao_atribuicoes
  set ate = coalesce(p_de, current_date)
  where cartao_id = p_cartao_id and org_id = v_org and ate is null;

  -- Nunca antes do fim do último período fechado: o EXCLUDE é sobre um
  -- intervalo fechado dos dois lados, e o dia da entrega conta para quem
  -- entregou. Uma data recuada demais é empurrada para a frente em vez de
  -- abortar a atribuição. Ver 20260827160000.
  select greatest(coalesce(max(ate) + 1, coalesce(p_de, current_date)),
                  coalesce(p_de, current_date))
    into v_de
  from public.cartao_atribuicoes
  where cartao_id = p_cartao_id and org_id = v_org;

  insert into public.cartao_atribuicoes
    (org_id, cartao_id, motorista_id, de, origem, criado_por)
  values
    (v_org, p_cartao_id, p_motorista_id, v_de, 'associacao', auth.uid());
end;
$$;

comment on function public.atribuir_cartao_frota(uuid, uuid, date) is
  'Atribui um cartão de frota a um motorista: marca o cartão em uso, grava o número na ficha (cartao_<tipo>) E abre o período em cartao_atribuicoes, numa só transacção. tipo/número vêm do cartão, não do cliente; a data omitida é a do servidor.';

-- ------------------------------------------------------------
-- 6b) Atribuir a um cliente
-- ------------------------------------------------------------
-- Gémea de `atribuir_cartao_frota`, com duas diferenças deliberadas:
--   · não mexe na ficha (`cartao_<tipo>` só existe em motoristas_ativos, e é
--     uma coluna legada de match — não se replica para o cliente);
--   · limpa `motorista_id`, porque o titular é um só.
-- Autorização e isolamento por organização escritos à mão pela razão de sempre:
-- SECURITY DEFINER ignora RLS. Se a policy de UPDATE de cartoes_frota mudar,
-- esta função tem de mudar com ela.
create or replace function public.atribuir_cartao_frota_cliente(
  p_cartao_id  uuid,
  p_cliente_id uuid,
  p_de         date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_tipo text;
  v_de   date;
begin
  v_org := get_current_org_id();
  if v_org is null then
    raise exception 'Sem organização activa';
  end if;

  if not (
    is_current_user_admin()
    or has_permission(auth.uid(), 'administrativo_cartoes', 'editar')
  ) then
    raise exception 'Sem permissão para gerir cartões de frota';
  end if;

  -- Trava a linha: duas atribuições concorrentes do mesmo cartão deixam de
  -- passar as duas.
  select tipo into v_tipo
  from public.cartoes_frota
  where id = p_cartao_id and org_id = v_org
  for update;

  if not found then
    raise exception 'Cartão inexistente ou de outra organização';
  end if;

  if v_tipo not in ('bp', 'repsol', 'edp') then
    raise exception 'Tipo de cartão desconhecido: %', v_tipo;
  end if;

  if not exists (
    select 1 from public.clientes
    where id = p_cliente_id and org_id = v_org and deleted_at is null
  ) then
    raise exception 'Cliente inexistente ou de outra organização';
  end if;

  update public.cartoes_frota
  set cliente_id   = p_cliente_id,
      motorista_id = null,
      status       = 'em_uso',
      data_entrega = coalesce(p_de, current_date)
  where id = p_cartao_id and org_id = v_org;

  -- Fecha o que tenha ficado aberto (caminhos antigos e backfill).
  update public.cartao_atribuicoes
  set ate = coalesce(p_de, current_date)
  where cartao_id = p_cartao_id and org_id = v_org and ate is null;

  -- Nunca antes do fim do último período fechado — ver a nota do EXCLUDE em
  -- `atribuir_cartao_frota`, acima.
  select greatest(coalesce(max(ate) + 1, coalesce(p_de, current_date)),
                  coalesce(p_de, current_date))
    into v_de
  from public.cartao_atribuicoes
  where cartao_id = p_cartao_id and org_id = v_org;

  insert into public.cartao_atribuicoes
    (org_id, cartao_id, cliente_id, de, origem, criado_por)
  values
    (v_org, p_cartao_id, p_cliente_id, v_de, 'associacao', auth.uid());
end;
$$;

comment on function public.atribuir_cartao_frota_cliente(uuid, uuid, date) is
  'Atribui um cartão de frota a um cliente: marca o cartão em uso E abre o período em cartao_atribuicoes, numa só transacção. Não toca na ficha do motorista.';

-- ------------------------------------------------------------
-- 7) Devolver ramifica pelo titular
-- ------------------------------------------------------------
-- Mesma assinatura de 20260827160000 — quem chama continua a passar só o
-- cartão. O que muda é que o titular já não se assume motorista.
create or replace function public.devolver_cartao_frota(
  p_cartao_id uuid,
  p_ate       date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_tipo      text;
  v_numero    text;
  v_motorista uuid;
  v_cliente   uuid;
begin
  v_org := get_current_org_id();
  if v_org is null then
    raise exception 'Sem organização activa';
  end if;

  if not (
    is_current_user_admin()
    or has_permission(auth.uid(), 'administrativo_cartoes', 'editar')
  ) then
    raise exception 'Sem permissão para gerir cartões de frota';
  end if;

  select tipo, numero, motorista_id, cliente_id
    into v_tipo, v_numero, v_motorista, v_cliente
  from public.cartoes_frota
  where id = p_cartao_id and org_id = v_org
  for update;

  if not found then
    raise exception 'Cartão inexistente ou de outra organização';
  end if;

  -- `ultimo_*` só é reescrito no ramo de quem tinha mesmo o cartão. Devolver um
  -- cartão de cliente não pode apagar a memória do último motorista, nem o
  -- contrário.
  update public.cartoes_frota
  set motorista_id        = null,
      cliente_id          = null,
      ultimo_motorista_id = case when v_motorista is not null
                                 then v_motorista else ultimo_motorista_id end,
      ultimo_cliente_id   = case when v_cliente is not null
                                 then v_cliente else ultimo_cliente_id end,
      status              = 'disponivel',
      data_devolucao      = coalesce(p_ate, current_date)
  where id = p_cartao_id and org_id = v_org;

  -- A ficha só é limpa se apontava mesmo para ESTE cartão, e só existe do lado
  -- do motorista. Se o gestor já lá tinha posto outro número à mão, devolver
  -- este não pode apagá-lo.
  if v_motorista is not null then
    update public.motoristas_ativos
    set cartao_bp = case
          when v_tipo = 'bp' and btrim(coalesce(cartao_bp, '')) = btrim(v_numero)
          then null else cartao_bp end,
        cartao_repsol = case
          when v_tipo = 'repsol' and btrim(coalesce(cartao_repsol, '')) = btrim(v_numero)
          then null else cartao_repsol end,
        cartao_edp = case
          when v_tipo = 'edp' and btrim(coalesce(cartao_edp, '')) = btrim(v_numero)
          then null else cartao_edp end
    where id = v_motorista and org_id = v_org;
  end if;

  -- Um período que ainda nem tinha começado não se fecha: apaga-se, porque não
  -- chegou a existir. Fechá-lo com `ate` anterior a `de` violaria
  -- cartao_atribuicoes_periodo_valido e abortava a devolução.
  -- (Cobre também uma data de devolução recuada para antes do início do
  -- período — `ate < de` violaria a mesma restrição.)
  delete from public.cartao_atribuicoes
  where cartao_id = p_cartao_id and org_id = v_org
    and ate is null and de > coalesce(p_ate, current_date);

  -- O que se gastou até à data continua de quem gastou — devolver não reescreve
  -- o passado.
  update public.cartao_atribuicoes
  set ate = coalesce(p_ate, current_date)
  where cartao_id = p_cartao_id and org_id = v_org and ate is null;
end;
$$;

comment on function public.devolver_cartao_frota(uuid, date) is
  'Devolve um cartão de frota seja o titular motorista ou cliente: liberta o cartão, guarda quem o tinha no ultimo_* respectivo, limpa a ficha do motorista se ela apontava para este número E fecha o período em cartao_atribuicoes — numa só transacção.';

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
-- As duas primeiras foram recriadas com assinatura nova (ponto 6): os grants da
-- versão antiga saíram com o DROP e têm de ser repostos aqui.
revoke all on function public.atribuir_cartao_frota(uuid, uuid, date) from public, anon;
revoke all on function public.atribuir_cartao_frota_cliente(uuid, uuid, date) from public, anon;
revoke all on function public.devolver_cartao_frota(uuid, date) from public, anon;
grant execute on function public.atribuir_cartao_frota(uuid, uuid, date) to authenticated;
grant execute on function public.atribuir_cartao_frota_cliente(uuid, uuid, date) to authenticated;
grant execute on function public.devolver_cartao_frota(uuid, date) to authenticated;

notify pgrst, 'reload schema';
