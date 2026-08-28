-- ============================================================
-- Atribuir / devolver cartão de frota numa só transacção
-- ============================================================
-- PROBLEMA
-- MotoristaCartoesFrota fazia DUAS escritas PostgREST sem transacção:
--   1. cartoes_frota   (motorista_id, status, data_entrega/devolucao)
--   2. motoristas_ativos.cartao_<tipo>  (número do cartão na ficha)
-- A ficha alimenta o match das transacções importadas (BP/Repsol/EDP). Se a
-- segunda falhasse, o cartão ficava atribuído e a ficha não — e o consumo
-- desse cartão deixava de ser imputado ao motorista, em silêncio.
--
-- O QUE ISTO CORRIGE ALÉM DA ATOMICIDADE
--  · `tipo` e `numero` passam a ser LIDOS DO CARTÃO, não enviados pelo cliente.
--    Antes, o cliente escolhia a coluna da ficha (`cartao_${tipo}`) e o valor:
--    um payload trocado escrevia o número de um cartão BP na coluna EDP.
--  · `for update` no cartão: dois gestores a atribuir o mesmo cartão ao mesmo
--    tempo deixam de passar os dois.
--  · A data passa a ser `current_date` do servidor, não o relógio do browser.
--  · Isolamento por organização explícito — SECURITY DEFINER ignora RLS, por
--    isso a verificação tem de ser escrita à mão (mesma lição de
--    20260730095826_isolar_notificacoes_e_automacao_por_org).
--
-- AUTORIZAÇÃO
-- Idêntica à policy de UPDATE de cartoes_frota:
--   is_current_user_admin() OR has_permission(uid, 'administrativo_cartoes', 'editar')
-- Se a policy mudar, estas funções têm de mudar com ela — é o preço de
-- SECURITY DEFINER, e a razão de a verificação estar escrita e comentada aqui.
--
-- PORQUE CASE E NÃO format(%I)
-- A coluna da ficha deriva de `tipo`. Construí-la com format() abriria SQL
-- dinâmico sobre um valor de dados; um CASE estático sobre as três colunas
-- conhecidas não tem essa superfície. Um `tipo` fora das três levanta excepção
-- em vez de não escrever nada em silêncio.
--
-- VERIFICADO em teste transaccional contra produção antes de ligar o frontend:
--   atribuir grava cartão E ficha · devolver liberta, guarda o último e limpa
--   a ficha · devolver NÃO apaga um número posto à mão · cartão de outra
--   organização é recusado.
--   NÃO exercitado: motorista de outra organização (a outra org não tem
--   motoristas para o caso de teste). A verificação está no código.

-- ------------------------------------------------------------
-- Atribuir
-- ------------------------------------------------------------
create or replace function public.atribuir_cartao_frota(
  p_cartao_id uuid,
  p_motorista_id uuid
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

  -- Trava a linha: sem isto, duas atribuições concorrentes do mesmo cartão
  -- passavam ambas e a última ganhava, sem ninguém saber.
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
      status       = 'em_uso',
      data_entrega = current_date
  where id = p_cartao_id and org_id = v_org;

  update public.motoristas_ativos
  set cartao_bp     = case when v_tipo = 'bp'     then v_numero else cartao_bp end,
      cartao_repsol = case when v_tipo = 'repsol' then v_numero else cartao_repsol end,
      cartao_edp    = case when v_tipo = 'edp'    then v_numero else cartao_edp end
  where id = p_motorista_id and org_id = v_org;
end;
$$;

comment on function public.atribuir_cartao_frota(uuid, uuid) is
  'Atribui um cartão de frota a um motorista: marca o cartão em uso E grava o número na ficha (cartao_<tipo>), numa só transacção. tipo/número vêm do cartão, não do cliente.';

-- ------------------------------------------------------------
-- Devolver
-- ------------------------------------------------------------
create or replace function public.devolver_cartao_frota(p_cartao_id uuid)
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

  select tipo, numero, motorista_id into v_tipo, v_numero, v_motorista
  from public.cartoes_frota
  where id = p_cartao_id and org_id = v_org
  for update;

  if not found then
    raise exception 'Cartão inexistente ou de outra organização';
  end if;

  update public.cartoes_frota
  set motorista_id        = null,
      ultimo_motorista_id = v_motorista,
      status              = 'disponivel',
      data_devolucao      = current_date
  where id = p_cartao_id and org_id = v_org;

  -- A ficha só é limpa se apontava mesmo para ESTE cartão. Se o gestor já lá
  -- tinha posto outro número à mão, devolver este não pode apagá-lo.
  -- (btrim: a comparação que o frontend fazia era `.trim()` dos dois lados.)
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
end;
$$;

comment on function public.devolver_cartao_frota(uuid) is
  'Devolve um cartão de frota: liberta o cartão, guarda quem o tinha em ultimo_motorista_id E limpa a ficha do motorista se ela apontava para este número — numa só transacção.';

-- ------------------------------------------------------------
-- Sincronizar a ficha com o cartão realmente atribuído
-- ------------------------------------------------------------
-- Não é um problema de atomicidade (é uma escrita só), mas partilha o mesmo
-- defeito de confiança: o cliente escolhia a coluna e o valor. Passa a derivar
-- os dois do cartão, pela mesma razão e no mesmo sítio.
create or replace function public.sincronizar_ficha_cartao_frota(p_cartao_id uuid)
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

  select tipo, numero, motorista_id into v_tipo, v_numero, v_motorista
  from public.cartoes_frota
  where id = p_cartao_id and org_id = v_org;

  if not found then
    raise exception 'Cartão inexistente ou de outra organização';
  end if;

  if v_motorista is null then
    raise exception 'Cartão não está atribuído a nenhum motorista';
  end if;

  if v_tipo not in ('bp', 'repsol', 'edp') then
    raise exception 'Tipo de cartão desconhecido: %', v_tipo;
  end if;

  update public.motoristas_ativos
  set cartao_bp     = case when v_tipo = 'bp'     then v_numero else cartao_bp end,
      cartao_repsol = case when v_tipo = 'repsol' then v_numero else cartao_repsol end,
      cartao_edp    = case when v_tipo = 'edp'    then v_numero else cartao_edp end
  where id = v_motorista and org_id = v_org;
end;
$$;

comment on function public.sincronizar_ficha_cartao_frota(uuid) is
  'Repõe na ficha do motorista o número do cartão que ele tem mesmo atribuído. tipo/número/destinatário vêm do cartão, não do cliente.';

-- ------------------------------------------------------------
-- Grants: chamadas pelo frontend autenticado; nunca por anon.
-- ------------------------------------------------------------
revoke all on function public.atribuir_cartao_frota(uuid, uuid) from public, anon;
revoke all on function public.devolver_cartao_frota(uuid) from public, anon;
revoke all on function public.sincronizar_ficha_cartao_frota(uuid) from public, anon;
grant execute on function public.atribuir_cartao_frota(uuid, uuid) to authenticated;
grant execute on function public.devolver_cartao_frota(uuid) to authenticated;
grant execute on function public.sincronizar_ficha_cartao_frota(uuid) to authenticated;
